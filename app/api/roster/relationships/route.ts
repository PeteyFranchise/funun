import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'
import { logWorkspaceAction } from '@/lib/workspaces/audit'
import { isWorkspaceAccessEnabled } from '@/lib/workspaces/access-kill-switch'
import { assertCanTransition, assertMemberMayEnd, loadRelationshipTier } from '@/lib/workspaces/roster-service'
import type { RosterRelationshipState } from '@/lib/workspaces/types'

// ─── /api/roster/relationships — the Member's own roster surface ───────────
// (D-05, D-18, D-51). Deliberately OUTSIDE `/api/workspaces/**` — the Member
// must be able to see and refuse a claim naming them without ever entering
// the claiming workspace's context. Every handler is gated with
// `requireMemberApiAccount` ONLY: there is no workspace-membership gate here,
// because authorization on this surface is "this row names me", enforced by
// comparing the loaded row's `member_user_id` to the authenticated user
// before every write, backed by migration 183's own SELECT policy for reads.
//
// PATCH never deletes a relationship row — every action is a state
// transition or a block-table upsert, never a row removal, so the history
// persists (D-17). Every action logs through `logWorkspaceAction` with both
// `actorId` and `subjectMemberId` set to the acting Member, so the log is
// visible to both sides (D-50) and an ending is non-deniable in either
// direction.
//
// DEVIATION FROM THIS PLAN'S LITERAL TASK TEXT (documented per this phase's
// deviation protocol, and again in 38-07-SUMMARY.md): the plan's action
// block for the `block` branch says to set `state` to `refused`. Migration
// 183's own CHECK constraint and `lib/workspaces/roster.ts`'s
// `LEGAL_ROSTER_EDGES` both define a DISTINCT `blocked` terminal state
// reachable only from `proposed` (proposed -> accepted | refused | blocked).
// Setting `refused` here would collapse two intentionally distinct outcomes
// into one and abandon a state value the schema and the pure state machine
// both define. This route follows migration 183 (the committed schema
// contract) and sets `state` to `blocked` for the `block` action, while
// still upserting the `workspace_roster_blocks` row exactly as written.

const ROSTER_COLUMNS =
  'id, workspace_id, member_user_id, professional_role, state, effective_from, terminates_on, proposed_by, accepted_at, refused_at, ended_at, ended_by, end_reason, created_at, updated_at'

type RosterRelationshipRow = {
  id: string
  workspace_id: string
  member_user_id: string
  state: RosterRelationshipState
  effective_from: string | null
}

const PatchRelationshipSchema = z
  .object({
    relationshipId: z.string().uuid(),
    action: z.enum(['accept', 'refuse', 'block', 'end']),
  })
  .strict()

