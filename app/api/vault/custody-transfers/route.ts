import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'
import {
  assertMayOffer,
  assertMayRespond,
  isLegalTransferTransition,
  type CustodyTransferState,
} from '@/lib/workspaces/custody-transfer'
import { logWorkspaceAction } from '@/lib/workspaces/audit'
import { createNotification } from '@/lib/notifications'

// ─── /api/vault/custody-transfers — offer, list, respond (D-28, D-29, D-43) ─
//
// Custody is a MEMBER act, not a workspace one — this route is gated with
// `requireMemberApiAccount` ONLY, never `requireWorkspaceAccess`. F1 HOTFIX
// (2026-09-06): `assertMayOffer` no longer has a workspace-admin branch at
// all — it now permits ONLY the project's own custodian, offering
// directly — so this route carries ZERO workspace-derived authority of any
// kind. This is a stronger form of the same design intent an earlier
// version of this comment described (a workspace admin proving authority
// through `assertMayOffer`'s own lookup rather than a route-level gate):
// there is no longer any workspace lookup to prove authority THROUGH.
// `workspaceId` remains an accepted, optional request field, recorded on
// the inserted row for attribution only (which workspace context the offer
// happened in, if any) — it confers no authority at this route, in
// `assertMayOffer`, or in migration 187's trigger. Because no workspace
// grant reaches this route, the D-56/WS-31 platform-wide workspace-access
// kill switch (`requireWorkspaceAccess`, hotfix finding F7) has nothing to
// gate here and is correctly never called from this file. THE RPC BELOW
// DELIBERATELY DOES NOT CONSULT IT EITHER, for the same reason and stated
// in its own header at length: custody is a Member act carrying no
// workspace-derived authority, and `workspace_custody_transfers.
// workspace_id` is NULLABLE precisely because a transfer may be offered
// outside any workspace context at all — for such a transfer, gating on
// the switch would be gating on a workspace that does not exist. Two
// places now say so, so a future "consistency" fix that adds a gate here
// fails review rather than shipping.
//
// `workspace_custody_transfers`' BEFORE INSERT guard (migration 187,
// replacing migration 185's original) is the FIRST enforcement point for
// D-29's two-sided rule; `assertMayOffer` here is the SECOND, giving a
// friendly, pre-insert refusal reason rather than a raw
// insufficient_privilege database error; the partial unique index
// (one live offer per project) is the THIRD (T-38-13-01).
//
// THE ACCEPT PATH CHANGES `vault_projects.user_id` AND NOTHING ELSE — this
// is the ONLY route/branch in this codebase permitted to move that column
// for a reason other than project creation. It never touches
// `project_members`, `split_sheets`, `split_sheet_parties`, `work_members`,
// any credit record, or any version-ownership record: a custody change is
// not a rights change (D-28, D-43), and custody D-02's own rule is that
// "version contributors, uploaders, owners, controllers and authorized
// users are separate concepts and must not be inferred from one another" —
// accepting a transfer infers nothing about any of those, it only changes
// who administers the vault_projects row itself.
//
// THE DIARY (D-29's "the diary records it permanently"): migration 185's
// header records that the transfer row's own resolution IS that diary —
// `workspace_custody_transfers.state` moves to its terminal `accepted`
// value in the SAME TRANSACTION as the `vault_projects.user_id` write, so
// the permanent record and the custody change cannot drift apart. No
// separate diary table exists for `vault_projects`; this route does not
// invent one.
//
// WSR-09 IS CLOSED HERE (F9). Until this change the PATCH handler ran THREE
// separate transactions — read the transfer, CAS the diary to `accepted`
// with `.eq('state','offered')`, then call `transfer_vault_project_custody`
// — and a crash, a redeploy or a concurrent transfer landing between the
// last two left the diary saying `accepted` while custody never moved.
// Split-brain, on the one field that decides who holds a Member's record.
// `public.workspace_accept_custody_transfer` (migration 198 section (h)) is
// now the SINGLE WRITER on the response path: it takes the diary row and
// the project row under lock, revalidates every precondition after the
// lock, moves custody, moves the diary and writes the audit row in ONE
// transaction. This route issues no `.update()` and no `logWorkspaceAction`
// call on that path any more — both moved inside the function, which is the
// whole point. WSR-09 had been deferred twice; it is not deferred again.
//
// The KEEP list below the RPC is deliberate and is NOT duplication:
// `assertMayRespond` (self-dealing check included), `isLegalTransferTransition`
// and `assertMayOffer` remain this repo's documented SECOND enforcement
// point beside the database's own guards, producing friendly, pre-write
// refusal sentences a `RAISE` cannot phrase.

const OfferSchema = z
  .object({
    projectId: z.string().uuid(),
    toUserId: z.string().uuid(),
    workspaceId: z.string().uuid().nullable().optional(),
    note: z.string().max(1000).nullable().optional(),
  })
  .strict()

const RespondSchema = z
  .object({
    transferId: z.string().uuid(),
    action: z.enum(['accept', 'decline', 'withdraw']),
  })
  .strict()

