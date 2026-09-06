import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireWorkspaceAccess, requireWorkspaceRole } from '@/lib/workspaces/access'
import { logWorkspaceAction } from '@/lib/workspaces/audit'
import { canManageRoster } from '@/lib/workspaces/membership'
import {
  assertCanPropose,
  assertWorkspaceMayEnd,
  loadRelationshipTier,
  pickRosterFields,
  ROSTER_PROPOSAL_RATE_LIMIT,
} from '@/lib/workspaces/roster-service'
import type { RosterRelationshipState } from '@/lib/workspaces/types'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { createNotification } from '@/lib/notifications'

// ─── /api/workspaces/[workspaceId]/roster — propose, list, amend, end ──────
// (D-05, D-15, D-17, D-18, D-51). `workspaceId` is taken from the route's own
// path segment ONLY, exactly like app/api/workspaces/[workspaceId]/members/
// route.ts. Every mutating handler writes through the service client only
// after `requireWorkspaceAccess` + `canManageRoster` has already proved
// authority, and every mutation calls `logWorkspaceAction` (D-50).
//
// PATCH never deletes a row — an ended relationship persists as history
// (D-17). Nothing here ever moves a relationship to any status this
// migration does not define; `document-supported` is a compute-on-read
// authority tier (`loadRelationshipTier`), never a written column.

const ROSTER_COLUMNS =
  'id, workspace_id, member_user_id, professional_role, state, effective_from, terminates_on, proposed_by, accepted_at, refused_at, ended_at, ended_by, end_reason, created_at, updated_at'

type RosterRelationshipRow = {
  id: string
  workspace_id: string
  member_user_id: string
  state: RosterRelationshipState
}

const ProposeRosterSchema = z
  .object({
    memberUserId: z.string().uuid(),
    professionalRole: z.string().trim().max(200).optional(),
    effectiveFrom: z.string().optional(),
    terminatesOn: z.string().optional(),
  })
  .strict()

const PatchRosterSchema = z
  .object({
    relationshipId: z.string().uuid(),
    action: z.literal('end').optional(),
    professional_role: z.union([z.string().trim().max(200), z.null()]).optional(),
    effective_from: z.union([z.string(), z.null()]).optional(),
    terminates_on: z.union([z.string(), z.null()]).optional(),
  })
  .strict()

async function loadTargetRelationship(
  service: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  relationshipId: string
): Promise<{ row: RosterRelationshipRow | null; error?: string }> {
  const { data, error } = await service
    .from('workspace_roster_relationships')
    .select('id, workspace_id, member_user_id, state')
    .eq('id', relationshipId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error) return { row: null, error: error.message }
  return { row: (data as RosterRelationshipRow | null) ?? null }
}

