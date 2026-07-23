// ─── Split-sheet readiness tier map ──────────────────────────────────
// Single source of truth for the 5/10/15 tiering of the split_sheets
// readiness item (P17-03 / P17-03-impl). BOTH the DB trigger redefinition
// (migration 062, string-asserted in its own test) and the TS twin
// readinessItemsForProject() (lib/vault/readiness.ts, extended in 17-02)
// MUST agree with this map — RESEARCH Pitfall 3 names drift between those
// two derivations as the phase's single biggest risk, so the numbers live
// here once and both consume it (ESIGN-08).
//
// The item stays 15 points in READINESS_ITEMS (types/index.ts) — this is a
// derivation change, not a registry/points change.

export type SplitSheetStatus =
  | 'draft'
  | 'pending_approval'
  | 'countered'
  | 'approved'
  | 'esign_pending'
  | 'executed'

export const SPLIT_SHEET_TIER_MAP: Record<SplitSheetStatus, number> = {
  draft: 0,
  pending_approval: 5,
  countered: 5,
  approved: 10,
  esign_pending: 10,
  executed: 15,
}

/** Tier for a single split sheet's pipeline status. An unrecognized status
 * (e.g. a future enum value not yet mapped) is treated as draft (0) rather
 * than throwing, so a schema/enum drift degrades to "not ready" instead of
 * crashing the readiness derivation. */
export function deriveSheetTier(status: string): number {
  return SPLIT_SHEET_TIER_MAP[status as SplitSheetStatus] ?? 0
}

/**
 * The pessimistic (MIN) tier across every split sheet tied to a project —
 * mirrors signedOf()'s all-must-be-signed semantics (P17-03, RESEARCH Open
 * Question 3's recommended interpretation). An empty list returns null (no
 * pipeline signal at all), letting the caller fall back to the legacy
 * wet-sign vault_documents check (AM-1's universal fallback) instead of
 * treating "no split sheets yet" as tier 0.
 */
export function projectSplitTier(statuses: string[]): number | null {
  if (statuses.length === 0) return null
  return Math.min(...statuses.map(deriveSheetTier))
}

/** True only for 'countered' — drives the visible "renegotiating" flag.
 * A counter is progress, not regression, but it never scores above
 * consensus: countered stays tier 5, same as pending_approval. */
export function isRenegotiating(status: string): boolean {
  return status === 'countered'
}
