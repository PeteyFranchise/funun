import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveSelectsByToken, loadOwnSelectsTrack } from '@/lib/selects/public-resolve'
import { PREVIEWS_BUCKET, findExistingPreview, renderPreviewIfAbsent, renderForensicDownload } from '@/lib/watermark/stream-preview'

// ─── GET/POST /api/selects/[token]/download — account-gated, watermarked- ──
// ONLY, D-02-configurable (R12/D-01/D-02/D-03). NEVER resolves or reads a
// master-bucket path — this route imports ONLY the watermark-pipeline's
// PUBLIC output accessors (PREVIEWS_BUCKET, findExistingPreview,
// renderPreviewIfAbsent, renderForensicDownload), never
// lib/metadata/schema.ts's readMasterAudio or the `track-audio` bucket
// name, so there is structurally no code path here that could sign a
// clean master (mirrors lib/watermark/signed-url.ts's own T-31-27 posture,
// which this route deliberately follows rather than re-deriving).
//
// Order of checks (each fails CLOSED, never open):
//   1. token resolves + track belongs to THIS Selects (scope-safe, TOCTOU)
//   2. download_enabled — the D-02 kill switch
//   3. caller is an authenticated Client Partner (ANY buyer_members row) —
//      a guest gets 'gate', never a file (R12 must_haves truth)
//   4. download_max_seconds (D-02 length cap) — see the 'capped' status
//      below for why this fails closed rather than serving a trimmed clip
//   5. resolve a watermarked artifact: prefer the A2 forensic per-share
//      render (D-03) when ready; it is currently a stubbed fast-follow
//      (lib/watermark/stream-preview.ts's renderForensicDownload always
//      returns 'pending' today — see README.md) so this falls through to
//      the audibly-tagged stream-preview render as the INTERIM watermarked
//      download file (plan-sanctioned: "serve the audible-tagged
//      watermarked stream-preview render as the interim watermarked file
//      OR return a 'download preparing' status — NEVER a clean master").
const SIGNED_DOWNLOAD_TTL_SECONDS = 60 * 5

const DownloadParamsSchema = z.object({ trackId: z.string().uuid() })

type DownloadResult =
  | { status: 'ok'; url: string }
  | { status: 'gate' }
  | { status: 'disabled' }
  | { status: 'capped' }
  | { status: 'processing' }
  | { status: 'not_found' }
  | { status: 'invalid'; error: string }

async function isAuthenticatedClientPartner(): Promise<boolean> {
  try {
    const apiClient = await createApiClient()
    const {
      data: { user },
    } = await apiClient.auth.getUser()
    if (!user) return false
    const service = createServiceClient()
    const { data: member } = await service.from('buyer_members').select('user_id').eq('user_id', user.id).maybeSingle()
    return member != null
  } catch {
    return false
  }
}

async function handleDownload(token: string, rawTrackId: string | null): Promise<DownloadResult> {
  const parsedParams = DownloadParamsSchema.safeParse({ trackId: rawTrackId })
  if (!parsedParams.success) return { status: 'invalid', error: 'trackId is required.' }

  const service = createServiceClient()
  const selects = await resolveSelectsByToken(service, token)
  if (!selects) return { status: 'not_found' }

  const selectsTrack = await loadOwnSelectsTrack(service, selects.id, parsedParams.data.trackId)
  if (!selectsTrack) return { status: 'not_found' }

  // D-02 kill switch — visible-but-disabled in the UI, refused server-side.
  if (!selects.download_enabled) return { status: 'disabled' }

  // Guest gate — never a file. play/keep/pass/approve stay open with no
  // login; only download (and licensing) require the free account.
  const isClientPartner = await isAuthenticatedClientPartner()
  if (!isClientPartner) return { status: 'gate' }

  // D-02 length cap. No audio-trimming primitive exists in the watermark
  // pipeline yet (lib/watermark/stream-preview.ts renders whole-file only)
  // — rather than silently ignore the AE's configured cap, this fails
  // CLOSED: a track longer than the configured cap is refused entirely
  // until a trim step exists (tracked as a known limitation, see
  // 31-13-SUMMARY.md — mirrors the D-03 forensic file's own A2
  // fast-follow posture: never serve more than the AE configured).
  if (selects.download_max_seconds != null) {
    const { data: trackRow } = await service
      .from('tracks')
      .select('duration_seconds')
      .eq('id', selectsTrack.track_id)
      .maybeSingle()
    const duration = (trackRow as { duration_seconds: number | null } | null)?.duration_seconds ?? null
    if (duration != null && duration > selects.download_max_seconds) {
      return { status: 'capped' }
    }
  }

  // A2 fast-follow — currently always 'pending' (stubbed). Calling it here
  // (with no resolved master path — '' is a hardcoded placeholder, never a
  // real storage path, since the current implementation ignores its input
  // entirely) keeps this route forward-compatible: the day 31-12's A2
  // follow-up implements real forensic rendering, this branch starts
  // returning 'ready' with no change needed here.
  const forensic = await renderForensicDownload({
    masterAudioPath: '',
    selectsId: selects.id,
    trackId: selectsTrack.track_id,
    shareToken: token,
  })
  if (forensic.status === 'ready' && forensic.path) {
    const { data: signed, error } = await service.storage
      .from(PREVIEWS_BUCKET)
      .createSignedUrl(forensic.path, SIGNED_DOWNLOAD_TTL_SECONDS, { download: true })
    if (!error && signed?.signedUrl) return { status: 'ok', url: signed.signedUrl }
  }

  // Interim: the audibly-tagged stream-preview render, signed with
  // download:true (Content-Disposition attachment) — watermarked, never a
  // master, per the plan's explicit sanction above.
  const existing = await findExistingPreview(selectsTrack.track_id)
  if (existing?.status === 'ready' && existing.path) {
    const { data: signed, error } = await service.storage
      .from(PREVIEWS_BUCKET)
      .createSignedUrl(existing.path, SIGNED_DOWNLOAD_TTL_SECONDS, { download: true })
    if (!error && signed?.signedUrl) return { status: 'ok', url: signed.signedUrl }
  }

  // Not rendered yet — kick off the background render (never awaited here,
  // mirrors lib/watermark/signed-url.ts's getPreviewSignedUrl) and report
  // 'processing' rather than blocking this request past the serverless
  // time budget.
  void renderPreviewIfAbsent(selectsTrack.track_id).catch(() => {})
  return { status: 'processing' }
}

function statusToHttp(result: DownloadResult): number {
  switch (result.status) {
    case 'ok':
      return 200
    case 'not_found':
      return 404
    case 'invalid':
      return 400
    default:
      return 200 // gate/disabled/capped/processing are all valid, non-error states the player renders inline
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const trackId = typeof body.trackId === 'string' ? body.trackId : null
  const result = await handleDownload(token, trackId)
  return NextResponse.json({ data: result }, { status: statusToHttp(result) })
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const trackId = new URL(request.url).searchParams.get('trackId')
  const result = await handleDownload(token, trackId)
  return NextResponse.json({ data: result }, { status: statusToHttp(result) })
}
