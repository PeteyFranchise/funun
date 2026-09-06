import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireWorkspaceAccess, requireWorkspaceRole } from '@/lib/workspaces/access'
import { logWorkspaceAction } from '@/lib/workspaces/audit'
import {
  canManageWorkspaceMembers,
  canRemoveMember,
  isLegalMembershipTransition,
  WORKSPACE_OWNER_FLOOR_MESSAGE,
} from '@/lib/workspaces/membership'
import {
  WORKSPACE_MEMBERSHIP_STATE_VALUES,
  WORKSPACE_ROLE_VALUES,
  type WorkspaceMembershipState,
  type WorkspaceRole,
} from '@/lib/workspaces/types'

// ─── /api/workspaces/[workspaceId]/members — list, re-role, suspend, remove ─
// (D-11, D-13, D-14, D-31, D-50). `workspaceId` is taken from the route's own
// path segment ONLY — every handler re-derives the caller's live membership
// from the database via requireWorkspaceAccess before touching a row, and
// never trusts a workspace id supplied in a request body (D-31). Every
// mutating handler here writes through the service client (only after the
// gate has already proved authority) and calls logWorkspaceAction with both
// the acting identity and the affected member (D-22, D-50).
//
// DELETE never deletes a workspace_members row — it sets status='removed'
// so contributions, approvals, signatures, and audit entries stay attributed
// (D-14).

const MEMBER_COLUMNS = 'id, user_id, role, status, expires_at, created_at'

type WorkspaceMemberRow = {
  id: string
  workspace_id: string
  user_id: string | null
  role: WorkspaceRole
  status: WorkspaceMembershipState
}

const PatchMemberSchema = z
  .object({
    memberId: z.string().uuid(),
    role: z.enum(WORKSPACE_ROLE_VALUES).optional(),
    status: z.enum(WORKSPACE_MEMBERSHIP_STATE_VALUES).optional(),
  })
  .strict()
  .refine(data => data.role !== undefined || data.status !== undefined, {
    message: 'Provide a role or a status to update.',
  })

const DeleteMemberSchema = z.object({ memberId: z.string().uuid() }).strict()

async function loadTargetMember(
  service: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  memberId: string
): Promise<{ row: WorkspaceMemberRow | null; error?: string }> {
  const { data, error } = await service
    .from('workspace_members')
    .select('id, workspace_id, user_id, role, status')
    .eq('id', memberId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error) return { row: null, error: error.message }
  return { row: (data as WorkspaceMemberRow | null) ?? null }
}

async function refuseIfOwnerFloorBreaks(
  service: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  target: WorkspaceMemberRow,
  actorRole: WorkspaceRole
): Promise<string | null> {
  const { count, error } = await service
    .from('workspace_members')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('role', 'owner')
    .eq('status', 'active')
    .neq('id', target.id)

  if (error) return error.message

  const check = canRemoveMember({
    actorRole,
    targetRole: target.role,
    remainingActiveOwnersAfterRemoval: count ?? 0,
  })

  return check.ok ? null : check.reason
}

// Surfaces migration 182's BEFORE trigger cleanly rather than duplicating
// its rule as the only enforcement point — the service-layer canRemoveMember
// check above is the first line of defense, this catches the trigger firing
// on a race the service-layer check missed.
function isOwnerFloorTriggerError(message: string): boolean {
  return message.includes('at least one active owner')
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const access = await requireWorkspaceAccess(supabase, user, workspaceId)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  // The gate above already proved active membership; the service client
  // reads the full roster because ordinary members (not just owner/admin)
  // may list it, which the workspace_members_select RLS policy does not by
  // itself permit.
  const service = createServiceClient()
  const { data, error } = await service
    .from('workspace_members')
    .select(MEMBER_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const access = await requireWorkspaceAccess(supabase, user, workspaceId)
  const gated = requireWorkspaceRole(
    access,
    canManageWorkspaceMembers,
    'Only owners and admins can manage workspace members.'
  )
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = PatchMemberSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  const { memberId, role, status } = parsed.data
  const service = createServiceClient()
  const { row: target, error: targetError } = await loadTargetMember(service, workspaceId, memberId)
  if (targetError) return NextResponse.json({ error: targetError }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })

  if (status !== undefined && status !== target.status) {
    if (!isLegalMembershipTransition(target.status, status)) {
      return NextResponse.json(
        { error: `Cannot move a member from ${target.status} to ${status}.` },
        { status: 400 }
      )
    }
  }

  const demotesOrDeactivatesOwner =
    target.role === 'owner' &&
    target.status === 'active' &&
    ((role !== undefined && role !== 'owner') || (status !== undefined && status !== 'active'))

  if (demotesOrDeactivatesOwner) {
    const floorError = await refuseIfOwnerFloorBreaks(service, workspaceId, target, gated.role)
    if (floorError) return NextResponse.json({ error: floorError }, { status: 409 })
  }

  const update: Record<string, unknown> = {}
  const changes: Record<string, unknown> = {}
  if (role !== undefined && role !== target.role) {
    update.role = role
    changes.role = { before: target.role, after: role }
  }
  if (status !== undefined && status !== target.status) {
    update.status = status
    changes.status = { before: target.status, after: status }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 })
  }

  const { data: updated, error: updateError } = await service
    .from('workspace_members')
    .update(update)
    .eq('id', target.id)
    .select(MEMBER_COLUMNS)
    .single()

  if (updateError) {
    if (isOwnerFloorTriggerError(updateError.message)) {
      return NextResponse.json({ error: WORKSPACE_OWNER_FLOOR_MESSAGE }, { status: 409 })
    }
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const action = 'role' in changes ? 'workspace.member.role_changed' : 'workspace.member.status_changed'
  await logWorkspaceAction(service, {
    workspaceId,
    actorId: gated.userId,
    subjectMemberId: target.user_id,
    action,
    targetType: 'workspace_member',
    targetId: target.id,
    changes,
  })

  return NextResponse.json({ data: updated })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const access = await requireWorkspaceAccess(supabase, user, workspaceId)
  const gated = requireWorkspaceRole(
    access,
    canManageWorkspaceMembers,
    'Only owners and admins can remove workspace members.'
  )
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = DeleteMemberSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'A valid memberId is required.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()
  const { row: target, error: targetError } = await loadTargetMember(
    service,
    workspaceId,
    parsed.data.memberId
  )
  if (targetError) return NextResponse.json({ error: targetError }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })

  if (target.status === 'removed') {
    return NextResponse.json({ error: 'Member has already been removed.' }, { status: 400 })
  }

  if (target.role === 'owner' && target.status === 'active') {
    const floorError = await refuseIfOwnerFloorBreaks(service, workspaceId, target, gated.role)
    if (floorError) return NextResponse.json({ error: floorError }, { status: 409 })
  }

  // Status update only — never a DELETE against workspace_members (D-14).
  const { data: updated, error: updateError } = await service
    .from('workspace_members')
    .update({ status: 'removed' })
    .eq('id', target.id)
    .select(MEMBER_COLUMNS)
    .single()

  if (updateError) {
    if (isOwnerFloorTriggerError(updateError.message)) {
      return NextResponse.json({ error: WORKSPACE_OWNER_FLOOR_MESSAGE }, { status: 409 })
    }
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  await logWorkspaceAction(service, {
    workspaceId,
    actorId: gated.userId,
    subjectMemberId: target.user_id,
    action: 'workspace.member.removed',
    targetType: 'workspace_member',
    targetId: target.id,
    changes: { status: { before: target.status, after: 'removed' } },
  })

  return NextResponse.json({ data: updated })
}