export async function GET(_request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const gate = await requireMemberApiAccount(supabase, user)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  // RLS-scoped client: migration 183's workspace_roster_relationships_select
  // policy already restricts this to rows naming the caller; the explicit
  // filter below is defense-in-depth, not the only gate.
  const { data: relationships, error } = await supabase
    .from('workspace_roster_relationships')
    .select(ROSTER_COLUMNS)
    .eq('member_user_id', gate.user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The workspaces table's own SELECT policy scopes to active workspace
  // members and its creator only — the named Member is neither, so the
  // workspace's display name/type/verification_state has to be read
  // through the service client here, after the gate above has already
  // proved this Member's own identity (gate-then-service-client, the same
  // pattern app/api/workspaces/[workspaceId]/members/route.ts uses for its
  // own RLS gap).
  const service = createServiceClient()
  const rows = await Promise.all(
    ((relationships ?? []) as Array<Record<string, unknown> & { id: string; workspace_id: string; state: RosterRelationshipState }>).map(
      async (row) => {
        const [{ data: workspaceRow }, tierResult] = await Promise.all([
          service
            .from('workspaces')
            .select('name, workspace_type, verification_state')
            .eq('id', row.workspace_id)
            .maybeSingle(),
          loadRelationshipTier(service, { relationshipId: row.id, state: row.state }),
        ])

        return {
          ...row,
          workspaceName: (workspaceRow?.name as string | undefined) ?? null,
          workspaceType: (workspaceRow?.workspace_type as string | undefined) ?? null,
          workspaceVerificationState: (workspaceRow?.verification_state as string | undefined) ?? null,
          authorityTier: tierResult.ok ? tierResult.tier : 'none',
        }
      }
    )
  )

  return NextResponse.json({ data: rows })
}

export async function PATCH(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const gate = await requireMemberApiAccount(supabase, user)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = PatchRelationshipSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()
  const { data: target, error: targetError } = await service
    .from('workspace_roster_relationships')
    .select('id, workspace_id, member_user_id, state, effective_from')
    .eq('id', parsed.data.relationshipId)
    .maybeSingle()

  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'Roster relationship not found.' }, { status: 404 })

  const row = target as RosterRelationshipRow

  // Authorization here is row ownership, not workspace membership — every
  // write path compares member_user_id to the authenticated user before
  // any mutation (T-38-07-02).
  if (row.member_user_id !== gate.user.id) {
    return NextResponse.json({ error: 'This roster relationship does not name you.' }, { status: 403 })
  }

  const nowIso = new Date().toISOString()

  // D-56/WS-31 (hotfix F7, completion): ACCEPT forms new workspace-derived
  // authority, so it stops when the platform-wide control is off. `refuse`,
  // `block` and `end` are deliberately NOT gated — those are the Member's own
  // protective actions, and D-18 makes revocation unconditional. Disabling a
  // Member's escape hatch during an incident would trap them in exactly the
  // relationship the control exists to contain.
  if (parsed.data.action === 'accept' && !(await isWorkspaceAccessEnabled(createServiceClient()))) {
    return NextResponse.json(
      { error: 'Workspace access is temporarily disabled.' },
      { status: 503 }
    )
  }

  if (parsed.data.action === 'accept') {
    const check = assertCanTransition(row.state, 'accepted')
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

    const update: Record<string, unknown> = { state: 'accepted', accepted_at: nowIso }
    if (!row.effective_from) update.effective_from = nowIso.slice(0, 10)

    const { data: updated, error: updateError } = await service
      .from('workspace_roster_relationships')
      .update(update)
      .eq('id', row.id)
      .select(ROSTER_COLUMNS)
      .single()

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    await logWorkspaceAction(service, {
      workspaceId: row.workspace_id,
      actorId: gate.user.id,
      subjectMemberId: gate.user.id,
      action: 'roster.accepted',
      targetType: 'workspace_roster_relationship',
      targetId: row.id,
      changes: { state: { before: row.state, after: 'accepted' } },
    })

    return NextResponse.json({ data: updated })
  }

  if (parsed.data.action === 'refuse') {
    const check = assertCanTransition(row.state, 'refused')
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

    const { data: updated, error: updateError } = await service
      .from('workspace_roster_relationships')
      .update({ state: 'refused', refused_at: nowIso })
      .eq('id', row.id)
      .select(ROSTER_COLUMNS)
      .single()

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    await logWorkspaceAction(service, {
      workspaceId: row.workspace_id,
      actorId: gate.user.id,
      subjectMemberId: gate.user.id,
      action: 'roster.refused',
      targetType: 'workspace_roster_relationship',
      targetId: row.id,
      changes: { state: { before: row.state, after: 'refused' } },
    })

    return NextResponse.json({ data: updated })
  }

  if (parsed.data.action === 'block') {
    // See this file's header comment: migration 183 defines a distinct
    // `blocked` terminal state, reached only from `proposed`, separate from
    // a plain `refused`.
    const check = assertCanTransition(row.state, 'blocked')
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

    const { data: updated, error: updateError } = await service
      .from('workspace_roster_relationships')
      .update({ state: 'blocked', refused_at: nowIso })
      .eq('id', row.id)
      .select(ROSTER_COLUMNS)
      .single()

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    // Upsert-and-ignore (D-51): a repeat block is a harmless no-op, matching
    // migration 183's UNIQUE (workspace_id, member_user_id) on this table.
    const { error: blockError } = await service.from('workspace_roster_blocks').upsert(
      { workspace_id: row.workspace_id, member_user_id: gate.user.id },
      { onConflict: 'workspace_id,member_user_id', ignoreDuplicates: true }
    )

    if (blockError) return NextResponse.json({ error: blockError.message }, { status: 500 })

    await logWorkspaceAction(service, {
      workspaceId: row.workspace_id,
      actorId: gate.user.id,
      subjectMemberId: gate.user.id,
      action: 'roster.blocked',
      targetType: 'workspace_roster_relationship',
      targetId: row.id,
      changes: { state: { before: row.state, after: 'blocked' } },
    })

    return NextResponse.json({ data: updated })
  }

  // action === 'end' — D-18: unconditional. No approval, no notice period,
  // no counterparty acknowledgement. The only preconditions are identity
  // (already checked above) and transition legality, both enforced inside
  // assertMemberMayEnd. Funūn must never trap someone in a disputed
  // relationship.
  const endCheck = assertMemberMayEnd({
    memberUserId: row.member_user_id,
    callerUserId: gate.user.id,
    state: row.state,
  })
  if (!endCheck.ok) return NextResponse.json({ error: endCheck.error }, { status: endCheck.status })

  const { data: updated, error: updateError } = await service
    .from('workspace_roster_relationships')
    .update({ state: 'ended', ended_at: nowIso, ended_by: gate.user.id })
    .eq('id', row.id)
    .select(ROSTER_COLUMNS)
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await logWorkspaceAction(service, {
    workspaceId: row.workspace_id,
    actorId: gate.user.id,
    subjectMemberId: gate.user.id,
    action: 'roster.ended',
    targetType: 'workspace_roster_relationship',
    targetId: row.id,
    changes: { state: { before: row.state, after: 'ended' } },
  })

  return NextResponse.json({ data: updated })
}
