// ─── Watermarked-preview signed-URL accessor (31-12) ───────────────────────
// The player's (31-13) ONLY audio accessor. Structurally incapable of
// resolving a master-bucket path (T-31-27, R12): it takes a track_id, not a
// storage path, and only ever signs a path inside the previews bucket. There
// is no parameter through which a caller could inject a master-bucket path.

import { createServiceClient } from '@/lib/supabase/server'
import { PREVIEWS_BUCKET, findExistingPreview, renderPreviewIfAbsent } from './stream-preview'

const SIGNED_URL_TTL_SECONDS = 60 * 10 // short-TTL per T-31-29

export type PreviewUrlResult =
  | { status: 'ready'; url: string }
  | { status: 'processing' }

/**
 * Resolve a short-TTL signed URL to a track's watermarked stream preview.
 *
 * If the preview is not yet rendered, this triggers renderPreviewIfAbsent
 * WITHOUT awaiting it (fire-and-forget) and returns 'processing' immediately
 * — the render never blocks the player's play/react/approve flow (T-31-28,
 * Vercel Hobby 10s maxDuration).
 */
export async function getPreviewSignedUrl(trackId: string): Promise<PreviewUrlResult> {
  const existing = await findExistingPreview(trackId)
  if (existing?.status === 'ready' && existing.path) {
    const service = createServiceClient()
    const { data: signed, error } = await service.storage
      .from(PREVIEWS_BUCKET)
      .createSignedUrl(existing.path, SIGNED_URL_TTL_SECONDS)
    if (!error && signed?.signedUrl) {
      return { status: 'ready', url: signed.signedUrl }
    }
  }

  // Not ready yet — kick off the pre-computed render in the background and
  // return immediately. Never await a render inside this accessor; a failed
  // background render simply leaves the track at 'processing' for the next
  // poll rather than surfacing here.
  void renderPreviewIfAbsent(trackId).catch(() => {})
  return { status: 'processing' }
}
