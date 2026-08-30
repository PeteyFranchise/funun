// ─── Catalogue audio — the MIME allow-list, the size ceiling, the path ───
// convention, and the signed-URL batch reader. Adapted from
// app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts, which owns
// the pattern this module and the versions route both follow. Reuses the
// EXISTING `track-audio` bucket (migration 004) — no new bucket, no new
// storage migration, for either capture path.
//
// One thing this module does that the original route did not have to:
// hum capture's Blob carries a MediaRecorder-resolved MIME type, which on
// Chrome/Firefox/Edge is `audio/webm;codecs=opus` and on Safari can be
// `audio/mp4;codecs=mp4a.40.2` — NOT the bare types migration 004's bucket
// allow-lists. `baseMimeType()` strips the `;codecs=...` parameter before
// any lookup or before any byte reaches storage, so (a) the allow-list
// check and the derived extension work for both codec-qualified and bare
// MIME strings, and (b) the Content-Type this module hands to
// `storage.upload()` is always one of the bucket's own bare allowed types,
// never a codec-qualified variant the bucket was never asked to allow.

import { createServiceClient } from '@/lib/supabase/server'

// ─── Constants ──────────────────────────────────────────────────────

export const BUCKET = 'track-audio'

export const MAX_BYTES = 50 * 1024 * 1024 // matches migration 004's file_size_limit exactly

/**
 * Migration 004 already allow-lists exactly these bare MIME types on the
 * `track-audio` bucket's own `allowed_mime_types` — hum capture needs no
 * storage migration at all. Keyed on the BASE type (no `;codecs=...`
 * parameter); `extensionForMime()` normalizes before it looks up here.
 *
 * Covers the WebM family (Chrome/Firefox/Edge's MediaRecorder default) and
 * the MP4/AAC family (Safari's default, on every version) alongside the
 * ordinary upload formats — MPEG, WAV and FLAC — plus OGG, since the
 * bucket already allows it and a narrower map here would 415 an upload the
 * bucket itself would have accepted.
 */
export const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'audio/ogg': 'ogg',
}

// ─── Pure helpers ───────────────────────────────────────────────────

/** Strips a `;codecs=...` (or any other) MIME parameter and lowercases. */
function baseMimeType(mime: string): string {
  return mime.split(';')[0]!.trim().toLowerCase()
}

/**
 * Returns the mapped extension for `mime`, or null when it is not on the
 * allow-list — including a plausible-looking type nobody added (e.g.
 * `audio/opus` bare, or `audio/wave`). Normalizes codec parameters first,
 * so `audio/webm;codecs=opus` (Chrome's MediaRecorder) and `audio/webm`
 * (an uploaded file) both resolve to the same extension.
 */
export function extensionForMime(mime: string): string | null {
  return EXT_BY_MIME[baseMimeType(mime)] ?? null
}

/**
 * The Content-Type to hand `storage.upload()` — always the bucket's own
 * bare allowed type, even when `mime` arrived codec-qualified. Returns
 * null when `mime` isn't on the allow-list at all, mirroring
 * `extensionForMime()`.
 */
export function storageContentType(mime: string): string | null {
  const base = baseMimeType(mime)
  return EXT_BY_MIME[base] ? base : null
}

/**
 * The work-scoped storage path: `{workId}/{versionId}.{ext}` — deliberately
 * no owner-id prefix (RESEARCH Pitfall 2). Migration 004's storage.objects
 * policies check that the first folder segment equals the caller's own
 * auth id, and Phase 21 never widened them for shared projects, so an
 * owner-id-prefixed path would make even that inert defense-in-depth layer
 * reject a legitimate collaborator's upload the moment anyone exercised it
 * directly. Access to version audio is gated in the versions route through
 * `work_member_tier()`, before storage is touched at all — the storage
 * policies themselves stay exactly as migration 004 wrote them.
 */
export function buildVersionPath(workId: string, versionId: string, ext: string): string {
  return `${workId}/${versionId}.${ext}`
}

// ─── I/O — the one thin function in this module ────────────────────

const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60 * 2 // two hours — matches app/(artist)/vault/[projectId]/page.tsx's pattern

/**
 * Batch-mints signed URLs for a set of `track-audio` storage paths, one
 * call for the whole set (matching the pattern
 * `app/(artist)/vault/[projectId]/page.tsx` already uses rather than one
 * round-trip per path). Returns a map keyed by path; a path that failed to
 * sign maps to null rather than being silently dropped, so a caller can
 * tell "no URL" apart from "path never asked for".
 *
 * Precondition: the caller has already resolved work access for every
 * version these paths belong to — this function does no authorization of
 * its own, exactly like the vault page's inline signing block it mirrors.
 */
export async function signVersionUrls(
  paths: string[],
  ttlSeconds: number = DEFAULT_SIGNED_URL_TTL_SECONDS
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {}
  if (paths.length === 0) return out

  const service = createServiceClient()
  const { data } = await service.storage.from(BUCKET).createSignedUrls(paths, ttlSeconds)

  for (const path of paths) out[path] = null
  for (const row of data ?? []) {
    if (row.path) out[row.path] = row.signedUrl ?? null
  }
  return out
}
