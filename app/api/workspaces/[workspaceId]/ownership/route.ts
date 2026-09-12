import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireWorkspaceAccess, requireWorkspaceRole } from '@/lib/workspaces/access'
import { canManageOwners } from '@/lib/workspaces/membership'
import {
  assertMayNominate,
  assertMayRespond,
  describeOwnershipTransferEffect,
  isLegalOwnershipTransition,
  type OwnershipResponseAction,
  type OwnershipTransferState,
} from '@/lib/workspaces/ownership-transfer'
import type { WorkspaceRole } from '@/lib/workspaces/types'

// ─── /api/workspaces/[workspaceId]/ownership — nominate, list, respond ──────
//         (R-05, R-22, WSR-07, WSR-08)
//
// Workspace ownership moves ONLY as a two-sided act: the incumbent owner
// NOMINATES a successor, and the named successor ACCEPTS. Never unilateral.
// The nomination row in `workspace_ownership_transfers` (migration 197
// section (a)) is the permanent diary of that negotiation, and it is moved to
// its terminal `accepted` state in the SAME transaction that rewrites the two
// `workspace_members` rows.
//
// R-22 SETTLES THE SEMANTICS AND THEY ARE NOT RE-OPENABLE HERE: accepting
// TRANSFERS ownership. The successor is promoted to `owner` and the nominator
// is demoted to `admin`. Accepting does NOT add a second owner. A workspace
// with two founders who want "add an owner" needs a different RPC with a
// different authority rule; that is deliberately a later phase's problem and
// must not be grown out of this route.
//
// THE WORKSPACE ID COMES FROM THE PATH SEGMENT ONLY (D-31), which is the
// reason this route lives here rather than anywhere else: `requireWorkspaceAccess`
// applies from the segment, so every handler below re-derives the caller's
// live membership from the database before anything else happens.
//
// THE DELIBERATE ASYMMETRY WITH CUSTODY. `app/api/vault/custody-transfers/route.ts`
// is the same two-sided shape one level down, and it lives deliberately
// OUTSIDE `/api/workspaces/**`: custody is a MEMBER act carrying no workspace
// authority at all — after the F1 hotfix that route has no workspace lookup to
// prove authority through, and the D-56/WS-31 kill switch has nothing to gate
// there. Workspace ownership is the exact opposite. It is entirely a workspace
// act, it is the broadest authority the workspace model grants, and it must be
// behind the workspace gate and the kill switch. Hence: inside.
//
// THE ENFORCEMENT POINTS, in the order a request meets them:
//   FIRST  — this route's gates. `requireWorkspaceAccess` (live membership,
//            staff-identity refusal, D-56 kill switch), then
//            `requireWorkspaceRole(access, canManageOwners, ...)` on POST
//            only, then the strict Zod schema behind an explicit field
//            allowlist.
//   SECOND — the pure predicates in `lib/workspaces/ownership-transfer.ts`:
//            `assertMayNominate`, `assertMayRespond` and
//            `isLegalOwnershipTransition`. They produce the friendly,
//            pre-write sentence a `RAISE` cannot phrase, and they bite BEFORE
//            the RPC is called.
//   THIRD  — the RPC's own post-lock checks (migration 198 sections (d) and
//            (e)), which re-derive the actor's AUTHORITY from the database
//            while holding the row lock, and return named outcome codes.
//   FOURTH — migration 197's structural layer: the two CHECK constraints
//            (`from_user_id <> to_user_id`, `offered_by <> to_user_id`), the
//            partial unique index for one live offer per workspace,
//            `guard_ownership_nomination_by_active_owner`, and
//            `guard_ownership_transfer_transition`.
// All four are kept deliberately. Two independent layers agreeing is this
// repo's doctrine (migrations 078, 136, 187, 190, 192, 196), not duplication
// to be collapsed.
//
// R-21 OPTION A. Every RPC call below passes `p_actor_id` — the identity this
// route has ALREADY PROVED — and nothing else about the caller. No role is
// ever passed; the RPC re-derives authority itself and has no role parameter.
//
// NO ROUTE-SIDE AUDIT WRITE APPEARS ANYWHERE IN THIS FILE. Both RPCs write
// their own audit rows inside the same transaction as the mutation, including
// for every authority refusal (R-26). A route-side audit write beside them
// would be a second writer.

const TRANSFER_COLUMNS =
  'id, workspace_id, from_user_id, to_user_id, offered_by, state, responded_at, created_at'

