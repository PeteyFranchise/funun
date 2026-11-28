import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash, randomUUID } from 'crypto'
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
  | 'already_captured_different_bytes'
  | 'commit_failed'
  | 'commit_ambiguous'

export type CaptureResult =
  // `outcome` distinguishes a fresh capture from a replay. On a replay the
  // authoritative path is the EXISTING artifact's, not the one this attempt
  // uploaded, and `strayPath` is this attempt's copy, which is now unreferenced.
  | { ok: true; outcome: 'created' | 'replayed'; crateSongId: string; artifactPath: string; strayPath?: string }
  | { ok: false; reason: CaptureFailure; orphanPath?: string }

/**
 * Where a capture ATTEMPT writes. Per attempt, not per listing.
 *
 * M2 (review 2026-11-28): a deterministic per-listing path plus `upsert: true`
 * meant two concurrent admissions wrote the same object. The loser's failure
 * then enqueued for deletion the very path holding the WINNER's live
 * review_playback, so a cleanup sweep could delete the surviving song's required
 * artifact. A unique suffix per attempt means a loser only ever cleans up its
 * own file. The database refuses to queue a referenced path as well; this is the
 * half that stops the collision happening at all.
 */
export function captureObjectPath(listingId: string, ext: string, attemptId: string): string {
  return `captured/${listingId}/${attemptId}.review_playback.${ext}`
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

  const destPath = captureObjectPath(input.listingId, extensionOf(source.path), randomUUID())
  // No upsert: a path collision should fail loudly rather than overwrite bytes
  // another attempt may already have hashed and recorded.
  const upload = await service.storage
    .from(CRATE_AUDIO_BUCKET)
    .upload(destPath, sourceBytes, { contentType: source.mimeType, upsert: false })
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

  // M4: the caller now supplies ONLY what it alone can know — the digest of the
  // bytes it uploaded, and the acting staff id. Track, project, payee, title and
  // artist name are derived inside the function from the locked listing, because
  // service_role is shared by ordinary application code and a caller-supplied
  // identity is a forgery interface.
  const { data, error } = await service.rpc('crate_capture_admitted_song', {
    p_listing_id: input.listingId,
    p_bucket: CRATE_AUDIO_BUCKET,
    p_path: destPath,
    p_sha256: sha256,
    p_size_bytes: copiedBytes.byteLength,
    p_mime_type: source.mimeType,
    p_captured_by: input.capturedBy,
  })
  // M3 (review 2026-11-28): AN ERROR IS NOT PROOF THAT NOTHING COMMITTED.
  // Previously every error became commit_failed and the caller queued its path
  // as an orphan. If the transaction had in fact committed and only the response
  // was lost, that queued the LIVE object for deletion. So a definitive
  // database refusal and an ambiguous transport failure are now different
  // things, and only the definitive one is allowed to trigger cleanup.
  if (error) {
    const code = (error as { code?: string }).code
    if (code === '23505') {
      // The database says this listing is already captured holding other bytes.
      // Definitive, and retrying cannot cure it.
      return { ok: false, reason: 'already_captured_different_bytes', orphanPath: destPath }
    }
    if (code && code !== '08000' && code !== '08006' && code !== '57014') {
      return { ok: false, reason: 'commit_failed', orphanPath: destPath }
    }
    // No SQLSTATE, or a connection/cancellation class: we do not know whether it
    // committed. Leave the object alone. A sweep that reconciles against the
    // database can resolve it later; deleting now can destroy a live artifact.
    return { ok: false, reason: 'commit_ambiguous' }
  }

  const outcome = (data as { outcome?: string } | null)?.outcome
  const crateSongId = (data as { crate_song_id?: string } | null)?.crate_song_id
  const artifactPath = (data as { artifact_path?: string } | null)?.artifact_path
  if ((outcome !== 'created' && outcome !== 'replayed') || !crateSongId || !artifactPath) {
    // A shape we do not recognise is also not proof that nothing committed.
    return { ok: false, reason: 'commit_ambiguous' }
  }

  return {
    ok: true,
    outcome,
    crateSongId,
    artifactPath,
    // On a replay our upload is unreferenced: report it so the caller can clean
    // up its own copy rather than leaking it, which the old bare-id return did.
    ...(outcome === 'replayed' && artifactPath !== destPath ? { strayPath: destPath } : {}),
  }
}

/**
 * Record a copy left behind by a failed capture, so a sweep can remove it.
 *
 * M5 (review 2026-11-28): this used to ignore the RPC result, so a route could
 * return having lost the only record of the file it left behind. Now the result
 * is propagated, and if the durable record cannot be written we try to delete
 * the object immediately rather than leaking it silently. Both failing is worth
 * surfacing: it means an unreferenced object exists with nothing tracking it.
 */
export async function enqueueCaptureOrphan(
  service: SupabaseClient,
  listingId: string,
  path: string
): Promise<{ ok: true } | { ok: false; deleted: boolean; refusedAsLive: boolean }> {
  const { error } = await service.rpc('crate_enqueue_capture_orphan', {
    p_listing_id: listingId,
    p_bucket: CRATE_AUDIO_BUCKET,
    p_path: path,
  })
  if (!error) return { ok: true }

  // M3 (review 2026-11-28): the database refuses to queue a path a captured
  // artifact references. That refusal means the object is LIVE, and deleting it
  // is precisely the wrong response — it was the response the first version
  // gave, because it treated every enqueue error as permission to delete.
  const refusedAsLive = (error as { code?: string }).code === '23514'
    || /captured artifact references it/i.test((error as { message?: string }).message ?? '')
  if (refusedAsLive) return { ok: false, deleted: false, refusedAsLive: true }

  const removal = await service.storage.from(CRATE_AUDIO_BUCKET).remove([path])
  return { ok: false, deleted: !removal.error, refusedAsLive: false }
}
