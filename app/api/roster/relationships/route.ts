import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'
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
// ── ONE WRITER FOR ALL FOUR ACTIONS (R-06 / WSR-12 / F16) ────────────────
//
// `public.workspace_transition_roster_relationship` (migration 198 section
// (g)) is the SINGLE writer for accept, refuse, block and end. It locks the
// row, revalidates every precondition against the LOCKED copy, mutates, and
// writes the audit row IN ONE TRANSACTION.
//
// WHAT THAT REPLACED, AND WHY IT HAD TO GO. Every branch used to read the
// row, check legality against what it read, then issue
// `.update({state}).eq('id', row.id)` — with NO `.eq('state', row.state)`
// anywhere in this file. Two concurrent PATCHes could both read `proposed`,
// both pass the legality check, and the loser could overwrite the winner's
// TERMINAL state. An `accept` landing on top of a `block` is the shape that
// matters: it hands a workspace the relationship the Member just refused.
// `p_expected_state` now travels from the loaded row as a compare-and-set
// token and the RPC returns `'stale'` instead.
//
// THE BLOCK SIDE EFFECT NOW TRAVELS WITH THE STATE CHANGE. The
// `workspace_roster_blocks` upsert used to be a SEPARATE write issued after
// the state update had already committed. A crash between the two left a
// `blocked` relationship with NO block row — and `assertCanPropose` reads the
// BLOCK TABLE, not the relationship state, so the workspace would then have
// been permitted to re-propose to a Member who had just blocked it. That is
// D-51's control silently not existing. The upsert is inside the RPC's
// transaction now, and this route no longer references that table at all.
//
// NO ROUTE-SIDE `logWorkspaceAction` REMAINS HERE. The RPC writes the audit
// row itself, using the SAME action strings this route used to emit
// (`roster.accepted`, `roster.refused`, `roster.blocked`, `roster.ended`), so
// the trail stays continuous. A route-side audit write beside the RPC's would
// be a second writer, and the stale copy is where drift lives.
//
// PATCH never deletes a relationship row — every action is a state
// transition, never a row removal, so the history persists (D-17).
//
// DEVIATION FROM THE ORIGINAL PLAN'S LITERAL TASK TEXT (documented per this
// phase's deviation protocol, and again in 38-07-SUMMARY.md): that plan's
// action block for the `block` branch said to set `state` to `refused`.
// Migration 183's own CHECK constraint and `lib/workspaces/roster.ts`'s
// `LEGAL_ROSTER_EDGES` both define a DISTINCT `blocked` terminal state
// reachable only from `proposed` (proposed -> accepted | refused | blocked).
// Setting `refused` here would collapse two intentionally distinct outcomes
// into one and abandon a state value the schema and the pure state machine
// both define. This route follows migration 183 (the committed schema
// contract) and asks for `blocked`.
//
// R-23 RESOLVED THAT DEVIATION AT THE WORKSPACE-FACING **READ**, NOT AT THE
// WRITE. `blocked` stays a real, distinct, written state; migration 197's
// `public.workspace_roster_page` collapses it to `refused` for the workspace
// only. So the workspace cannot distinguish a decline from a block
// (T-38-04-05) while the Member's own view below keeps the truth.

const ROSTER_COLUMNS =
  'id, workspace_id, member_user_id, professional_role, state, effective_from, terminates_on, proposed_by, accepted_at, refused_at, ended_at, ended_by, end_reason, created_at, updated_at'

type RosterRelationshipRow = {
  id: string
  workspace_id: string
  member_user_id: string
  state: RosterRelationshipState
  effective_from: string | null
}

type RosterTransitionAction = 'accept' | 'refuse' | 'block' | 'end'

type RosterTransitionOutcome = {
  outcome: string
  relationship_id: string | null
  new_state: string | null
  audit_id: string | null
}

const PatchRelationshipSchema = z
  .object({
    relationshipId: z.string().uuid(),
    action: z.enum(['accept', 'refuse', 'block', 'end']),
  })
  .strict()

// The state each action asks the machine to reach. Used ONLY to produce the
// friendly pre-refusal below; the RPC derives the same mapping itself and
// never trusts this one.
const TARGET_STATE_BY_ACTION: Record<RosterTransitionAction, RosterRelationshipState> = {
  accept: 'accepted',
  refuse: 'refused',
  block: 'blocked',
  end: 'ended',
}

// ─── Outcome → HTTP, in the shape of ────────────────────────────────────────
// `app/api/workspaces/[workspaceId]/members/route.ts`: a
// `Record<string, { error, status }>` with a fallback for a code this route
// does not recognise, so an unmapped outcome degrades to a 400 with a
// sentence rather than a 500 with a stack trace.
//
// The vocabulary below is migration 198 section (g)'s, in full:
// ok, not_found, stale, forbidden, illegal_transition.
const ROSTER_TRANSITION_OUTCOMES: Record<string, { error: string; status: number }> = {
  not_found: { error: 'Roster relationship not found.', status: 404 },
  stale: {
    error:
      'This roster relationship changed while you were deciding. Reload your roster and try again.',
    status: 409,
  },
  forbidden: { error: 'This roster relationship does not name you.', status: 403 },
  illegal_transition: {
    error: 'That is not a legal move for this relationship’s current state.',
    status: 400,
  },
}

const UNRECOGNISED_OUTCOME = {
  error: 'That change to this roster relationship could not be applied.',
  status: 400,
}