type TransferRow = {
  id: string
  workspace_id: string
  from_user_id: string
  to_user_id: string
  offered_by: string
  state: OwnershipTransferState
}

type NominateOutcome = {
  outcome: string
  transfer_id: string | null
  audit_id: string | null
}

type RespondOutcome = {
  outcome: string
  transfer_id: string | null
  workspace_id: string | null
  audit_id: string | null
}

// ─── Mass-assignment allowlists, applied BEFORE validation ──────────────────
// The house `pick*Fields` idiom (`pickCreateFields` in app/api/workspaces/route.ts,
// `pickRosterFields` in lib/workspaces/roster-service.ts). Independent of Zod's
// own `.strict()` rejection, so a key outside these arrays can never reach a
// schema, let alone an RPC argument.
const NOMINATE_FIELDS = ['successorUserId'] as const
const RESPOND_FIELDS = ['transferId', 'action', 'expectedState'] as const

function pickFields(
  body: Record<string, unknown>,
  allowed: readonly string[]
): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) picked[key] = body[key]
  }
  return picked
}

const NominateSchema = z.object({ successorUserId: z.string().uuid() }).strict()

const RespondSchema = z
  .object({
    transferId: z.string().uuid(),
    action: z.enum(['accept', 'decline', 'withdraw']),
    expectedState: z.enum(['offered', 'accepted', 'declined', 'withdrawn']).optional(),
  })
  .strict()

// ─── Outcome → HTTP ─────────────────────────────────────────────────────────
// Same shape as the members route's map and as
// `app/api/antenna/opportunities/[opportunityId]/apply/route.ts`: a
// `Record<string, { error, status }>` with a fallback, so an outcome code this
// route does not recognise degrades to a sentence rather than a 500. The shape
// is copied; nothing is imported across route files.
//
// Vocabulary read out of migration 198 section (d) itself:
// ok, forbidden, no_self_nomination, successor_not_a_member, already_owner,
// nomination_open.
const NOMINATE_OUTCOMES: Record<string, { error: string; status: number }> = {
  forbidden: {
    error:
      'Only a workspace owner can nominate a successor — an admin cannot promote anyone to owner (R-05).',
    status: 403,
  },
  no_self_nomination: {
    error:
      'You cannot nominate yourself — ownership transfer is two-sided, and nobody may promote themselves to owner (R-05).',
    status: 403,
  },
  successor_not_a_member: {
    error:
      'The person you nominated does not hold an active seat in this workspace. Invite them first, then nominate them.',
    status: 409,
  },
  already_owner: {
    error: 'That person already owns this workspace, so there is nothing to transfer.',
    status: 409,
  },
  nomination_open: {
    error:
      'A nomination is already open for this workspace — it must be accepted, declined or withdrawn first.',
    status: 409,
  },
}

// Vocabulary read out of migration 198 section (e) itself. Note
// `successor_no_longer_a_member`, which section (e) added beyond the planned
// vocabulary and which closes a real hole: the accept path re-checks that the
// NOMINATOR still holds a live owner seat, and this is the symmetric check on
// the SUCCESSOR. If the successor's seat lapsed between nomination and accept,
// the promotion would match zero rows while the demotion matched one — which
// would demote the only owner. It is a workspace-state conflict, not an
// authority refusal, so it maps to 409 alongside its sibling and never falls
// through to a generic 500.
const RESPOND_OUTCOMES: Record<string, { error: string; status: number }> = {
  not_found: { error: 'Ownership nomination not found.', status: 404 },
  stale: {
    error: 'This nomination changed while you were looking at it. Reload it and try again.',
    status: 409,
  },
  already_resolved: {
    error: 'This nomination has already been accepted, declined or withdrawn.',
    status: 409,
  },
  forbidden: {
    error:
      'Only the nominated successor may accept or decline an ownership transfer, and only the nominating owner may withdraw it.',
    status: 403,
  },
  nominator_no_longer_owner: {
    error:
      'The owner who nominated you no longer holds an active owner seat on this workspace, so this nomination can no longer be accepted.',
    status: 409,
  },
  successor_no_longer_a_member: {
    error:
      'The nominated successor no longer holds an active seat on this workspace, so this nomination can no longer be accepted.',
    status: 409,
  },
}

const UNRECOGNISED_OUTCOME = {
  error: 'That ownership request could not be completed.',
  status: 400,
}

