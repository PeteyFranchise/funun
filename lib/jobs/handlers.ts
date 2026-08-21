// ─── Job handler registry (audit #5 / #10) ────────────────────────────────
// Each handler runs a claimed job's work off the request path and returns a
// JSON-serializable result stored on the job row. Handlers are registered here
// as features move onto the queue:
//   - 'watermark_preview' (#5) — the Selects preview render
//   - 'vault_export'      (#10) — the export-pack assembly
// (Empty until the feature-wiring stages register them.)
export type JobHandler = (payload: Record<string, unknown>) => Promise<Record<string, unknown>>

export const JOB_HANDLERS: Record<string, JobHandler> = {}