export async function POST(
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
    canManageRoster,
    'Only owners and admins can propose roster relationships.'
  )
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const limited = await checkRateLimit(`workspace-roster-propose:${workspaceId}`, {
    windowMs: ROSTER_PROPOSAL_RATE_LIMIT.windowMs,
    maxAttempts: ROSTER_PROPOSAL_RATE_LIMIT.maxAttempts,
  })
  if (limited) {
    return NextResponse.json(
      { error: 'Too many roster proposals from this workspace. Please try again later.' },
      { status: 429 }
    )
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = ProposeRosterSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()

  const eligibility = await assertCanPropose(service, {
    workspaceId,
    memberUserId: parsed.data.memberUserId,
  })
  if (!eligibility.ok) {
    return NextResponse.json({ error: eligibility.error }, { status: eligibility.status })
  }

  const { data: inserted, error: insertError } = await service
    .from('workspace_roster_relationships')
    .insert({
      workspace_id: workspaceId,
      member_user_id: parsed.data.memberUserId,
      professional_role: parsed.data.professionalRole ?? null,
      effective_from: parsed.data.effectiveFrom ?? null,
      terminates_on: parsed.data.terminatesOn ?? null,
      proposed_by: gated.userId,
    })
    .select(ROSTER_COLUMNS)
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  const { data: workspaceRow } = await service
    .from('workspaces')
    .select('name')
    .eq('id', workspaceId)
    .maybeSingle()

  await createNotification(service, {
    userId: parsed.data.memberUserId,
    type: 'workspace_roster_proposed',
    title: `${(workspaceRow?.name as string | undefined) ?? 'A workspace'} named you on their roster`,
    body: 'Review the claim and accept, refuse, or refuse and block it from your own roster page.',
    link: '/roster',
  })

  await logWorkspaceAction(service, {
    workspaceId,
    actorId: gated.userId,
    subjectMemberId: parsed.data.memberUserId,
    action: 'workspace.roster.proposed',
    targetType: 'workspace_roster_relationship',
    targetId: inserted.id,
    changes: { state: { after: 'proposed' } },
  })

  // The response carries only what the proposing workspace already
  // supplied (the inserted row) plus the Member's own public display name
  // — nothing else about the named Member is read or returned here. A
  // proposal grants no read (D-05); this route must never widen that.
  const { data: memberProfile } = await service
    .from('user_profiles')
    .select('artist_name, handle')
    .eq('id', parsed.data.memberUserId)
    .maybeSingle()

  return NextResponse.json(
    {
      data: {
        ...inserted,
        memberDisplayName: (memberProfile?.artist_name as string | null) ?? null,
        memberHandle: (memberProfile?.handle as string | null) ?? null,
      },
    },
    { status: 201 }
  )
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

  // RLS-scoped client: migration 183's workspace_roster_relationships_select
  // policy is the filter, not application code (D-05's other half — the
  // Member sees a claim naming them even while proposed; nothing here
  // widens that any further).
  const { data, error } = await supabase
    .from('workspace_roster_relationships')
    .select(ROSTER_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const service = createServiceClient()
  const rows = await Promise.all(
    ((data ?? []) as Array<{ id: string; state: RosterRelationshipState }>).map(async (row) => {
      const tierResult = await loadRelationshipTier(service, {
        relationshipId: row.id,
        state: row.state,
      })
      return { ...row, authorityTier: tierResult.ok ? tierResult.tier : 'none' }
    })
  )

  return NextResponse.json({ data: rows })
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
    canManageRoster,
    'Only owners and admins can manage roster relationships.'
  )
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = PatchRosterSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()
  const { row: target, error: targetError } = await loadTargetRelationship(
    service,
    workspaceId,
    parsed.data.relationshipId
  )
  if (targetError) return NextResponse.json({ error: targetError }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'Roster relationship not found.' }, { status: 404 })

  if (parsed.data.action === 'end') {
    const endCheck = assertWorkspaceMayEnd({ callerRole: gated.role, state: target.state })
    if (!endCheck.ok) return NextResponse.json({ error: endCheck.error }, { status: endCheck.status })

    // Never delete — the record persists as history (D-17).
    const { data: updated, error: updateError } = await service
      .from('workspace_roster_relationships')
      .update({ state: 'ended', ended_at: new Date().toISOString(), ended_by: gated.userId })
      .eq('id', target.id)
      .select(ROSTER_COLUMNS)
      .single()

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    await logWorkspaceAction(service, {
      workspaceId,
      actorId: gated.userId,
      subjectMemberId: target.member_user_id,
      action: 'workspace.roster.ended',
      targetType: 'workspace_roster_relationship',
      targetId: target.id,
      changes: { state: { before: target.state, after: 'ended' } },
    })

    return NextResponse.json({ data: updated })
  }

  const { relationshipId: _relationshipId, action: _action, ...editableCandidate } = parsed.data
  const fields = pickRosterFields(editableCandidate)
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 })
  }

  const { data: updated, error: updateError } = await service
    .from('workspace_roster_relationships')
    .update(fields)
    .eq('id', target.id)
    .select(ROSTER_COLUMNS)
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await logWorkspaceAction(service, {
    workspaceId,
    actorId: gated.userId,
    subjectMemberId: target.member_user_id,
    action: 'workspace.roster.updated',
    targetType: 'workspace_roster_relationship',
    targetId: target.id,
    changes: fields,
  })

  return NextResponse.json({ data: updated })
}
