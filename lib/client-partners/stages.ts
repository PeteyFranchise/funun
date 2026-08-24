// ─── Client Partners — pipeline stage model (D-10) ──────────────────────────
// Pure days-in-stage math and configurable-stage resolution. Pure transforms
// — no I/O — mirroring lib/client-partners/columns.ts and health.ts. The
// leadership tower's server loader (plan 04) fetches buyer_orgs rows and the
// leadership-configurable pipeline_stages set, then calls these helpers.
//
// D-10: pipeline stages are leadership-configurable (New lead → Contacted →
// Active → Negotiating → Closed/Dormant by default), not hardcoded — the
// tower's "Stage · days" column reads stage_entered_at against whichever
// stage the row currently points at.

export type PipelineStage = {
  id: string
  key: string
  label: string
  sortOrder: number
  isTerminal: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Whole days elapsed since `stageEnteredAt`, floored at 0 (never negative,
 * guarding against clock skew). Returns null — never 0 or a fabricated
 * value — when `stageEnteredAt` is absent, so the tower renders the defined
 * no-data state instead of implying "just entered."
 */
export function daysInStage(stageEnteredAt: string | null, nowMs: number = Date.now()): number | null {
  if (!stageEnteredAt) return null
  const then = new Date(stageEnteredAt).getTime()
  if (!Number.isFinite(then)) return null
  const days = Math.floor((nowMs - then) / DAY_MS)
  return days < 0 ? 0 : days
}

/** Resolves a stage id against the leadership-configurable stage set; null for an unknown/absent id. */
export function resolveStage(stageId: string | null, stages: PipelineStage[]): PipelineStage | null {
  if (!stageId) return null
  return stages.find(s => s.id === stageId) ?? null
}
