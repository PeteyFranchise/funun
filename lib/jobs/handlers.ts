// ─── Job handler registry (audit #5 / #10) ────────────────────────────────
// Each handler runs a claimed job's work off the request path and returns a
// JSON-serializable result stored on the job row.
//   - 'watermark_preview' (#5) — the Selects preview render
//   - 'vault_export'      (#10) — the export-pack assembly
//
// Handlers load their heavy deps (ffmpeg/sharp render pipeline, archiver + PDF
// renderers) via dynamic import so merely importing this registry — which the
// inline after() drains do on hot request paths — pulls in nothing heavy. The
// deps load only when a job of that type actually runs.
export type JobHandler = (payload: Record<string, unknown>) => Promise<Record<string, unknown>>

export const JOB_HANDLERS: Record<string, JobHandler> = {
  lyric_lift: async payload => {
    const liftId = String(payload.liftId ?? '')
    if (!liftId) throw new Error('lyric_lift job missing liftId')
    const { processLyricLift } = await import('@/lib/catalogue/lyric-lift-service')
    return processLyricLift(liftId)
  },

  // #5 — render a track's watermarked stream preview. renderPreviewIfAbsent is
  // idempotent (existence-checks first), so a re-run for an already-ready track
  // is a cheap no-op. A 'failed' result (e.g. no master audio) is a permanent
  // outcome, not an error — return it so the job completes rather than retrying.
  watermark_preview: async payload => {
    const trackId = String(payload.trackId ?? '')
    if (!trackId) throw new Error('watermark_preview job missing trackId')
    const { renderPreviewIfAbsent } = await import('@/lib/watermark/stream-preview')
    const result = await renderPreviewIfAbsent(trackId)
    return { status: result.status, path: result.path }
  },

  // #10 — assemble a project's export pack off the 10s request path. Re-loads
  // the plan fresh at run time (files may have changed since enqueue) and
  // re-gates ownership (via loadExportPlan's user_id scoping), master presence,
  // and size. Returns the pack path; the ownership-checked status route mints a
  // fresh signed URL from it when the client polls.
  vault_export: async payload => {
    const projectId = String(payload.projectId ?? '')
    const userId = String(payload.userId ?? '')
    const mode = payload.mode === 'share' ? 'share' : 'download'
    if (!projectId || !userId) throw new Error('vault_export job missing projectId/userId')

    const { createServiceClient } = await import('@/lib/supabase/server')
    const { loadExportPlan, assembleAndUploadPack, MAX_PACK_BYTES } = await import(
      '@/lib/vault/export-assemble'
    )

    const service = createServiceClient()
    const plan = await loadExportPlan(service, { projectId, userId })
    if (!plan) throw new Error('vault_export: project not found or not owned')
    if (!plan.manifest.hasMaster) throw new Error('vault_export: no master audio')
    if (plan.totalBytes > MAX_PACK_BYTES) throw new Error('vault_export: pack too large to assemble')

    const packPath = `${userId}/${projectId}/export-pack.zip`
    await assembleAndUploadPack(service, { manifest: plan.manifest, packPath })
    return { path: packPath, mode }
  },
}
