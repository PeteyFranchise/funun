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
import { assertDateOrdering, optionalIsoDate } from '@/lib/workspaces/date-schemas'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { createNotification } from '@/lib/notifications'

// ─── /api/workspaces/[workspaceId]/roster — propose, list, amend, end ──────
// (D-05, D-15, D-17, D-18, D-51). `workspaceId` is taken from the route's own
// path segment ONLY, exactly like app/api/workspaces/[workspaceId]/members/
// route.ts. Every mutating handler writes through the service client only
// after `requireWorkspaceAccess` + `canManageRoster` has already proved
// authority.
//
// ── THE READ GOES THROUGH A COLLAPSING DEFINER FUNCTION (R-23 / WSR-18) ──
//
// GET reads `public.workspace_roster_page` (migration 197 section (i)), NOT
// the raw `workspace_roster_relationships` table. Two reasons, and the
// second is the load-bearing one:
//
//   1. THE COLLAPSE. The function rewrites `blocked` to `refused` for the
//      workspace. Migration 183 keeps `workspace_roster_blocks` Member-
//      private precisely so a workspace can never enumerate who blocked it
//      (T-38-04-05) — but the relationship row's own `state` column said the
//      same thing out loud, and RLS IS ROW-LEVEL: Postgres cannot redact a
//      column through a policy. R-23 settles that contradiction in favour of
//      T-38-04-05. The workspace learns the Member said no, never that the
//      Member also shut the door.
//
//   2. THE POLICY NO LONGER ADMITS THE WORKSPACE TO THE RAW ROW AT ALL.
//      Migration 197 removed the owner and admin branches from
//      `workspace_roster_relationships_select`; what survives is the named
//      Member's own row plus settled `accepted`/`ended` rows for any seat.
//      So the owner/admin proposal-management surface R-12 requires is
//      served ONLY by this function, whose owner and admin disjuncts are
//      deliberately NOT state-gated and therefore still return `proposed`
//      rows. THAT DIVERGENCE BETWEEN FUNCTION AND POLICY IS INTENTIONAL AND
//      IS PINNED IN BOTH DIRECTIONS: narrowing the function to the policy's
//      two branches breaks R-12, and widening the policy back to four
//      reopens R-23. Do not harmonise them.
//
// The Member's own surface, app/api/roster/relationships/route.ts,
// DELIBERATELY DOES NOT USE THIS FUNCTION — it reads the raw table through
// the RLS client and keeps the TRUE state, because a Member must be able to
// see their own act.
//
// ── THE `end` WRITE GOES THROUGH THE TRANSACTIONAL RPC (WSR-12 / F16) ────
//
// PATCH `end` calls `public.workspace_transition_roster_relationship`
// (migration 198 section (g)) with `p_actor_side: 'workspace'`, passing the
// loaded row's state as a compare-and-set token. The RPC locks the row,
// re-derives this actor's authority from the database, mutates, and writes
// its audit row in ONE transaction — so a concurrent transition comes back
// as `'stale'` rather than overwriting somebody's terminal state.
//
// ONLY `end` IS AVAILABLE ON THIS SURFACE. A workspace may never accept,
// refuse or block on a Member's behalf: D-05 makes a proposal inert until
// the named Member affirms it, and a workspace that could accept its own
// proposal would make consent a formality. Refused at the route below and
// again inside the RPC, which permits `end` alone for `p_actor_side =
// 'workspace'`.
//
// POST AND THE AMEND PATH DELIBERATELY KEEP `logWorkspaceAction` (D-50).
// Neither is one of the consequential state changes R-06 names, neither has
// an RPC, and `logWorkspaceAction` remains exactly the right tool for that
// class. See lib/workspaces/audit.ts's header.
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
  effective_from: string | null
  terminates_on: string | null
}

// `effective_from` and `terminates_on` are DATE columns (migration 183) that
// `isWorkspaceAccessLive` and `workspace_roster_relationship_is_live()` both
// read, so they are an authorization input rather than display data. Both go
// through `lib/workspaces/date-schemas.ts` (R-14 / WSR-22) — the one place
// ISO date validation lives on the workspace surface — never a bare
// `z.string()`, which lets a malformed bound parse to NaN and read as "no
// constraint".
const ProposeRosterSchema = z
  .object({
    memberUserId: z.string().uuid(),
    professionalRole: z.string().trim().max(200).optional(),
    effectiveFrom: optionalIsoDate,
    terminatesOn: optionalIsoDate,
  })
  .strict()

