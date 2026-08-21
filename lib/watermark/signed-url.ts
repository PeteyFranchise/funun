// ─── Watermarked-preview signed-URL accessor (31-12) ───────────────────────
// The player's (31-13) ONLY audio accessor. Structurally incapable of
// resolving a master-bucket path (T-31-27, R12): it takes a track_id, not a
// storage path, and only ever signs a path inside the previews bucket. There
// is no parameter through which a caller could inject a master-bucket path.

import { createServiceClient } from '@/lib/supabase/server'
import { PREVIEWS_BUCKET, findExistingPreview } from './stream-preview'
import { queuePreviewRender } from './preview-queue'

const SIGNED_URL_TTL_SECONDS = 60 * 10 // short-TTL per T-31-29

export type PreviewUrlResult =
  | { status: 'ready'; url: string }
  | { status: 'processing' }

/**
 * Resolve a short-TTL signed URL to a track's watermarked stream preview.
 *
 * If the preview is not yet rendered, this enqueues a durable render job (and
 * drains it inline via after()) and returns 'processing' immediately — the
 * render never blocks the player's play/react/approve flow (T-31-28, Vercel
 * Hobby 10s maxDuration).
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

  // Not ready yet — queue the render (idempotent per track; worker backstop +
  // inline after() drain) and return immediately. Never await the render here;
  // a failed render simply leaves the track at 'processing' for the next poll
  // rather than surfacing here.
  await queuePreviewRender(trackId)
  return { status: 'processing' }
}
