import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import {
  requireWorkspaceAccess,
  requireWorkspaceProjectAccess,
  requireWorkspaceRole,
} from '@/lib/workspaces/access'
import { logWorkspaceAction } from '@/lib/workspaces/audit'
import { canManageRoster } from '@/lib/workspaces/membership'
import { isWorkspaceAccessLive } from '@/lib/workspaces/roster'
import { loadWorkspaceCatalogue } from '@/lib/workspaces/catalogue'
import type { RosterRelationshipState } from '@/lib/workspaces/types'

// ─── /api/workspaces/[workspaceId]/attachments — attach, list, detach ──────
// (D-05, D-23, D-25, D-26). `workspaceId` is taken from the route's own path
// segment ONLY, matching every other `/api/workspaces/[workspaceId]/**`
// route in this phase.
//
// POST refuses (never silently narrows) an attach request that the roster
// relationship does not actually cover — a workspace can only ever reach a
// project whose current custodian IS the relationship's named Member (D-23).
// Three separate preconditions gate the insert, each with its own refusal
// reason, so a future reader can tell exactly which one failed rather than
// a single generic 403.
//
// GET returns `loadWorkspaceCatalogue` (lib/workspaces/catalogue.ts) through
// the RLS-scoped client — the SAME query-over-attachments this phase's
// catalogue module implements, never a second, route-local reimplementation
// of what a workspace can see.
//
// DELETE never deletes the attachment row (D-25) — it sets `detached_at`/
// `detached_by` on the live row and stops there. It writes to
// `workspace_attachments` only; the project itself and its tracks, assets,
// documents and tool outputs are never touched by this handler. Either the
// workspace (owner/admin) or the project's own current custodian may detach
// — a Member must be able to cut a workspace off from their own project
// without asking the workspace to do it, so this is the one handler in this
// file that authorizes a caller who may not be a `workspace_members` row at
// all.

const AttachSchema = z
  .object({
    projectId: z.string().uuid(),
    relationshipId: z.string().uuid(),
  })
  .strict()

const DetachSchema = z
  .object({
    projectId: z.string().uuid(),
  })
  .strict()

type RosterRelationshipRow = {
  id: string
  workspace_id: string
  member_user_id: string
  state: RosterRelationshipState
  effective_from: string | null
  terminates_on: string | null
}

