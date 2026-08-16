import { SELECTS_STATUS_VALUES, type SelectsStatus } from './types'

// ─── Selects status legality — the single authority (R11) ─────────────────
// Pure function only — no Supabase client, no I/O — mirroring
// lib/deals/stage-machine.ts's shape. 31-04's send route and 31-13's
// respond route both call this before writing selects.status; neither
// route implements its own inline status check, so an illegal write
// (e.g. draft -> approved, or any backward move) is impossible by
// construction.
//
// Legal edges:
//   draft               -> sent
//   sent                -> approved
//   sent                -> changes_requested
//   changes_requested   -> sent            (re-send after a revision)
//   approved            is terminal (no legal outbound move in Slice 1)
// A same-stage self-transition is always illegal.

const LEGAL_EDGES: Record<SelectsStatus, ReadonlySet<SelectsStatus>> = {
  draft: new Set<SelectsStatus>(['sent']),
  sent: new Set<SelectsStatus>(['approved', 'changes_requested']),
  changes_requested: new Set<SelectsStatus>(['sent']),
  approved: new Set<SelectsStatus>(),
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set(SELECTS_STATUS_VALUES)

function isKnownStatus(value: string): value is SelectsStatus {
  return KNOWN_STATUSES.has(value)
}

/**
 * True only when moving from `from` to `to` is a legal Selects status
 * transition. Fails closed (false) on any unknown status value and on a
 * same-stage self-transition.
 */
export function isLegalSelectsTransition(from: SelectsStatus, to: SelectsStatus): boolean {
  if (!isKnownStatus(from) || !isKnownStatus(to)) return false
  if (from === to) return false
  return LEGAL_EDGES[from].has(to)
}