const TRANSFER_COLUMNS =
  'id, project_id, from_user_id, to_user_id, offered_by, workspace_id, state, offered_at, responded_at, note, created_at'

type TransferRow = {
  id: string
  project_id: string
  from_user_id: string
  to_user_id: string
  offered_by: string
  workspace_id: string | null
  state: CustodyTransferState
}

type CustodyResponseOutcome = {
  outcome: string
  transfer_id: string | null
  project_id: string | null
  audit_id: string | null
}

// ─── Outcome → HTTP, in the shape of ────────────────────────────────────────
// `app/api/workspaces/[workspaceId]/members/route.ts`: a
// `Record<string, { error, status }>` with a fallback, so an outcome code
// this route does not recognise degrades to a 400 with a sentence rather
// than a 500 with a stack trace.
//
// The vocabulary below is migration 198 section (h)'s, in full:
// ok, not_found, stale, already_resolved, forbidden, stale_custodian.
//
// TWO OF THESE SENTENCES ARE BYTE-IDENTICAL TO THE ONES THIS ROUTE RETURNED
// BEFORE THE REWIRE, deliberately: a client may be matching on either, and
// closing F9 is not a reason to reword a refusal. `route.test.ts` pins both
// as literals so a future edit that rewords one goes red.
const CUSTODY_RESPONSE_OUTCOMES: Record<string, { error: string; status: number }> = {
  not_found: { error: 'Custody transfer not found.', status: 404 },
  stale: {
    error: 'This transfer changed while you were responding. Reload it and try again.',
    status: 409,
  },
  already_resolved: {
    error: 'This transfer was already resolved by someone else.',
    status: 409,
  },
  forbidden: {
    error: 'You are not permitted to respond to this custody transfer.',
    status: 403,
  },
  stale_custodian: {
    error:
      "This record's custodian changed after this transfer was offered — it can no longer be accepted.",
    status: 409,
  },
}

const UNRECOGNISED_OUTCOME = {
  error: 'That response to this custody transfer could not be applied.',
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
  'This transfer was being resolved by someone else. Nothing was saved — please try again.'

function respondToPostgresError(error: PostgresLikeError): NextResponse {
  if (error.code && RETRYABLE_LOCK_CODES.has(error.code)) {
    return NextResponse.json({ error: LOCK_CONTENTION_MESSAGE }, { status: 409 })
  }
  return NextResponse.json({ error: error.message }, { status: 500 })
}

// POST — offer a custody transfer. NOT moved to an RPC, unlike PATCH: the
// offer is a SINGLE insert guarded by migration 187's BEFORE INSERT trigger
// and the partial unique index, so there is no multi-statement race to close.
export async function POST(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const gated = await requireMemberApiAccount(supabase, user)
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = OfferSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  }

  const { projectId, toUserId } = parsed.data
  const workspaceId = parsed.data.workspaceId ?? null
  const note = parsed.data.note ?? null

  const service = createServiceClient()

  const offerCheck = await assertMayOffer(service, {
    projectId,
    offeredByUserId: gated.user.id,
    workspaceId,
  })
  if (!offerCheck.ok) {
    return NextResponse.json({ error: offerCheck.reason }, { status: offerCheck.status })
  }

  if (toUserId === offerCheck.custodianId) {
    return NextResponse.json(
      { error: "Cannot offer a custody transfer to the record's current custodian." },
      { status: 400 }
    )
  }

  const { data: inserted, error: insertError } = await service
    .from('workspace_custody_transfers')
    .insert({
      project_id: projectId,
      from_user_id: offerCheck.custodianId,
      to_user_id: toUserId,
      offered_by: gated.user.id,
      workspace_id: workspaceId,
      note,
    })
    .select(TRANSFER_COLUMNS)
    .single()

  if (insertError) {
    // The partial unique index (one LIVE 'offered' row per project) makes a
    // second concurrent offer a conflict, not a server error.
    const status = insertError.code === '23505' ? 409 : 500
    const message =
      status === 409
        ? 'A custody offer is already open for this project — it must be accepted, declined or withdrawn first.'
        : insertError.message
    return NextResponse.json({ error: message }, { status })
  }

  await createNotification(service, {
    userId: toUserId,
    type: 'custody_transfer_offered',
    title: 'Someone offered you custody of a record',
    body: 'Review the offer in your Sound Vault to accept or decline it.',
    link: `/vault/${projectId}`,
    data: { projectId, transferId: (inserted as TransferRow).id },
  })

  // Attributed to the CURRENT custodian as the subject — the action
  // concerns their record even when a workspace admin made the offer on
  // their behalf (D-22, D-50). Only logged when a workspace is involved;
  // a direct Member-to-Member offer has no workspace to log against
  // (workspace_audit_log.workspace_id is NOT NULL).
  if (workspaceId) {
    await logWorkspaceAction(service, {
      workspaceId,
      actorId: gated.user.id,
      subjectMemberId: offerCheck.custodianId,
      action: 'custody.transfer.offered',
      targetType: 'workspace_custody_transfer',
      targetId: (inserted as TransferRow).id,
      changes: { projectId, toUserId },
    })
  }

  return NextResponse.json({ data: inserted }, { status: 201 })
}

