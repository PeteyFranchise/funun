// ─── Catalogue audio — the pure MIME layer ──────────────────────────
// Split out of audio.ts so client code (hum-capture.ts, and through it
// the recording components) can use the allow-list and extension logic
// without dragging lib/supabase/server — and its next/headers import —
// into the browser bundle. audio.ts re-exports everything here, so
// server-side callers keep their single import path. This module must
// stay import-free: anything with I/O belongs in audio.ts.

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
