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
// gate here and is correctly never called from this file.
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
// value in the SAME handler, in the SAME request, as the `vault_projects.
// user_id` write below, so the permanent record and the custody change are
// one reviewable code path rather than two that could drift apart. No
// separate diary table exists for `vault_projects`; this route does not
// invent one.

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

// POST — offer a custody transfer.
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

  const respondedAt = new Date().toISOString()

  // ─── THE DIARY WRITE — this update, moving the transfer to its terminal
  // state, is the permanent record D-29 requires. It happens in the SAME
  // handler, guarded by `.eq('state', 'offered')` so a concurrent second
  // response loses the race rather than double-resolving the same offer.
  const { data: resolved, error: resolveError } = await service
    .from('workspace_custody_transfers')
    .update({ state: targetState, responded_at: respondedAt })
    .eq('id', transferId)
    .eq('state', 'offered')
    .select(TRANSFER_COLUMNS)
    .maybeSingle()

  if (resolveError) return NextResponse.json({ error: resolveError.message }, { status: 500 })
  if (!resolved) {
    return NextResponse.json(
      { error: 'This transfer was already resolved by someone else.' },
      { status: 409 }
    )
  }

  if (action === 'accept') {
    // ─── THE ONLY vault_projects UPDATE ON THE ACCEPT PATH — sets
    // `user_id` ONLY. No split-sheet, work-member, project-member or
    // credit table is touched here or anywhere else in this file: a
    // custody change is not a rights change (D-28, D-43), and custody
    // D-02's own rule holds — "version contributors, uploaders, owners,
    // controllers and authorized users are separate concepts and must not
    // be inferred from one another." Accepting a transfer infers none of
    // those; it only changes who administers this one row.
    //
    // STALE-CUSTODIAN GUARD (F9's cheap half, hotfix 2026-09-06): filtered
    // by `.eq('user_id', row.from_user_id)` in addition to project id, so
    // this write only lands if the custodian named on the offer is STILL
    // the project's custodian at accept time. Without this, a custodian
    // who transferred custody elsewhere (or had it transferred away) after
    // this offer was made, but before it was accepted, could have their
    // record silently overwritten by a stale offer. `.select('id')` +
    // `.maybeSingle()` lets us tell "the row exists but the filter didn't
    // match" (stale custodian — a conflict) apart from "the update simply
    // failed" (an error) — the same distinguishing pattern the DIARY WRITE
    // above already uses for its own `.eq('state', 'offered')` race guard.
    // Full transactional accept (both writes in one atomic RPC) remains
    // deferred to 38.0.1 (F9's full form) — this is the narrow, cheap
    // mitigation for the same class of race.
    // WSR-25 / migration 190: `vault_projects.user_id` is immutable to every
    // caller. `transfer_vault_project_custody` is a SECURITY DEFINER function
    // owned by postgres and is the ONLY sanctioned path that may change it —
    // the boundary is "did this statement run inside that function", not
    // "which role connected" (PREFLIGHT S1: service_role's directly-granted
    // privileges survive `REVOKE ... FROM PUBLIC`). It reproduces the
    // stale-custodian guard as the same WHERE-clause double filter and returns
    // NULL, changing nothing, when `from_user_id` is no longer the current
    // custodian — so the 409 below behaves exactly as it did before.
    const { data: custodyUpdated, error: custodyError } = await service.rpc(
      'transfer_vault_project_custody',
      {
        p_project_id: row.project_id,
        p_from_user_id: row.from_user_id,
        p_to_user_id: row.to_user_id,
      }
    )

    if (custodyError) {
      return NextResponse.json({ error: custodyError.message }, { status: 500 })
    }
    if (!custodyUpdated) {
      return NextResponse.json(
        {
          error:
            "This record's custodian changed after this transfer was offered — it can no longer be accepted.",
        },
        { status: 409 }
      )
    }

    if (row.workspace_id) {
      await logWorkspaceAction(service, {
        workspaceId: row.workspace_id,
        actorId: gated.user.id,
        subjectMemberId: row.to_user_id,
        action: 'custody.transfer.accepted',
        targetType: 'workspace_custody_transfer',
        targetId: row.id,
        changes: { projectId: row.project_id, fromUserId: row.from_user_id, toUserId: row.to_user_id },
      })
    }
  } else if (row.workspace_id) {
    await logWorkspaceAction(service, {
      workspaceId: row.workspace_id,
      actorId: gated.user.id,
      subjectMemberId: row.from_user_id,
      action: action === 'decline' ? 'custody.transfer.declined' : 'custody.transfer.withdrawn',
      targetType: 'workspace_custody_transfer',
      targetId: row.id,
      changes: { projectId: row.project_id },
    })
  }

  return NextResponse.json({ data: resolved })
}
