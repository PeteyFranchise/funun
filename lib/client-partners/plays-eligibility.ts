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

/** Shared AND-match predicate — a row matches when it satisfies EVERY filter that is set; no filter set at all matches. */
function rowMatchesAssignment(row: PlaysEligibilityRow, assignment: AssignmentTargeting): boolean {
  return (
    (!assignment.healthBand || row.health === assignment.healthBand) &&
    (!assignment.pipelineStageKey || row.pipelineStageKey === assignment.pipelineStageKey)
  )
}

/**
 * Counts how many rows in the evaluating AE's OWN book match a
 * client-targeted assignment's healthBand and/or pipelineStageKey filters —
 * a row matches when it satisfies EVERY filter that is set (AND, not OR); no
 * filter set at all matches the whole book (D-31.2-09a). ALWAYS call this
 * over an already own-book-scoped array — never a whole-org/global list.
 */
export function matchingClientCount(book: PlaysEligibilityRow[], assignment: AssignmentTargeting): number {
  return book.filter(row => rowMatchesAssignment(row, assignment)).length
}

// ─── applyPlayFilter — the My Client Partners deep-link row filter (CR-01) ──
// The row-level counterpart to matchingClientCount, consumed by
// ClientPartnersRoom.tsx when a Plays deep-link (buildAssignmentDeepLink's
// ?health=&stage= query string) lands on /admin/client-partners. Shares the
// EXACT SAME rowMatchesAssignment predicate as matchingClientCount so the
// banner's "N in your book" count and the filtered list's row count can
// never drift apart (D-31.2-09a).
export type PlayFilter = { health: string | null; stage: string | null }

/**
 * Filters rows to only those matching an active Plays deep-link filter — a
 * null filter, or a filter with neither health nor stage set, is the
 * identity transform (matches matchingClientCount's "no filter matches the
 * whole book" contract).
 */
export function applyPlayFilter<T extends PlaysEligibilityRow>(
  rows: T[],
  filter: PlayFilter | null | undefined
): T[] {
  if (!filter) return rows
  const assignment: AssignmentTargeting = {
    healthBand: (filter.health ?? null) as AssignmentTargeting['healthBand'],
    pipelineStageKey: filter.stage ?? null,
  }
  if (!assignment.healthBand && !assignment.pipelineStageKey) return rows
  return rows.filter(row => rowMatchesAssignment(row, assignment))
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
