// ─── Sync-library eligibility predicate (Phase 26, 26-CONTEXT.md) ────────
// Whether an artist may participate in the sync library is a pure
// predicate over an already-fetched capability_grants row — mirrors
// lib/deals/catalog.ts's isRightsReady "accept already-fetched shape, no
// I/O inside" convention exactly. Callers (dashboard card 26-08, staff
// invite route 26-05) do the DB read; this stays unit-testable without one.

export type CapabilityGrantLike = {
  capability: string
  status: string
}

/**
 * True only when the grant is the 'sync_library' capability AND its
 * status is 'approved' (T-26-06 — Elevation of Privilege: a pending grant
 * must never be treated as eligible). Null / any other capability /
 * non-approved status all return false.
 */
export function hasSyncLibraryCapability(grant: CapabilityGrantLike | null): boolean {
  if (grant == null) return false
  return grant.capability === 'sync_library' && grant.status === 'approved'
}
