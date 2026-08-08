import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { createNotification } from '@/lib/notifications'
import { buildSyncLibraryRemovedNotification } from '@/lib/social/notifications'
import { isValidTransition } from '@/lib/sync-library/submission'

// ─── POST /api/sync-library/admin/[listingId]/remove ───────────────────
// LEADERSHIP-ONLY takedown of an already-admitted song (26-CONTEXT.md
// "Staff removal / takedown" — "NOT AE/BD"; mirrors the Phase-25
// leadership-gated pattern). A removed song stops being catalogue-visible
// immediately — the catalogue gate (26-06) only counts 'admitted'.
//
// T-26-18: requireStaff(['leadership']) is the FIRST statement — tighter
// than the admit/reject route's ['leadership','ae'], and MUST precede any
// DB read.

const REASON_MAX_LENGTH = 500

type RequestBody = { reason?: unknown }
type ListingRow = { id: string; status: string; artist_user_id: string; track_id: string }
type TrackRow = { title: string }

export async function POST(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> }
) {
  // T-26-18: leadership-only — tighter than admit/reject, precedes any DB read.
  const auth = await requireStaff(['leadership'])
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { listingId } = await params
  const body = (await request.json().catch(() => ({}))) as RequestBody
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

  // T-26-22: double-decide guard — legal edge only from 'admitted'.
  if (!isValidTransition(row.status, 'removed')) {
    return NextResponse.json({ error: 'This song is not currently admitted.' }, { status: 409 })
  }

  const nowIso = new Date().toISOString()
  // T-26-20: fixed allowlisted column set — never spread the request body.
  const { error: updateError } = await service
    .from('sync_listings')
    .update({
      status: 'removed',
      removal_reason: reason,
      removed_at: nowIso,
      removed_by: auth.user.id,
      updated_at: nowIso,
    })
    .eq('id', listingId)
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const { data: trackRaw } = await service
    .from('tracks')
    .select('title')
    .eq('id', row.track_id)
    .maybeSingle()
  const songTitle = (trackRaw as TrackRow | null)?.title ?? 'Your song'

  // Best-effort — a notification failure must never fail the removal.
  try {
    await createNotification(
      service,
      buildSyncLibraryRemovedNotification({
        recipientId: row.artist_user_id,
        actorId: auth.user.id,
        songTitle,
        reason,
      })
    )
  } catch {
    // swallow — non-fatal side effect
  }

  // T-26-21: UNCONDITIONAL, after the write.
  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'sync_library.remove',
    targetType: 'sync_listing',
    targetId: listingId,
    changes: { reason },
  })

  return NextResponse.json({ data: { listingId, status: 'removed' as const } })
}
