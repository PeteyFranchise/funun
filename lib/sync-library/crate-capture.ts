import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { resolveReviewedObject, type ReviewedObject } from '@/lib/sync-library/crate-byte-tied-review'

// ─── Phase 50.5B — capture at admission ─────────────────────────────────
//
// D-16: a song admitted to The Crate is CAPTURED, not pointed at. D-17: capture
// means a COPY, not a pinned reference. D-18: the reviewed playback is required.
//
// THE ORDERING, AND WHY IT IS THIS WAY ROUND. Storage and Postgres cannot share
// a transaction, so one of two bad outcomes is always possible: an orphaned
// private copy, or an admitted song with no artifact. The second is worse — a
// buyer could be shown a song The Crate holds nothing for — so the caller copies
// and captures FIRST and flips the listing to admitted only after this succeeds.
// A failure therefore leaves a file to clean up, never a gap.
//
// DARK BY DEFAULT, like B2: nothing runs until 248, 251 and 252 are applied.

export const CRATE_CAPTURE_ENABLED = false

export const CRATE_AUDIO_BUCKET = 'crate-audio'

export type CaptureFailure =
  | 'no_reviewable_audio'
  | 'no_passing_review'
  | 'source_unreadable'
  | 'copy_failed'
  | 'readback_failed'
  | 'digest_mismatch'
  | 'commit_failed'

export type CaptureResult =
  | { ok: true; crateSongId: string; artifactPath: string }
  | { ok: false; reason: CaptureFailure; orphanPath?: string }

/** Where the captured copy lives. Keyed by listing so a retry addresses the same object. */
export function captureObjectPath(listingId: string, ext: string): string {
  return `captured/${listingId}/review_playback.${ext}`
}

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot > 0 ? path.slice(dot + 1).toLowerCase() : 'bin'
}

/**
 * Copy the reviewed object into the private bucket, read the COPY back, hash it,
 * and commit through the capture writer.
 *
 * The digest is taken from the copy rather than the source on purpose. Hashing
 * the source would prove the source matched the review and say nothing about
 * what The Crate actually holds; a truncated or partial copy would pass. What
 * matters is that the bytes now in the private bucket are the bytes a human
 * approved.
 */
export async function captureAdmittedSong(
  service: SupabaseClient,
  input: {
    listingId: string
    sourceAudioPath: string | null
    title: string
    primaryArtistName: string
    payeeUserId: string
    capturedBy: string
    sourceTrackId: string
    sourceProjectId: string
  }
): Promise<CaptureResult> {
  const source: ReviewedObject | null = resolveReviewedObject(input.sourceAudioPath)
  if (!source) return { ok: false, reason: 'no_reviewable_audio' }

  // The newest PASSING review for this listing is the authority. A later failing
  // review means the song is not admissible, so the latest row is read rather
  // than the latest passing one, and its verdict is checked.
  const { data: reviewRaw } = await service
    .from('crate_quality_reviews')
    .select('id, sha256, verdict')
    .eq('listing_id', input.listingId)
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const review = reviewRaw as { id: string; sha256: string; verdict: string } | null
  if (!review || review.verdict !== 'passed') return { ok: false, reason: 'no_passing_review' }

  const download = await service.storage.from(source.bucket).download(source.path)
  if (download.error || !download.data) return { ok: false, reason: 'source_unreadable' }
  const sourceBytes = Buffer.from(await download.data.arrayBuffer())

  const destPath = captureObjectPath(input.listingId, extensionOf(source.path))
  const upload = await service.storage
    .from(CRATE_AUDIO_BUCKET)
    .upload(destPath, sourceBytes, { contentType: source.mimeType, upsert: true })
  if (upload.error) return { ok: false, reason: 'copy_failed' }

  // Read the COPY back. This is the step that makes the digest describe what The
  // Crate holds rather than what it was handed.
  const readback = await service.storage.from(CRATE_AUDIO_BUCKET).download(destPath)
  if (readback.error || !readback.data) {
    return { ok: false, reason: 'readback_failed', orphanPath: destPath }
  }
  const copiedBytes = Buffer.from(await readback.data.arrayBuffer())
  const sha256 = createHash('sha256').update(copiedBytes).digest('hex')

  // Fail BEFORE the RPC when we can already see the mismatch. The RPC checks it
  // again and is the authority; this is an early, cheaper refusal that also
  // keeps a pointless round trip out of the logs.
  if (sha256 !== review.sha256) {
    return { ok: false, reason: 'digest_mismatch', orphanPath: destPath }
  }

  const { data, error } = await service.rpc('crate_capture_admitted_song', {
    p_listing_id: input.listingId,
    p_quality_review_id: review.id,
    p_bucket: CRATE_AUDIO_BUCKET,
    p_path: destPath,
    p_sha256: sha256,
    p_size_bytes: copiedBytes.byteLength,
    p_mime_type: source.mimeType,
    p_title: input.title,
    p_primary_artist_name: input.primaryArtistName,
    p_payee_user_id: input.payeeUserId,
    p_captured_by: input.capturedBy,
    p_source_track_id: input.sourceTrackId,
    p_source_project_id: input.sourceProjectId,
  })
  if (error || typeof data !== 'string') {
    return { ok: false, reason: 'commit_failed', orphanPath: destPath }
  }

  return { ok: true, crateSongId: data, artifactPath: destPath }
}

/** Record a copy left behind by a failed capture, so a sweep can remove it. */
export async function enqueueCaptureOrphan(
  service: SupabaseClient,
  path: string
): Promise<void> {
  await service.rpc('crate_enqueue_capture_orphan', {
    p_bucket: CRATE_AUDIO_BUCKET,
    p_path: path,
  })
}
