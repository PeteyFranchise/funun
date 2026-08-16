// ─── WatermarkProvider Contract ─────────────────────────────────────────────
// The ONLY module the render pipeline (31-12) and the shareable player (31-13)
// import for watermarking. Neither call site hard-codes a transcode call or a
// specific vendor SDK — they depend on this interface.
//
// D-01 (layered watermark): the stream PREVIEW carries a subtle audible tag
// (kept non-intrusive so a 30s+ evaluative listen still works — R13 telemetry
// stays meaningful). The DOWNLOAD carries a clean-sounding forensic watermark
// (no audible tag) so it is genuinely usable to test-sync into a rough cut.
//
// D-03 (forensic payload): the download render's forensic payload encodes
// BOTH the Selects and the recipient/share-token, so a leaked file traces to
// the specific grantee it was issued to, even if forwarded.
//
// T-31-01 (Information Disclosure, mitigate): every render method below takes
// the master storage path ONLY as an input. It returns a NEW path in a
// PRIVATE bucket — never the master path itself. The player (31-13) may only
// ever sign the returned watermarked path; the master path must never be
// exposed to a request handler that serves unauthenticated token viewers.
//
// PRE-COMPUTED, NEVER INLINE (Vercel Hobby 10s maxDuration — Pitfall 5):
// both render methods are async and MUST be invoked outside the hot request
// path — rendered once per (track, share_token) at Send time or lazily on
// first open, with the result stored to a private bucket and served
// thereafter via a signed URL. No caller may await a render inside a request
// handler that also needs to return within the serverless time budget.
//
// A2 (owner-confirm, see README.md): the audible-tag character and the
// in-house-vs-third-party-service approach are flagged for owner sign-off at
// the Task 2 checkpoint before 31-12 implements against this contract.

/**
 * Lifecycle state for an async, pre-computed watermark render.
 * `pending` — render requested/queued, not yet available.
 * `ready`   — render complete; the stored path may be signed and served.
 * `failed`  — render attempt errored; caller should retry or surface a status.
 */
export type WatermarkRenderStatus = 'pending' | 'ready' | 'failed'

/**
 * A watermarked render that has been stored to a private bucket.
 * `path` is the PRIVATE bucket path of the rendered file — never the master
 * path. Callers sign THIS path (see lib/storage/index.ts conventions) to
 * produce a time-limited URL for the stream player or the download link.
 */
export type WatermarkRenderResult = {
  status: WatermarkRenderStatus
  path: string | null
  contentType: string | null
  renderedAt: string | null
}

/**
 * Shared input for both render methods. `masterAudioPath` is the source
 * master's storage path — an INPUT only; it is never returned or re-exposed.
 * `selectsId` scopes the render to a specific Selects (playlist).
 */
export type WatermarkRenderInput = {
  masterAudioPath: string
  selectsId: string
  trackId: string
}

/**
 * Forensic downloads additionally key the payload to the specific
 * recipient/share-token grantee (D-03), so a leaked file traces back to
 * exactly who it was issued to.
 */
export type WatermarkForensicInput = WatermarkRenderInput & {
  shareToken: string
}

/**
 * WatermarkProvider — the async, pre-computed render contract.
 *
 * Implementations (31-12) MUST:
 *   - run both methods outside any request handler's synchronous path
 *   - store output to a PRIVATE bucket (never public)
 *   - return only the new watermarked path, never the master path
 *
 * This interface intentionally declares NO method bodies. Implementation is
 * out of scope for this plan (31-01) — it is built in 31-12 once the
 * approach + audible-tag character are owner-confirmed (Task 2 checkpoint).
 */
export interface WatermarkProvider {
  /**
   * Render the stream-preview tag: a brief, soft, non-intrusive audible tag
   * mixed into the preview stream (D-01). Kept subtle enough that a genuine
   * 30s+ evaluative listen (R13's qualified-listen bar) remains meaningful.
   */
  renderStreamPreview(input: WatermarkRenderInput): Promise<WatermarkRenderResult>

  /**
   * Render the forensic download: a clean-sounding (inaudible) forensic
   * watermark keyed to both the Selects AND the recipient/share-token
   * (D-03), so the file is genuinely usable to test-sync while remaining
   * traceable to its grantee if it leaks.
   */
  renderForensicDownload(input: WatermarkForensicInput): Promise<WatermarkRenderResult>
}