type ProjectCustodyRow = { id: string; user_id: string }

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
  // R-20 / WSR-29: the API-layer twin of the `AND m.role IN (...)` conjunct on
  // `workspace_project_permission` hop 2 (migration 197) — two independent
  // layers agreeing, this repo's doctrine, and the reason WSR-17 exists.
  // Applied FIRST because it is a role MINIMUM; `canManageRoster` below is a
  // role MAXIMUM, and both must hold.
  const gated = requireWorkspaceRole(
    requireWorkspaceProjectAccess(access),
    canManageRoster,
    'Only owners and admins can attach a project to this workspace.'
  )
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = AttachSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  const { projectId, relationshipId } = parsed.data
  const service = createServiceClient()

  // Precondition 1: the relationship must belong to THIS workspace.
  const { data: relationship, error: relationshipError } = await service
    .from('workspace_roster_relationships')
    .select('id, workspace_id, member_user_id, state, effective_from, terminates_on')
    .eq('id', relationshipId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (relationshipError) {
    return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  }
  const relationshipRow = relationship as RosterRelationshipRow | null
  if (!relationshipRow) {
    return NextResponse.json(
      { error: 'This roster relationship does not belong to this workspace.' },
      { status: 404 }
    )
  }

  // Precondition 2: the relationship must be accepted AND live — an inert
  // proposal can never be attached against (D-05).
  const live = isWorkspaceAccessLive({
    state: relationshipRow.state,
    effectiveFrom: relationshipRow.effective_from,
    effectiveEnd: relationshipRow.terminates_on,
  })
  if (!live) {
    return NextResponse.json(
      {
        error:
          'This roster relationship is not accepted and live — an inert proposal cannot be attached against (D-05).',
      },
      { status: 409 }
    )
  }

  // Precondition 3: the project's CURRENT custodian must equal the
  // relationship's named Member — a workspace cannot attach a project the
  // relationship does not cover.
  const { data: project, error: projectError } = await service
    .from('vault_projects')
    .select('id, user_id')
    .eq('id', projectId)
    .maybeSingle()

  if (projectError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  const projectRow = project as ProjectCustodyRow | null
  if (!projectRow) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
  }
  if (projectRow.user_id !== relationshipRow.member_user_id) {
    return NextResponse.json(
      {
        error:
          "This roster relationship does not cover this project's current custodian — a workspace cannot attach a project the relationship does not name.",
      },
      { status: 403 }
    )
  }

  // Idempotent via the partial unique index on (workspace_id, project_id)
  // WHERE detached_at IS NULL — a unique violation here means the live
  // attachment already exists, which this route treats as success.
  const { error: insertError } = await service.from('workspace_attachments').insert({
    workspace_id: workspaceId,
    project_id: projectId,
    relationship_id: relationshipId,
    attached_by: gated.userId,
  })

  if (insertError && insertError.code !== '23505') {
    return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  }

  await logWorkspaceAction(service, {
    workspaceId,
    actorId: gated.userId,
    subjectMemberId: relationshipRow.member_user_id,
    action: 'workspace.project.attached',
    targetType: 'workspace_attachment',
    targetId: projectId,
    changes: { relationshipId },
  })

  return NextResponse.json({ data: { projectId, relationshipId } }, { status: 201 })
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

  // R-20 / WSR-29: `loadWorkspaceCatalogue` reads a Member's attached
  // projects, so this GET is project data and carries the floor. The
  // API-layer twin of the `AND m.role IN (...)` conjunct on
  // `workspace_project_permission` hop 2 (migration 197) — two independent
  // layers agreeing, this repo's doctrine, and the reason WSR-17 exists.
  const access = requireWorkspaceProjectAccess(
    await requireWorkspaceAccess(supabase, user, workspaceId)
  )
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const entries = await loadWorkspaceCatalogue(supabase, {
    workspaceId,
    actorUserId: access.userId,
  })

  return NextResponse.json({ data: entries })
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

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = DetachSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  const { projectId } = parsed.data
  const service = createServiceClient()

  const { data: attachment, error: attachmentError } = await service
    .from('workspace_attachments')
    .select('id, project_id, vault_projects (user_id)')
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .is('detached_at', null)
    .maybeSingle()

  if (attachmentError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!attachment) {
    return NextResponse.json(
      { error: 'No live attachment found for this project in this workspace.' },
      { status: 404 }
    )
  }

  const attachmentRow = attachment as {
    id: string
    project_id: string
    vault_projects: { user_id: string } | { user_id: string }[] | null
  }
  const projectHolder = Array.isArray(attachmentRow.vault_projects)
    ? (attachmentRow.vault_projects[0] ?? null)
    : attachmentRow.vault_projects
  const custodianUserId = projectHolder?.user_id ?? null

  // Either the project's own current custodian, or a workspace owner/admin,
  // may detach — a Member must be able to cut a workspace off from their
  // own project without asking the workspace to do it.
  const isCustodian = custodianUserId !== null && custodianUserId === user.id
  if (!isCustodian) {
    // R-20 / WSR-29, on the WORKSPACE-DERIVED branch only. Detaching a
    // Member's project is project data by any reading, so a guest seat cannot
    // reach it. The custodian branch above is untouched: that authority comes
    // from holding the project, not from a workspace seat, so a Member who
    // happens to hold a guest seat can still cut a workspace off from their
    // own project. The API-layer twin of the `AND m.role IN (...)` conjunct on
    // `workspace_project_permission` hop 2 (migration 197). Floor first (a
    // role minimum), existing gate second (a role maximum); both must hold.
    const access = await requireWorkspaceAccess(supabase, user, workspaceId)
    const gated = requireWorkspaceRole(
      requireWorkspaceProjectAccess(access),
      canManageRoster,
      'Only the project custodian or an owner/admin of this workspace can detach a project.'
    )
    if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })
  }

  // D-25: detachment severs the link only. Nothing moves, copies, or is
  // deleted — the project, its tracks, its assets, its documents and its
  // tool outputs are never touched here. The row itself is never deleted
  // either; it persists as history.
  const { error: updateError } = await service
    .from('workspace_attachments')
    .update({ detached_at: new Date().toISOString(), detached_by: user.id })
    .eq('id', attachmentRow.id)

  if (updateError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })

  await logWorkspaceAction(service, {
    workspaceId,
    actorId: user.id,
    subjectMemberId: custodianUserId,
    action: 'workspace.project.detached',
    targetType: 'workspace_attachment',
    targetId: projectId,
    changes: {},
  })

  return NextResponse.json({ data: { projectId, detached: true } })
}
