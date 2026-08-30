// ─── Catalogue audio — the server-side half ─────────────────────────
// The signed-URL batch reader, plus a re-export of the pure MIME layer
// (audio-mime.ts) so server-side callers — the versions route, the work
// page — keep importing everything from this one path. The pure layer
// lives apart because hum-capture.ts (client) needs `extensionForMime`,
// and importing it from here would drag lib/supabase/server's
// next/headers into the browser bundle and fail the production build.
// Adapted from app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts,
// which owns the pattern this module and the versions route both follow.
// Reuses the EXISTING `track-audio` bucket (migration 004) — no new
// bucket, no new storage migration, for either capture path.

import { createServiceClient } from '@/lib/supabase/server'
import { BUCKET } from '@/lib/catalogue/audio-mime'

export {
  BUCKET,
  MAX_BYTES,
  EXT_BY_MIME,
  extensionForMime,
  storageContentType,
  buildVersionPath,
} from '@/lib/catalogue/audio-mime'

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
