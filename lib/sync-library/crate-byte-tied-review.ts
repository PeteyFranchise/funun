import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TRACK_AUDIO_BUCKET, EXT_BY_MIME } from '@/lib/vault/track-audio'

// ─── Phase 50.5B — a quality review that names the bytes it approved ─────
//
// WHY THIS EXISTS. The quality verdict today is three columns on the LISTING
// (migration 107: quality_ok, quality_reviewed_by, quality_reviewed_at), written
// by the quality route. It records THAT a review happened and nothing about WHAT
// was reviewed. So an artist can replace the audio after a pass and the verdict
// still reads "ok" against bytes no reviewer ever heard, and admission would
// capture a song on the strength of it.
//
// This module computes the digest of the exact object being approved and records
// it in crate_quality_reviews. Admission (50.5B capture) then refuses unless the
// bytes it is about to copy still hash to the value the reviewer approved.
//
// DARK BY DEFAULT. The flag below stays false until migrations 248 and 251 are
// applied. While it is false the quality route behaves exactly as it does today,
// which matters because 248 is unapplied and the RPC does not exist yet.

export const BYTE_TIED_QUALITY_REVIEW_ENABLED = false

export type ReviewedObject = { bucket: string; path: string; mimeType: string }

export type ByteTiedReview = {
  sha256: string
  sizeBytes: number
  mimeType: string
  bucket: string
  path: string
}

/**
 * Where the reviewed audio lives. `tracks.audio_file_url` holds the storage PATH,
 * not a URL — the upload route is explicit about that ("store the storage PATH;
 * URLs are signed on read") — so the bucket is always the track-audio bucket.
 * Returns null when the track has no audio, which is a refusal reason rather
 * than an error: there is nothing to review.
 */
export function resolveReviewedObject(audioPath: string | null | undefined): ReviewedObject | null {
  if (typeof audioPath !== 'string') return null
  const path = audioPath.trim()
  if (path === '') return null

  const dot = path.lastIndexOf('.')
  if (dot <= 0) return null
  const ext = path.slice(dot + 1).toLowerCase()

  // Derive the type from the extension via the uploader's own map rather than a
  // restated list. An unknown extension is a refusal, not a guess.
  const mimeType = Object.keys(EXT_BY_MIME).find((m) => EXT_BY_MIME[m] === ext)
  if (!mimeType) return null

  return { bucket: TRACK_AUDIO_BUCKET, path, mimeType }
}

/**
 * Download the object and hash what came back. Deliberately hashes the BYTES
 * READ BACK rather than anything the caller supplied: the whole point is that the
 * digest describes the object as it actually exists at review time.
 */
export async function digestStorageObject(
  service: SupabaseClient,
  object: ReviewedObject
): Promise<ByteTiedReview | null> {
  const { data, error } = await service.storage.from(object.bucket).download(object.path)
  if (error || !data) return null

  const bytes = Buffer.from(await data.arrayBuffer())
  if (bytes.byteLength === 0) return null

  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.byteLength,
    mimeType: object.mimeType,
    bucket: object.bucket,
    path: object.path,
  }
}

/**
 * Record the review against those exact bytes.
 *
 * Writes through the narrow SECURITY DEFINER function from migration 251, never
 * by inserting directly: migration 248 revokes every write privilege on
 * crate_quality_reviews from service_role, so a direct insert fails by design.
 */
export async function recordByteTiedReview(
  service: SupabaseClient,
  input: {
    listingId: string
    reviewerId: string
    verdict: 'passed' | 'failed'
    notes: string | null
    review: ByteTiedReview
  }
): Promise<{ ok: true; reviewId: string } | { ok: false }> {
  const { data, error } = await service.rpc('crate_record_quality_review', {
    p_listing_id: input.listingId,
    p_source_bucket: input.review.bucket,
    p_source_path: input.review.path,
    p_sha256: input.review.sha256,
    p_size_bytes: input.review.sizeBytes,
    p_mime_type: input.review.mimeType,
    p_reviewer_id: input.reviewerId,
    p_verdict: input.verdict,
    p_notes: input.notes,
  })
  if (error || typeof data !== 'string') return { ok: false }
  return { ok: true, reviewId: data }
}
