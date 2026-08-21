import { renderPreviewIfAbsent } from '@/lib/watermark/stream-preview'

// ─── Job handler registry (audit #5 / #10) ────────────────────────────────
// Each handler runs a claimed job's work off the request path and returns a
// JSON-serializable result stored on the job row.
//   - 'watermark_preview' (#5) — the Selects preview render
//   - 'vault_export'      (#10) — the export-pack assembly (registered when wired)
export type JobHandler = (payload: Record<string, unknown>) => Promise<Record<string, unknown>>

export const JOB_HANDLERS: Record<string, JobHandler> = {
  // #5 — render a track's watermarked stream preview. renderPreviewIfAbsent is
  // idempotent (existence-checks first), so a re-run for an already-ready track
  // is a cheap no-op. A 'failed' result (e.g. no master audio) is a permanent
  // outcome, not an error — return it so the job completes rather than retrying.
  watermark_preview: async payload => {
    const trackId = String(payload.trackId ?? '')
    if (!trackId) throw new Error('watermark_preview job missing trackId')
    const result = await renderPreviewIfAbsent(trackId)
    return { status: result.status, path: result.path }
  },
}