// GET — list transfers naming the caller as from_user_id, to_user_id or
// offered_by. Reads through the RLS-scoped client so migration 185's
// `custody_transfer_visible` policy is the filter, not this route.
export async function GET() {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const gated = await requireMemberApiAccount(supabase, user)
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const { data, error } = await supabase
    .from('workspace_custody_transfers')
    .select(TRANSFER_COLUMNS)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// PATCH — respond: accept, decline or withdraw.
export async function PATCH(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const gated = await requireMemberApiAccount(supabase, user)
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = RespondSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  }

  const { transferId, action } = parsed.data

  const service = createServiceClient()
  const { data: transfer, error: transferError } = await service
    .from('workspace_custody_transfers')
    .select(TRANSFER_COLUMNS)
    .eq('id', transferId)
    .maybeSingle()

  if (transferError) return NextResponse.json({ error: transferError.message }, { status: 500 })
  if (!transfer) return NextResponse.json({ error: 'Custody transfer not found.' }, { status: 404 })

  const row = transfer as TransferRow

  const respondCheck = assertMayRespond({
    parties: { fromUserId: row.from_user_id, toUserId: row.to_user_id, offeredBy: row.offered_by },
    actorUserId: gated.user.id,
    action,
  })
  if (!respondCheck.ok) {
    return NextResponse.json({ error: respondCheck.reason }, { status: respondCheck.status })
  }

  const targetState: CustodyTransferState =
    action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'withdrawn'

  if (!isLegalTransferTransition(row.state, targetState)) {
    return NextResponse.json(
      { error: 'This transfer is no longer open — it has already been resolved or withdrawn.' },
      { status: 409 }
    )
  }

  // ─── THE ONE WRITE — AND THE ONLY PATH THAT CHANGES vault_projects.user_id.
  //
  // `workspace_accept_custody_transfer` (migration 198 section (h)) takes the
  // diary row (rank 7) and the project row (rank 8) under lock, revalidates
  // every precondition AFTER the lock — the compare-and-set against
  // `p_expected_state`, the terminal-state check that replaces this route's
  // old `.eq('state', 'offered')` filter, `assertMayRespond`'s authority
  // predicate copied exactly including the self-dealing refusal, and the
  // stale-custodian pre-check on accept — then moves custody, moves the
  // diary and writes the audit row in ONE transaction.
  //
  // THIS ROUTE NO LONGER CALLS `transfer_vault_project_custody` ITSELF. The
  // RPC does, from inside the same transaction as the diary write, and that
  // gap between two separate transactions is exactly what F9's residual
  // window was. After this change the sanctioned low-level function has one
  // caller in the entire system.
  //
  // WHAT AN ACCEPT CHANGES, AND WHAT IT DOES NOT. It sets
  // `vault_projects.user_id` and nothing else. No `project_members`,
  // `split_sheets`, `split_sheet_parties`, `work_members`, credit record or
  // version-ownership record is touched here or anywhere in this file: a
  // custody change is NOT a rights change (D-28, D-43), and custody D-02's
  // own rule holds — "version contributors, uploaders, owners, controllers
  // and authorized users are separate concepts and must not be inferred from
  // one another." Accepting a transfer creates no split-sheet party, no
  // credit, no royalty entitlement, no version-ownership record and no
  // signature authority; it only changes who administers this one row.
  //
  // `p_actor_id` is the identity `requireMemberApiAccount` already proved
  // (R-21 Option A) — the RPC re-checks that actor's authority itself rather
  // than accepting any claim about it. `p_expected_state` is the state read
  // above, travelling as the compare-and-set token, so a diary row that
  // moved between this route's read and the RPC's lock comes back as
  // `'stale'` instead of overwriting somebody else's response.
  const { data: rpcData, error: rpcError } = await service
    .rpc('workspace_accept_custody_transfer', {
      p_actor_id: gated.user.id,
      p_transfer_id: transferId,
      p_action: action,
      p_expected_state: row.state,
    })
    .single()

  if (rpcError) return respondToPostgresError(rpcError as PostgresLikeError)

  const result = (rpcData as CustodyResponseOutcome | null) ?? null
  if (!result || result.outcome !== 'ok') {
    const mapped = CUSTODY_RESPONSE_OUTCOMES[result?.outcome ?? ''] ?? UNRECOGNISED_OUTCOME
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  // Re-read through the same column list the rest of this file uses, so the
  // success body keeps the shape it had when the diary UPDATE returned it
  // directly and no client change is needed.
  const { data: resolved, error: readError } = await service
    .from('workspace_custody_transfers')
    .select(TRANSFER_COLUMNS)
    .eq('id', transferId)
    .maybeSingle()

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  return NextResponse.json({ data: resolved })
}