// ─── Postgres error code → response ─────────────────────────────────────────
// Migration 198 sets `SET LOCAL lock_timeout = '3s'` in every RPC precisely so
// that a blocked row lock becomes a bounded, retryable failure rather than a
// hung request. `55P03` (lock not available) is that timeout arriving and
// `40P01` (deadlock detected) is the other bounded outcome; both mean nothing
// was written and the caller may retry, which is a 409 — never a 500.
type PostgresLikeError = { message: string; code?: string }

const RETRYABLE_LOCK_CODES: ReadonlySet<string> = new Set(['40P01', '55P03'])

const LOCK_CONTENTION_MESSAGE =
  'This workspace was being changed by someone else. Nothing was saved — please try again.'

function respondToPostgresError(error: PostgresLikeError): NextResponse {
  if (error.code && RETRYABLE_LOCK_CODES.has(error.code)) {
    return NextResponse.json({ error: LOCK_CONTENTION_MESSAGE }, { status: 409 })
  }
  return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
}

/** Best-effort display copy for the effect sentence. Never throws — a blank
 * name degrades `describeOwnershipTransferEffect` to its neutral wording
 * rather than failing the nomination. */
async function readEffectNames(
  service: ReturnType<typeof createServiceClient>,
  args: { workspaceId: string; successorUserId: string }
): Promise<{ workspaceName: string; successorName: string }> {
  const [workspace, profile] = await Promise.all([
    service.from('workspaces').select('name').eq('id', args.workspaceId).maybeSingle(),
    service.from('user_profiles').select('artist_name').eq('id', args.successorUserId).maybeSingle(),
  ])

  const workspaceName = (workspace.data as { name?: string | null } | null)?.name ?? ''
  const successorName =
    (profile.data as { artist_name?: string | null } | null)?.artist_name ?? ''

  return { workspaceName, successorName }
}

// ─── POST — nominate a successor (WSR-08, side one) ─────────────────────────
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
    canManageOwners,
    'Only a workspace owner can nominate a successor — an admin cannot promote anyone to owner (R-05).'
  )
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = NominateSchema.safeParse(pickFields(body, NOMINATE_FIELDS))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'A valid successorUserId is required.' },
      { status: 400 }
    )
  }

  const { successorUserId } = parsed.data
  const service = createServiceClient()

  // A read, not a write: the successor's seat as it stands, so
  // `assertMayNominate` can refuse in words before the RPC is reached.
  const { data: successorSeat, error: successorError } = await service
    .from('workspace_members')
    .select('role, status, expires_at')
    .eq('workspace_id', workspaceId)
    .eq('user_id', successorUserId)
    .maybeSingle()

  if (successorError) {
    return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  }

  const seat = successorSeat as {
    role: WorkspaceRole
    status: string
    expires_at: string | null
  } | null

  const seatIsLive =
    seat !== null &&
    seat.status === 'active' &&
    (!seat.expires_at || new Date(seat.expires_at).getTime() > Date.now())

  const nominateCheck = assertMayNominate({
    nominatorRole: gated.role,
    nominatorUserId: gated.userId,
    successorUserId,
    successorRole: seatIsLive && seat ? seat.role : null,
    successorIsActive: seatIsLive,
  })
  if (!nominateCheck.ok) {
    return NextResponse.json({ error: nominateCheck.reason }, { status: nominateCheck.status })
  }

  // THE ONE WRITE. `p_actor_id` is the identity already proved above; the RPC
  // re-derives this actor's authority under the lock and accepts no role
  // parameter (R-21).
  const { data: rpcData, error: rpcError } = await service
    .rpc('workspace_nominate_owner', {
      p_actor_id: gated.userId,
      p_workspace_id: workspaceId,
      p_successor_user_id: successorUserId,
    })
    .single()

  if (rpcError) return respondToPostgresError(rpcError as PostgresLikeError)

  const result = (rpcData as NominateOutcome | null) ?? null
  if (!result || result.outcome !== 'ok') {
    const mapped = NOMINATE_OUTCOMES[result?.outcome ?? ''] ?? UNRECOGNISED_OUTCOME
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  const { data: transfer } = await service
    .from('workspace_ownership_transfers')
    .select(TRANSFER_COLUMNS)
    .eq('id', result.transfer_id)
    .maybeSingle()

  // Both parties are shown the SAME sentence, from the one exported helper —
  // what changes (who administers this workspace) and, explicitly, what does
  // not (nobody's record, catalogue or rights).
  const names = await readEffectNames(service, { workspaceId, successorUserId })
  const effect = describeOwnershipTransferEffect(names)

  return NextResponse.json({ data: transfer, effect }, { status: 201 })
}