// `action` is a free string rather than `z.literal('end')` ON PURPOSE. A
// literal would refuse `accept` with a generic Zod parse message, and the
// D-05 rule this surface enforces — a workspace may never accept, refuse or
// block on a Member's behalf — deserves to be stated at the route in its own
// words rather than emerge as a side effect of a schema. The explicit
// refusal is in the PATCH handler below.
const PatchRosterSchema = z
  .object({
    relationshipId: z.string().uuid(),
    action: z.string().trim().max(50).optional(),
    professional_role: z.union([z.string().trim().max(200), z.null()]).optional(),
    // `optionalIsoDate` is nullish, so an explicit null still clears a bound.
    effective_from: optionalIsoDate,
    terminates_on: optionalIsoDate,
  })
  .strict()

// ─── Pagination, in lib/workspaces/catalogue.ts's idiom ─────────────────────
// These MUST match migration 197's own
// `LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)` clamp — the SQL
// clamps because an unbounded page on a SECURITY DEFINER function is a
// denial-of-service surface, and this side clamps so a caller cannot reach
// past it from either direction. Change one and you must change the other.
//
// Declared HERE rather than imported from lib/workspaces/catalogue.ts, whose
// identically-valued constants are documented as mirroring MIGRATION 194's
// clamp. The two happen to agree today; binding this route to the
// catalogue's contract would mean a future change to 194 silently moved the
// roster page too.
const ROSTER_PAGE_MAX = 200
const ROSTER_PAGE_DEFAULT = 50

/** A non-finite or absent value takes the default rather than being
 * forwarded as `NaN`. */
function clampLimit(raw: string | null): number {
  const value = raw === null ? NaN : Number(raw)
  if (!Number.isFinite(value)) return ROSTER_PAGE_DEFAULT
  return Math.min(Math.max(Math.trunc(value), 1), ROSTER_PAGE_MAX)
}

function clampOffset(raw: string | null): number {
  const value = raw === null ? NaN : Number(raw)
  if (!Number.isFinite(value)) return 0
  return Math.max(Math.trunc(value), 0)
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
      'This roster relationship changed while you were editing. Reload the roster and try again.',
    status: 409,
  },
  forbidden: {
    error: 'Only workspace owners and admins can end a roster relationship.',
    status: 403,
  },
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

type RosterTransitionOutcome = {
  outcome: string
  relationship_id: string | null
  new_state: string | null
  audit_id: string | null
}

