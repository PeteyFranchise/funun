import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { createNotification } from '@/lib/notifications'
import {
  buildSyncLibraryAdmittedNotification,
  buildSyncLibraryRejectedNotification,
} from '@/lib/social/notifications'
import { isValidTransition } from '@/lib/sync-library/submission'

// ─── POST /api/sync-library/admin/[listingId] ──────────────────────────
// The SINGLE staff curation gate — admit or reject a song, invited OR
// self-applied (26-CONTEXT.md decision #2: "invited vs self-applied is
// metadata... not a different flow gate"). Mirrors
// app/api/capabilities/approve/[grantId]/route.ts's staff-gate-first +
// DB-loaded-target + double-decide doctrine exactly.
//
// T-26-17/T-26-18: requireStaff() is the FIRST statement. Curation stays
// with the broader permissioned-staff role (leadership + ae) — only
// REMOVAL (a separate route) is leadership-only.

const VALID_DECISIONS = ['admit', 'reject'] as const
const REASON_MAX_LENGTH = 500

type RequestBody = { decision?: unknown; reason?: unknown }
type ListingRow = { id: string; status: string; artist_user_id: string; track_id: string }
type TrackRow = { title: string }

export async function POST(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> }
) {
  // T-26-17: staff-gate-first — precedes any DB read.
  const auth = await requireStaff(['leadership', 'ae'])
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { listingId } = await params
  const body = (await request.json().catch(() => ({}))) as RequestBody

  // T-15-08-style input validation — never trust the raw client value.
  const decision = body.decision
  if (decision !== 'admit' && decision !== 'reject') {
    return NextResponse.json(
      { error: `decision must be one of: ${VALID_DECISIONS.join(', ')}.` },
      { status: 400 }
    )
  }

  // reason is optional and only meaningful for reject (26-CONTEXT.md
  // UI-phase decision #1) — trimmed and length-capped either way.
  const rawReason = body.reason
  const reason =
    typeof rawReason === 'string' && rawReason.trim() !== ''
      ? rawReason.trim().slice(0, REASON_MAX_LENGTH)
      : null

  const service = createServiceClient()

  // T-26-19: target loaded from the DB by the path param — the body never
  // carries a listing/artist identity.
  const { data: listingRaw, error: listingError } = await service
    .from('sync_listings')
    .select('id, status, artist_user_id, track_id')
    .eq('id', listingId)
    .maybeSingle()
  if (listingError) {
    return NextResponse.json({ error: listingError.message }, { status: 500 })
  }
  const row = listingRaw as ListingRow | null
  if (!row) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  }

  const nextStatus: 'admitted' | 'rejected' = decision === 'admit' ? 'admitted' : 'rejected'

  // T-26-22: double-decide guard — the ONE authority for legal transitions.
  if (!isValidTransition(row.status, nextStatus)) {
    return NextResponse.json(
      { error: 'This song is not awaiting an admit/reject decision.' },
      { status: 409 }
    )
  }

  // Song title for the artist-facing notification — a separate flat query,
  // matching this codebase's established convention (app/api/sync-library/
  // submit/route.ts, mint-agreement/route.ts) over an embedded select.
  const { data: trackRaw } = await service
    .from('tracks')
    .select('title')
    .eq('id', row.track_id)
    .maybeSingle()
  const songTitle = (trackRaw as TrackRow | null)?.title ?? 'Your song'

  const nowIso = new Date().toISOString()

  if (decision === 'admit') {
    // T-26-20: fixed allowlisted column set — never spread the request body.
    const { error: updateError } = await service
      .from('sync_listings')
      .update({
        status: 'admitted',
        admitted_at: nowIso,
        decided_at: nowIso,
        decided_by: auth.user.id,
        updated_at: nowIso,
      })
      .eq('id', listingId)
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // SYNCLIB-14: the new-feature-highlight fires ONLY on the artist's
    // FIRST admitted listing — recount after the write.
    const { data: admittedRaw } = await service
      .from('sync_listings')
      .select('id')
      .eq('artist_user_id', row.artist_user_id)
      .eq('status', 'admitted')
    const admittedCount = ((admittedRaw ?? []) as { id: string }[]).length
    if (admittedCount === 1) {
      try {
        await createNotification(
          service,
          buildSyncLibraryAdmittedNotification({
            recipientId: row.artist_user_id,
            actorId: auth.user.id,
            songTitle,
          })
        )
      } catch {
        // swallow — non-fatal side effect, must never fail the admit write
      }
    }

    // T-26-21: UNCONDITIONAL, after the write.
    await logStaffAction(service, {
      actorId: auth.user.id,
      action: 'sync_library.admit',
      targetType: 'sync_listing',
      targetId: listingId,
      changes: { previousStatus: row.status },
    })

    return NextResponse.json({ data: { listingId, status: 'admitted' as const } })
  }

  // Reject path.
  const { error: rejectError } = await service
    .from('sync_listings')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      decided_at: nowIso,
      decided_by: auth.user.id,
      updated_at: nowIso,
    })
    .eq('id', listingId)
  if (rejectError) {
    return NextResponse.json({ error: rejectError.message }, { status: 500 })
  }

  try {
    await createNotification(
      service,
      buildSyncLibraryRejectedNotification({
        recipientId: row.artist_user_id,
        actorId: auth.user.id,
        songTitle,
        reason,
      })
    )
  } catch {
    // swallow — non-fatal side effect
  }

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'sync_library.reject',
    targetType: 'sync_listing',
    targetId: listingId,
    changes: { previousStatus: row.status, reason },
  })

  return NextResponse.json({ data: { listingId, status: 'rejected' as const } })
}
