import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { initialStatusForEntry } from '@/lib/sync-library/submission'
import type { SyncListingEntrySource } from '@/types'

// ─── POST /api/sync-library/submit ─────────────────────────────────────
// Ungated self-apply, per-song, batched (26-CONTEXT.md "Self-apply entry
// point ... a per-song 'Submit to Sync Library' action in the Sound Vault
// ... available to ALL artists ... NOT gated"). This is the ONLY
// pre-admission door for an uninvited artist — the security-critical entry
// point of the whole pipeline (T-26-07, T-26-10).
//
// Server-owned-write doctrine, mirroring
// app/api/split-sheets/[id]/mint-envelope/route.ts:108-134: SESSION client
// verifies ownership FIRST, THEN a service client performs the write. Body:
// { projectId, trackIds[] }.

/** Hard cap on a single batch — plan-mandated input-shape guard. */
const MAX_TRACK_IDS = 50

/** Statuses that occupy sync_listings_active_track_uniq (migration 096) —
 * a track already in one of these is skipped, not re-submitted. */
const ACTIVE_LISTING_STATUSES = ['applied', 'invited', 'agreement_pending', 'pending_admit', 'admitted']

type RequestBody = {
  projectId?: unknown
  trackIds?: unknown
}

export async function POST(request: Request) {
  // ── 1. Auth gate — ungated by capability, session only required ────
  const apiClient = await createApiClient()
  const {
    data: { user },
  } = await apiClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── 2. Input validation — never trust the raw request shape ────────
  const body = (await request.json().catch(() => ({}))) as RequestBody

  const projectId = body.projectId
  if (typeof projectId !== 'string' || projectId.trim() === '') {
    return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
  }

  const rawTrackIds = body.trackIds
  const isValidTrackIdShape =
    Array.isArray(rawTrackIds) &&
    rawTrackIds.length > 0 &&
    rawTrackIds.length <= MAX_TRACK_IDS &&
    rawTrackIds.every((t): t is string => typeof t === 'string' && t.trim() !== '')
  if (!isValidTrackIdShape) {
    return NextResponse.json(
      { error: `trackIds must be a non-empty array of up to ${MAX_TRACK_IDS} track ids.` },
      { status: 400 }
    )
  }
  const trackIds = [...new Set(rawTrackIds as string[])]

  // ── 3. Ownership — SESSION client (T-26-07) ────────────────────────
  const { data: project, error: projectError } = await apiClient
    .from('vault_projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (projectError || !project) {
    return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 })
  }

  // Every submitted trackId must be a track of THIS owned project — closes
  // the "attach a listing to someone else's track id" hole (T-26-07).
  const { data: projectTracks, error: tracksError } = await apiClient
    .from('tracks')
    .select('id')
    .eq('project_id', projectId)
  if (tracksError) {
    return NextResponse.json({ error: tracksError.message }, { status: 500 })
  }
  const ownedTrackIds = new Set((projectTracks ?? []).map(t => (t as { id: string }).id))
  const invalidTrackId = trackIds.find(id => !ownedTrackIds.has(id))
  if (invalidTrackId) {
    return NextResponse.json(
      { error: `Track ${invalidTrackId} does not belong to this project.` },
      { status: 400 }
    )
  }

  // ── 4. Service client — entry_source, sign state, and the write ────
  const service = createServiceClient()

  // entry_source is the ONLY place the invited/self-applied paths diverge
  // (26-CONTEXT.md) — an approved, admin_invited sync_library grant marks
  // the invited path; everything else is self_applied.
  const { data: grant } = await service
    .from('capability_grants')
    .select('status, source')
    .eq('profile_id', user.id)
    .eq('capability', 'sync_library')
    .maybeSingle()
  const grantRow = grant as { status: string; source: string } | null
  const entrySource: SyncListingEntrySource =
    grantRow && grantRow.status === 'approved' && grantRow.source === 'admin_invited'
      ? 'admin_invited'
      : 'self_applied'

  // Sign-once: a previously signed blanket agreement means every later
  // submission skips straight to pending_admit (initialStatusForEntry).
  const { data: signedAgreement } = await service
    .from('vault_documents')
    .select('id')
    .eq('type', 'blanket_agreement')
    .eq('user_id', user.id)
    .eq('status', 'signed')
    .maybeSingle()
  const alreadySigned = signedAgreement != null

  // Skip (not error) any track that already has an active listing —
  // respects sync_listings_active_track_uniq without racing it blind.
  const { data: existingActive } = await service
    .from('sync_listings')
    .select('track_id')
    .in('track_id', trackIds)
    .in('status', ACTIVE_LISTING_STATUSES)
  const skipTrackIds = new Set((existingActive ?? []).map(r => (r as { track_id: string }).track_id))

  const status = initialStatusForEntry(entrySource, alreadySigned)
  const toInsert = trackIds.filter(id => !skipTrackIds.has(id))

  let created: { id: string; track_id: string }[] = []
  if (toInsert.length > 0) {
    // Fixed allowlisted column set ONLY — never spread the request body
    // into the insert (T-26-08, EDITABLE_FIELDS precedent).
    const rows = toInsert.map(trackId => ({
      vault_project_id: projectId,
      track_id: trackId,
      artist_user_id: user.id,
      entry_source: entrySource,
      status,
    }))
    const { data: inserted, error: insertError } = await service
      .from('sync_listings')
      .insert(rows)
      .select('id, track_id')
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
    created = (inserted ?? []) as { id: string; track_id: string }[]
  }

  return NextResponse.json({
    data: {
      created: created.map(row => row.id),
      skipped: trackIds.filter(id => skipTrackIds.has(id)),
    },
  })
}
