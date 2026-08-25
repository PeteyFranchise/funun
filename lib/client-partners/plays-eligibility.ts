import type { ClientPartnerRow, HealthValue } from './columns'

// ─── Plays — own-book client-targeted assignment eligibility (D-31.2-09, T-31.2-17) ──
// Pure transform mirroring health.ts's "no I/O" doctrine — no @/lib/supabase
// import, no book-fetching of its own. The caller (plan 09's TodaysPlayBanner
// / My Client Partners loader) supplies the EVALUATING AE'S OWN BOOK
// (loadBook()'s output, lib/client-partners/signals.ts) — this module must
// never be handed a whole-org/global list (T-31.2-17, Pattern 3). Health is
// already resolved by computeHealth() upstream; this module never computes
// health itself (Don't Hand-Roll — always reuse computeHealth()).

/**
 * A book row shape for eligibility matching — ClientPartnerRow plus the
 * pipeline-stage KEY (not the display label `status`). Production wiring
 * (resolveStage(...).key, lib/client-partners/stages.ts, threaded through
 * loadBook()'s row assembly) is the caller's responsibility; this module is
 * pure over whatever book it's handed and never fetches/resolves a stage
 * itself.
 */
export type PlaysEligibilityRow = ClientPartnerRow & {
  pipelineStageKey?: string | null
}

export type AssignmentTargeting = {
  healthBand?: HealthValue | null
  pipelineStageKey?: string | null
}

/**
 * Counts how many rows in the evaluating AE's OWN book match a
 * client-targeted assignment's healthBand and/or pipelineStageKey filters —
 * a row matches when it satisfies EVERY filter that is set (AND, not OR); no
 * filter set at all matches the whole book (D-31.2-09a). ALWAYS call this
 * over an already own-book-scoped array — never a whole-org/global list.
 */
export function matchingClientCount(book: PlaysEligibilityRow[], assignment: AssignmentTargeting): number {
  return book.filter(
    row =>
      (!assignment.healthBand || row.health === assignment.healthBand) &&
      (!assignment.pipelineStageKey || row.pipelineStageKey === assignment.pipelineStageKey)
  ).length
}

// The existing My Client Partners route (app/(admin)/admin/client-partners) —
// no new filtered-list route/UI is introduced for Plays deep-links.
const CLIENT_PARTNERS_ROUTE = '/admin/client-partners'

/**
 * Builds the deep-link query string for a client-targeted assignment,
 * reusing the health/stage filter param names the My Client Partners list
 * is expected to read — never a new filter UI or a new route.
 */
export function buildAssignmentDeepLink(assignment: AssignmentTargeting): string {
  const params = new URLSearchParams()
  if (assignment.healthBand) params.set('health', assignment.healthBand)
  if (assignment.pipelineStageKey) params.set('stage', assignment.pipelineStageKey)
  const qs = params.toString()
  return qs ? `${CLIENT_PARTNERS_ROUTE}?${qs}` : CLIENT_PARTNERS_ROUTE
}