// ─── Postgres error code → response ─────────────────────────────────────────
// Migration 198 sets `SET LOCAL lock_timeout = '3s'` in every RPC precisely so
// that a blocked row lock becomes a bounded, retryable failure rather than a
// hung request. `55P03` (lock not available) is that timeout arriving, and
// `40P01` (deadlock detected) is the other bounded outcome; both mean "nothing
// was written, ask again", which is a 409 the caller can act on — never a 500.
type PostgresLikeError = { message: string; code?: string }

const RETRYABLE_LOCK_CODES: ReadonlySet<string> = new Set(['40P01', '55P03'])

const LOCK_CONTENTION_MESSAGE =
  'This roster relationship was being changed by someone else. Nothing was saved — please try again.'

function respondToPostgresError(error: PostgresLikeError): NextResponse {
  if (error.code && RETRYABLE_LOCK_CODES.has(error.code)) {
    return NextResponse.json({ error: LOCK_CONTENTION_MESSAGE }, { status: 409 })
  }
  return NextResponse.json({ error: error.message }, { status: 500 })
}

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
  //
  // R-23 — THIS SURFACE DELIBERATELY READS THE RAW TABLE AND KEEPS THE TRUE
  // STATE, INCLUDING `blocked`. The collapse is a WORKSPACE-FACING read
  // concern (T-38-04-05: a workspace must never enumerate who blocked it),
  // implemented in migration 197's `public.workspace_roster_page` and used by
  // app/api/workspaces/[workspaceId]/roster/route.ts. Pointing THIS reader at
  // that function would hide a Member's own block from the Member, which is
  // their own record of their own act — the exact opposite of the control's
  // purpose. Do not "harmonise" the two readers.
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

  const action: RosterTransitionAction = parsed.data.action

  const service = createServiceClient()

  // A read, kept: it produces the friendly pre-refusals this route can make
  // cheaply (not found, "this row does not name you", an illegal edge named
  // in words) before the RPC is reached, and it supplies the compare-and-set
  // token the RPC checks against the LOCKED row. It writes nothing.
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
  // any mutation (T-38-07-02). The RPC re-derives the same fact under the
  // lock and returns `'forbidden'`; this check exists so the common case
  // never reaches the database at all.
  if (row.member_user_id !== gate.user.id) {
    return NextResponse.json({ error: 'This roster relationship does not name you.' }, { status: 403 })
  }

  // D-56/WS-31 (hotfix F7, completion): ACCEPT forms new workspace-derived
  // authority, so it stops when the platform-wide control is off. `refuse`,
  // `block` and `end` are deliberately NOT gated — those are the Member's own
  // protective actions, and D-18 makes revocation unconditional. Disabling a
  // Member's escape hatch during an incident would trap them in exactly the
  // relationship the control exists to contain.
  //
  // THE RPC IMPLEMENTS THE SAME ASYMMETRY, AND NEITHER LAYER IS REDUNDANT.
  // Migration 198 section (g) consults `workspace_access_enabled()` inside
  // its `accept` branch only, and its suite asserts that placement by source
  // offset. This layer produces the 503 with a sentence a caller can act on;
  // that layer makes the rule non-bypassable for any future caller of the
  // RPC. Two independent layers agreeing is this repo's doctrine (078, 136,
  // 187, 190, 192, 196), never deduplication — and BOTH gate `accept` ONLY.
  if (action === 'accept' && !(await isWorkspaceAccessEnabled(service))) {
    return NextResponse.json(
      { error: 'Workspace access is temporarily disabled.' },
      { status: 503 }
    )
  }

  // The friendly pre-refusal. `assertMemberMayEnd` is the `end` path's
  // version of it — identity plus legality, with no approval, no notice
  // period and no counterparty acknowledgement (D-18). Both delegate to the
  // pure state machine, and both produce a sentence naming the illegal edge
  // that a `RAISE` inside the RPC cannot supply.
  const precheck =
    action === 'end'
      ? assertMemberMayEnd({
          memberUserId: row.member_user_id,
          callerUserId: gate.user.id,
          state: row.state,
        })
      : assertCanTransition(row.state, TARGET_STATE_BY_ACTION[action])

  if (!precheck.ok) {
    return NextResponse.json({ error: precheck.error }, { status: precheck.status })
  }

  // THE ONE WRITE. `p_actor_id` is the identity `requireMemberApiAccount`
  // already proved; the RPC re-derives this actor's authority itself by
  // comparing it to the LOCKED row's own `member_user_id`, and accepts no
  // authority parameter (R-21). `p_actor_side` names the CALLING SURFACE and
  // is never an authority claim — it selects which check runs inside the RPC
  // and never substitutes for one.
  const { data: rpcData, error: rpcError } = await service
    .rpc('workspace_transition_roster_relationship', {
      p_actor_id: gate.user.id,
      p_relationship_id: row.id,
      p_action: action,
      p_expected_state: row.state,
      p_actor_side: 'member',
    })
    .single()

  if (rpcError) return respondToPostgresError(rpcError as PostgresLikeError)

  const result = (rpcData as RosterTransitionOutcome | null) ?? null
  if (!result || result.outcome !== 'ok') {
    const mapped = ROSTER_TRANSITION_OUTCOMES[result?.outcome ?? ''] ?? UNRECOGNISED_OUTCOME
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  const { data: updated, error: readError } = await service
    .from('workspace_roster_relationships')
    .select(ROSTER_COLUMNS)
    .eq('id', row.id)
    .maybeSingle()

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })

  return NextResponse.json({ data: updated })
}
