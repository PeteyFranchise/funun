import type { SyncListingStatus } from '@/types'

// ─── trackExposure — may this EXACT track appear in The Crate? ───────────
//
// Owner decision D-11, locked 2026-10-11
// (.planning/deliberations/2026-10-10-owner-decisions-phase-50-rescope.md):
//
//   "Any musically complete song with a playable finished master may appear in
//    The Crate once staff admits that exact track. Rights paperwork and other
//    clearance work may still be outstanding."
//
// This is ONE of two separate authorities. It answers discoverability only.
// trackClearance answers "what remains before this can be licensed", and a
// non-ready clearance changes a BADGE — it never removes a track from the
// catalogue.
//
// WHAT THIS DELIBERATELY DOES NOT DECIDE, because conflating them is the
// defect D-11 exists to correct:
//   - it is not licence authority;
//   - it is not a rights statement;
//   - it is not clearance.
// 'exposed' means discoverable in The Crate. Nothing more.
//
// WHY THE INPUT TYPE IS SO NARROW. It carries this track's id, its bound audio
// path, and the status of ITS OWN listing — and nothing else. Readiness items,
// Stage3Result and AI provenance are absent BY DESIGN: under D-11 none of them
// may influence exposure, and a type that cannot express the forbidden
// decision is stronger than a comment asking the next reader not to make it.
// The previous model gated visibility on six readiness keys, and the result was
// an admitted song the artist was congratulated for that no buyer could ever
// see (50-RESEARCH.md §7).
//
// PER TRACK, NEVER PER PROJECT. D-11: "A complete admitted track is never
// hidden because a sibling track on the same EP or album is incomplete." The
// listing status passed in must be the row for THIS track id.

export type TrackExposureInput = {
  /** The exact track under consideration. */
  trackId: string
  /**
   * The track's bound audio object. D-11 requires a real playable master
   * "proven by an actual bound audio object/path, not merely the existence of
   * a `tracks` row", so `tracks.audio_file_url` is the evidence — nullable in
   * schema (001_initial_schema.sql:123). Same fact
   * lib/eligibility/direct-overlay.ts:117 derives as `hasMaster`.
   */
  audioFileUrl: string | null
  /**
   * The status of THIS track's own sync_listings row, or null when it has
   * none. Never a sibling's, never a project-level aggregate.
   */
  listingStatus: SyncListingStatus | null
}

export type TrackExposure =
  | { status: 'exposed' }
  | { status: 'not_admitted' }
  | { status: 'no_playable_master' }
  | { status: 'unavailable'; reason: 'rejected' | 'withdrawn' | 'removed' }

/**
 * Listing states that make Funūn unable to offer the track at all. D-11 is
 * explicit that this "is not the same as ordinary clearance work in progress".
 */
const TERMINAL: readonly SyncListingStatus[] = ['rejected', 'withdrawn', 'removed']

/** A bound audio object, not merely a non-null column. */
function hasPlayableMaster(audioFileUrl: string | null): boolean {
  return typeof audioFileUrl === 'string' && audioFileUrl.trim() !== ''
}

export function trackExposure(input: TrackExposureInput): TrackExposure {
  // Terminal first: it outranks everything, including a missing master. A
  // withdrawn track is 'unavailable' rather than 'no_playable_master', because
  // the reason a buyer cannot have it is the withdrawal.
  if (input.listingStatus !== null && TERMINAL.includes(input.listingStatus)) {
    return { status: 'unavailable', reason: input.listingStatus as 'rejected' | 'withdrawn' | 'removed' }
  }
  // This exact track's own admission. A sibling's admission is not this
  // track's, and no project-level flag substitutes for it.
  if (input.listingStatus !== 'admitted') return { status: 'not_admitted' }
  // D-11's playability requirement.
  if (!hasPlayableMaster(input.audioFileUrl)) return { status: 'no_playable_master' }
  return { status: 'exposed' }
}

/** Convenience predicate for call sites that only need the boolean. */
export function isTrackExposed(input: TrackExposureInput): boolean {
  return trackExposure(input).status === 'exposed'
}

// ─── resolveListingStatus — WHICH listing row describes this track now ───
//
// trackExposure takes ONE status and ranks terminal first, which is correct for
// a single row and wrong if the caller hands it history. Terminal rows
// accumulate on purpose: `sync_listings_active_track_uniq`
// (supabase/migrations/096_sync_library.sql:63) is a PARTIAL unique index over
// the five ACTIVE statuses only, and its own comment states that re-submission
// after any terminal outcome is deliberately allowed without cleanup. So a
// track may hold a withdrawn row from last month AND an admitted row now.
//
// The active row therefore WINS; terminal rows are history. A terminal row
// describes the track's current state only when no active row exists. Without
// this, a withdrawn-then-re-admitted track would read 'unavailable' forever.
//
// Lives here rather than at each call site because three query modules need the
// same precedence, and a subtle rule copied three times drifts.

/** The five statuses the partial unique index treats as live. */
const ACTIVE: readonly SyncListingStatus[] = [
  'applied',
  'invited',
  'agreement_pending',
  'pending_admit',
  'admitted',
]

export type ListingStatusRow = { status: SyncListingStatus; created_at?: string | null }

/**
 * Picks the row that describes the track now: the single active row if there is
 * one, else the most recently created terminal row, else null for a track that
 * has never been listed. Rows may arrive in any order.
 */
export function resolveListingStatus(rows: readonly ListingStatusRow[]): SyncListingStatus | null {
  if (rows.length === 0) return null
  const active = rows.find(r => ACTIVE.includes(r.status))
  if (active) return active.status
  // No active row: the latest terminal outcome stands. Ties and missing
  // created_at fall back to document order, which is stable enough for a
  // signal that only distinguishes one refusal reason from another.
  let latest: ListingStatusRow | null = null
  for (const row of rows) {
    if (latest === null) {
      latest = row
      continue
    }
    const a = row.created_at ?? ''
    const b = latest.created_at ?? ''
    if (a > b) latest = row
  }
  return latest?.status ?? null
}