// ─── GET — list this workspace's nominations ────────────────────────────────
// Read through the RLS-SCOPED session client, never the service client. That
// is the same reasoning `app/api/vault/custody-transfers/route.ts`'s GET
// already records: migration 197's `workspace_ownership_transfers_select`
// policy (via `ownership_transfer_visible`) is the FILTER, so visibility is
// decided by one reviewed policy rather than by a WHERE clause in this file
// that could drift away from it. The `.eq('workspace_id', ...)` below scopes
// the list to the path segment; it does not decide who may see a row.
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

  const { data, error } = await supabase
    .from('workspace_ownership_transfers')
    .select(TRANSFER_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// ─── PATCH — respond: accept, decline or withdraw (WSR-08, side two) ────────
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // GATED ON `requireWorkspaceAccess` ONLY, AND DELIBERATELY NOT ON
  // `canManageOwners`. This looks like an oversight and is not: the successor
  // accepting a nomination is BY DEFINITION not yet an owner — they hold an
  // admin, member, contractor or guest seat at the moment they accept. An
  // owner-only gate here would make the two-sided act impossible to complete
  // and would leave `accept` reachable by nobody. Who may respond is decided
  // by `assertMayRespond` below (only the named successor may accept or
  // decline; only the nominating incumbent may withdraw) and again by the
  // RPC's own post-lock check — which is authority derived from the
  // NOMINATION, not from a workspace role.
  const access = await requireWorkspaceAccess(supabase, user, workspaceId)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = RespondSchema.safeParse(pickFields(body, RESPOND_FIELDS))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  const { transferId, expectedState } = parsed.data
  const action: OwnershipResponseAction = parsed.data.action

  const service = createServiceClient()
  const { data: transferData, error: transferError } = await service
    .from('workspace_ownership_transfers')
    .select(TRANSFER_COLUMNS)
    .eq('id', transferId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (transferError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })

  const transfer = (transferData as TransferRow | null) ?? null
  if (!transfer) {
    return NextResponse.json({ error: 'Ownership nomination not found.' }, { status: 404 })
  }

  // THE F1 ATTACK SHAPE, REFUSED AT THE ROUTE. Only the named successor may
  // accept or decline, and the nominator may never accept whatever else is
  // true. The RPC refuses it too, and migration 197's
  // `CHECK (offered_by <> to_user_id)` refuses it a third time — that is the
  // point of layers, and this one bites first, before any RPC call.
  const respondCheck = assertMayRespond({
    parties: {
      fromUserId: transfer.from_user_id,
      toUserId: transfer.to_user_id,
      offeredBy: transfer.offered_by,
    },
    actorUserId: access.userId,
    action,
  })
  if (!respondCheck.ok) {
    return NextResponse.json({ error: respondCheck.reason }, { status: respondCheck.status })
  }

  const targetState: OwnershipTransferState =
    action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'withdrawn'

  if (!isLegalOwnershipTransition(transfer.state, targetState)) {
    return NextResponse.json(
      { error: 'This nomination has already been accepted, declined or withdrawn.' },
      { status: 409 }
    )
  }

  // THE ONE WRITE. The compare-and-set token is the caller's `expectedState`
  // when supplied, otherwise the state on the row this route just read — so a
  // nomination that moved between that read and the RPC's lock comes back as
  // `'stale'` rather than double-resolving.
  const { data: rpcData, error: rpcError } = await service
    .rpc('workspace_respond_ownership_nomination', {
      p_actor_id: access.userId,
      p_transfer_id: transfer.id,
      p_action: action,
      p_expected_state: expectedState ?? transfer.state,
    })
    .single()

  if (rpcError) return respondToPostgresError(rpcError as PostgresLikeError)

  const result = (rpcData as RespondOutcome | null) ?? null
  if (!result || result.outcome !== 'ok') {
    const mapped = RESPOND_OUTCOMES[result?.outcome ?? ''] ?? UNRECOGNISED_OUTCOME
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  const { data: resolved } = await service
    .from('workspace_ownership_transfers')
    .select(TRANSFER_COLUMNS)
    .eq('id', transfer.id)
    .maybeSingle()

  return NextResponse.json({ data: resolved })
}
