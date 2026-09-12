import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireWorkspaceAccess, requireWorkspaceProjectAccess } from '@/lib/workspaces/access'
import { logWorkspaceAction } from '@/lib/workspaces/audit'
import { assertMayExercise } from '@/lib/workspaces/grant-service'
import { optionalIsoDate } from '@/lib/workspaces/date-schemas'
import { isWorkspaceAccessLive } from '@/lib/workspaces/roster'
import type { VaultProjectType } from '@/types'
import type { RosterRelationshipState } from '@/lib/workspaces/types'

// ─── /api/workspaces/[workspaceId]/projects — workspace-created projects ───
// (D-21, D-23, D-24, D-28, D-43). `workspaceId` is taken from the route's
// own path segment ONLY.
//
// A workspace-created project is born held by the SUBJECT MEMBER, never the
// caller and never the workspace (D-24). Migration 186 deliberately did NOT
// extend `vault_projects_insert_own` with a workspace branch (see that
// migration's inclusion/exclusion checklist), so no workspace-derived RLS
// path can insert a `vault_projects` row at all — this route is the single
// audited exception that writes `user_id` as the subject Member rather than
// the authenticated caller, through the service client.
//
// This is restated here rather than imported because `VALID_TYPES` in
// app/api/vault/route.ts is a route-local const, not an exported symbol —
// the two lists must not drift; if a project type is ever added to one,
// add it to the other in the same change.
const VALID_TYPES: readonly VaultProjectType[] = ['single', 'snippet', 'ep', 'album', 'unreleased']

const CreateWorkspaceProjectSchema = z
  .object({
    relationshipId: z.string().uuid(),
    title: z.string().trim().min(1),
    type: z.enum(['single', 'snippet', 'ep', 'album', 'unreleased']),
    // R-14 / WSR-22: `vault_projects.release_date` is a DATE column, so the
    // date schema applies here and not the datetime one.
    releaseDate: optionalIsoDate,
    genre: z.string().trim().optional(),
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // R-20 / WSR-29: creating a project a Member will hold is project data, so
  // this handler carries the role floor. Applied immediately after the gate
  // and before the `assertMayExercise` grant check below — the floor is a
  // role minimum and the grant check is a per-relationship authority, and
  // both must hold. The API-layer twin of the `AND m.role IN (...)` conjunct
  // on `workspace_project_permission` hop 2 (migration 197): two independent
  // layers agreeing is this repo's doctrine, and the reason WSR-17 exists.
  const access = requireWorkspaceProjectAccess(
    await requireWorkspaceAccess(supabase, user, workspaceId)
  )
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = CreateWorkspaceProjectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  if (!VALID_TYPES.includes(parsed.data.type)) {
    return NextResponse.json({ error: 'Invalid project type.' }, { status: 400 })
  }

  const { relationshipId, title, type, genre } = parsed.data
  const releaseDate = parsed.data.releaseDate ?? null

  const service = createServiceClient()

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

  const live = isWorkspaceAccessLive({
    state: relationshipRow.state,
    effectiveFrom: relationshipRow.effective_from,
    effectiveEnd: relationshipRow.terminates_on,
  })
  if (!live) {
    return NextResponse.json(
      {
        error:
          'This roster relationship is not accepted and live — an inert proposal cannot be acted on (D-05).',
      },
      { status: 409 }
    )
  }

  // Creating a project on someone's behalf is an OPERATIONAL act under D-21
  // — it produces a record the Member holds, not a consequential external
  // commitment — so `edit_metadata` (operational tier) is the permission
  // relied on here, never an authority-tier permission.
  const exercise = await assertMayExercise(service, {
    workspaceId,
    actorUserId: access.userId,
    subjectMemberId: relationshipRow.member_user_id,
    permission: 'edit_metadata',
  })
  if (!exercise.ok) {
    return NextResponse.json({ error: exercise.error }, { status: exercise.status })
  }

  // Service client REQUIRED: migration 186 deliberately did not extend
  // vault_projects_insert_own with a workspace branch, so no workspace-
  // derived RLS path can insert this row. `user_id` is set to the
  // relationship's Member, never to `access.userId` — the project is born
  // held by that Member (D-24), and no code path here assigns the caller.
  const { data: project, error: insertError } = await service
    .from('vault_projects')
    .insert({
      user_id: relationshipRow.member_user_id,
      title,
      type,
      release_date: releaseDate,
      genre: genre ?? null,
      status: 'in_progress',
      vault_readiness_score: 0,
    })
    .select('id, user_id, title, type, release_date, genre, status, vault_readiness_score, created_at')
    .single()

  if (insertError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })

  // Attached immediately, in the SAME handler — there is no window in which
  // the project exists but the workspace cannot see what it just made; no
  // transfer step, no orphan state (D-24).
  const { error: attachError } = await service.from('workspace_attachments').insert({
    workspace_id: workspaceId,
    project_id: project.id,
    relationship_id: relationshipId,
    attached_by: access.userId,
  })
  if (attachError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })

  // vault_projects has no dedicated diary table of its own (unlike `works`,
  // whose work_diary_events is a separate mechanism this route deliberately
  // does not touch). workspace_audit_log — written via logWorkspaceAction,
  // the ONE write-through audit call every workspace-context write invokes
  // — is this project's append-only record of who created it on the
  // Member's behalf, satisfying D-24's "the diary recording who created it"
  // for a table that has no diary table of its own.
  await logWorkspaceAction(service, {
    workspaceId,
    actorId: access.userId,
    subjectMemberId: relationshipRow.member_user_id,
    action: 'workspace.project.created_for_member',
    permissionReliedOn: 'edit_metadata',
    targetType: 'vault_project',
    targetId: project.id,
    changes: { title, type },
  })

  return NextResponse.json({ data: project }, { status: 201 })
}