async function loadTargetRelationship(
  service: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  relationshipId: string
): Promise<{ row: RosterRelationshipRow | null; error?: string }> {
  const { data, error } = await service
    .from('workspace_roster_relationships')
    .select('id, workspace_id, member_user_id, state, effective_from, terminates_on')
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

  // Mirrors migration 183's own CHECK (`terminates_on > effective_from`) at
  // the API layer. It does not replace that constraint — it exists so the
  // caller gets a message naming both fields instead of a raw
  // constraint-violation string.
  const ordering = assertDateOrdering({
    start: parsed.data.effectiveFrom,
    end: parsed.data.terminatesOn,
    startLabel: 'effectiveFrom',
    endLabel: 'terminatesOn',
  })
  if (!ordering.ok) return NextResponse.json({ error: ordering.error }, { status: 400 })

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

  // DELIBERATELY STILL A `logWorkspaceAction` PATH, AND THIS IS NOT AN
  // OVERSIGHT. Proposal issuance is NOT one of the consequential state
  // changes R-06 names — it forms no authority, moves no existing row
  // through the state machine, and is inert until the named Member affirms
  // it (D-05). There is no RPC for it and there should not be one.
  // `logWorkspaceAction` remains exactly the right tool for that class; see
  // lib/workspaces/audit.ts's header for the four uses that survive.
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
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const access = await requireWorkspaceAccess(supabase, user, workspaceId)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const searchParams = new URL(request.url).searchParams

  // R-23 / T-38-04-05 / WSR-18 — THE COLLAPSING READER, NOT THE RAW TABLE.
  //
  // `public.workspace_roster_page` returns `refused` wherever the stored
  // state is `blocked`: THE WORKSPACE MUST NEVER BE ABLE TO DISTINGUISH A
  // DECLINE FROM A BLOCK. Migration 183 already keeps the blocks table
  // Member-private for that reason; the relationship row's own state column
  // was saying the same thing out loud, and a policy cannot redact a column.
  //
  // Migration 197 also REMOVED the workspace's raw-table access entirely —
  // the surviving policy admits only the named Member's own row and settled
  // `accepted`/`ended` rows — so this function is now the ONLY surface that
  // serves an owner or admin a `proposed` row. Reverting this call to a
  // `.from('workspace_roster_relationships')` read would leave the R-12
  // proposal-management surface EMPTY, not merely uncollapsed.
  //
  // Invoked on the SESSION client, never the service client: the function's
  // own `p_uid = (SELECT auth.uid())` clause means the parameter can only
  // ever name the caller, and a service-role call would return zero rows.
  //
  // The Member's own surface (app/api/roster/relationships/route.ts)
  // deliberately does NOT use this function — see this file's header.
  const { data, error } = await supabase.rpc('workspace_roster_page', {
    p_workspace_id: workspaceId,
    p_uid: access.userId,
    p_limit: clampLimit(searchParams.get('limit')),
    p_offset: clampOffset(searchParams.get('offset')),
  })

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

  // D-05, RESTATED AT THE ROUTE. `end` is the ONLY action this surface may
  // name. A workspace may never accept, refuse or block ON A MEMBER'S
  // BEHALF: a proposal is inert until the named Member affirms it, and a
  // workspace that could accept its own proposal would make consent a
  // formality. Refused here BEFORE the RPC is reached, and refused again
  // inside it — `p_actor_side = 'workspace'` permits `end` alone. Two
  // independent layers agreeing, not deduplication.
  //
  // An absent `action` is the amend path further below (professional role
  // and the two date bounds), which is a field edit, not a state transition.
  if (parsed.data.action !== undefined && parsed.data.action !== 'end') {
    return NextResponse.json(
      {
        error:
          'A workspace can only end a roster relationship. Accepting, refusing and blocking are the named Member’s decisions alone.',
      },
      { status: 403 }
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
    // The friendly pre-refusal, kept: it names the caller's role and the
    // illegal edge in words, which a `RAISE` inside the RPC cannot supply.
    // It writes nothing, and the RPC re-derives the same authority from the
    // database under the row lock.
    const endCheck = assertWorkspaceMayEnd({ callerRole: gated.role, state: target.state })
    if (!endCheck.ok) return NextResponse.json({ error: endCheck.error }, { status: endCheck.status })

    // THE ONE WRITE. Never a delete — the record persists as history (D-17),
    // and the RPC only ever moves the state. `p_actor_id` is the identity
    // `requireWorkspaceAccess` already proved; there is deliberately no
    // `p_actor_role` parameter and there never will be (R-21). The loaded
    // state travels as the compare-and-set token, so a relationship that
    // moved between this route's read and the RPC's lock comes back as
    // `'stale'` rather than overwriting somebody else's change.
    const { data: rpcData, error: rpcError } = await service
      .rpc('workspace_transition_roster_relationship', {
        p_actor_id: gated.userId,
        p_relationship_id: target.id,
        p_action: 'end',
        p_expected_state: target.state,
        p_actor_side: 'workspace',
      })
      .single()

    if (rpcError) return respondToPostgresError(rpcError as PostgresLikeError)

    const result = (rpcData as RosterTransitionOutcome | null) ?? null
    if (!result || result.outcome !== 'ok') {
      const mapped = ROSTER_TRANSITION_OUTCOMES[result?.outcome ?? ''] ?? UNRECOGNISED_OUTCOME
      return NextResponse.json({ error: mapped.error }, { status: mapped.status })
    }

    // The RPC wrote the `workspace.roster.ended` audit row itself, inside
    // the same transaction as the state change. A route-side
    // `logWorkspaceAction` beside it would be a second writer, and the stale
    // copy is where drift lives.
    const { data: updated, error: readError } = await service
      .from('workspace_roster_relationships')
      .select(ROSTER_COLUMNS)
      .eq('id', target.id)
      .maybeSingle()

    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })

    return NextResponse.json({ data: updated })
  }

  const { relationshipId: _relationshipId, action: _action, ...editableCandidate } = parsed.data
  const fields = pickRosterFields(editableCandidate)
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 })
  }

  // Same rule as the POST guard above, and the same reason: this mirrors
  // migration 183's CHECK to turn a constraint violation into a readable
  // message, not to replace the database rule. The incoming values are merged
  // OVER the stored ones first, because a request that names only one bound is
  // still capable of leaving the row's window inverted.
  const mergedStart =
    'effective_from' in fields ? (fields.effective_from as string | null) : target.effective_from
  const mergedEnd =
    'terminates_on' in fields ? (fields.terminates_on as string | null) : target.terminates_on
  const patchOrdering = assertDateOrdering({
    start: mergedStart,
    end: mergedEnd,
    startLabel: 'effective_from',
    endLabel: 'terminates_on',
  })
  if (!patchOrdering.ok) {
    return NextResponse.json({ error: patchOrdering.error }, { status: 400 })
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
