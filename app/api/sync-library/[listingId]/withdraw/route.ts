import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { isValidTransition } from '@/lib/sync-library/submission'

// ─── POST /api/sync-library/[listingId]/withdraw ───────────────────────
// Artist-owned un-admit (26-CONTEXT.md OQ#5: "withdraw → un-admit", no
// in-flight buyer deals in this phase's scope — nothing downstream to
// cancel). Target row is loaded from the DB, never trusted from the body
// (T-26-09) — a non-owned or absent listing returns 404, not 403, matching
// the app/api/connections PATCH precedent (no existence leak).

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ listingId: string }> }
) {
  // ── 1. Auth gate ────────────────────────────────────────────────────
  const apiClient = await createApiClient()
  const {
    data: { user },
  } = await apiClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { listingId } = await params

  // ── 2. Load the target from the DB, ownership from the ROW ─────────
  const service = createServiceClient()
  const { data: listing, error: listingError } = await service
    .from('sync_listings')
    .select('id, status, artist_user_id')
    .eq('id', listingId)
    .maybeSingle()
  if (listingError) {
    return NextResponse.json({ error: listingError.message }, { status: 500 })
  }
  const row = listing as { id: string; status: string; artist_user_id: string } | null
  // 404 (not 403) for absent OR non-owned — avoids an existence leak
  // (T-26-09, connections PATCH precedent).
  if (!row || row.artist_user_id !== user.id) {
    return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 })
  }

  // ── 3. Double-decide guard — must still be able to withdraw ────────
  if (!isValidTransition(row.status, 'withdrawn')) {
    return NextResponse.json(
      { error: 'This song is no longer active in the Sync Library.' },
      { status: 409 }
    )
  }

  // ── 4. Update — allowlisted columns only ────────────────────────────
  const nowIso = new Date().toISOString()
  const { error: updateError } = await service
    .from('sync_listings')
    .update({ status: 'withdrawn', withdrawn_at: nowIso, updated_at: nowIso })
    .eq('id', listingId)
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ data: { listingId, status: 'withdrawn' as const } })
}
