// ─── Sync-library status state machine (Phase 26, 26-CONTEXT.md) ─────────
// The SINGLE authority for legal sync_listings.status transitions. Wave 2
// write routes (26-03/04/05) MUST import isValidTransition/etc. rather than
// re-deriving the transition table inline (T-26-05 — Tampering / drift).
//
// AUTHORITATIVE flow per 26-CONTEXT.md decision #2 (overrides UI-SPEC's
// superseded applied→under_review→staff-accepts→agreement_pending
// progression): there is exactly ONE staff gate — admit/reject at
// pending_admit. Self-applied and invited songs differ only by
// entry_source metadata and their initial state, not by an extra gate.
//
// Pure: no I/O, no imports beyond types — mirrors lib/deals/catalog.ts's
// "accept already-fetched shape, reject invalid input early, never throw"
// style so this stays unit-testable without a DB.
import type { SyncListingStatus } from '@/types'

export const SYNC_LISTING_STATUSES = [
  'applied',
  'invited',
  'agreement_pending',
  'pending_admit',
  'admitted',
  'rejected',
  'withdrawn',
  'removed',
] as const satisfies readonly SyncListingStatus[]

// The legal edges, modeled as a Record<SyncListingStatus, SyncListingStatus[]>
// adjacency map so this table is the single source of truth — matches
// migration 096's CHECK enum exactly (supabase/migrations/096_sync_library.sql).
const LEGAL_TRANSITIONS: Record<SyncListingStatus, readonly SyncListingStatus[]> = {
  applied: ['agreement_pending', 'pending_admit', 'rejected', 'withdrawn'],
  invited: ['agreement_pending', 'pending_admit', 'rejected', 'withdrawn'],
  agreement_pending: ['pending_admit', 'rejected', 'withdrawn'],
  pending_admit: ['admitted', 'rejected', 'withdrawn'],
  admitted: ['removed', 'withdrawn'],
  // Terminal states — no legal edge out.
  rejected: [],
  withdrawn: [],
  removed: [],
}

function isKnownStatus(value: string): value is SyncListingStatus {
  return (SYNC_LISTING_STATUSES as readonly string[]).includes(value)
}

/**
 * Returns true only for a locked legal edge in LEGAL_TRANSITIONS. Unknown
 * status strings, self-loops, and any exit from a terminal state
 * (rejected/withdrawn/removed) all return false — never throws.
 */
export function isValidTransition(from: string, to: string): boolean {
  if (!isKnownStatus(from) || !isKnownStatus(to)) return false
  return LEGAL_TRANSITIONS[from].includes(to)
}

/**
 * The status the sign-completion webhook applies to the whole cohort of
 * songs covered by a just-signed blanket agreement. Returns null when the
 * current status isn't awaiting a signature (unknown input, or a status
 * that doesn't sit on the sign-in-progress path).
 */
export function nextStatusOnAgreementSigned(from: string): SyncListingStatus | null {
  if (!isKnownStatus(from)) return null
  if (from === 'applied' || from === 'invited' || from === 'agreement_pending') {
    return 'pending_admit'
  }
  return null
}

/**
 * The initial sync_listings.status for a freshly-created row, derived from
 * the entry path and whether the artist's blanket agreement is already
 * signed (post-sign-once submissions skip straight to pending_admit).
 */
export function initialStatusForEntry(
  source: 'self_applied' | 'admin_invited',
  alreadySigned: boolean
): SyncListingStatus {
  if (source === 'self_applied') return alreadySigned ? 'pending_admit' : 'applied'
  return alreadySigned ? 'pending_admit' : 'invited'
}

/** True for the three terminal statuses that have no legal edge out. */
export function isTerminal(status: string): boolean {
  if (!isKnownStatus(status)) return false
  return status === 'rejected' || status === 'withdrawn' || status === 'removed'
}
