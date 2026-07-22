// ─── Coverage-based split_sheets tier ─────────────────────────────────────
// P18-14/P18-15/P18-16 (18-CONTEXT.md), 18-04. Fixes the readiness gate
// that failed in the dangerous direction: signedOf('split_sheet') asked
// whether ALL split-sheet documents for a project were signed, so a
// 5-track EP with ONE signed sheet had total=1, signed=1 -> complete,
// 15/15 -- four undocumented songs, fully green (18-CONTEXT finding 4).
//
// This module scores coverage across the project's OWN tracks instead,
// via tracksNeedingSheet() (lib/vault/coverage.ts, P18-15: every track,
// no solo-written exemption) and the tier values already defined in
// SPLIT_SHEET_TIER_MAP (lib/vault/readiness-tiers.ts, P17-03) -- this
// module does not restate those numbers.
//
// The migration 068 SQL trigger implements the SAME rule; neither
// derivation is the source of truth -- lib/vault/coverage-fixtures.ts is,
// and both are asserted against it (RESEARCH Pitfall 3 / 17-02's
// dual-implementation-drift risk, repeated here for readiness).

import { tracksNeedingSheet } from '@/lib/vault/coverage'
import { deriveSheetTier } from '@/lib/vault/readiness-tiers'

export type CoverageTrackInput = {
  id: string
  /** Statuses of every split sheet attached to THIS track via
   * split_sheet_attachments (18-03). Empty = no sheet has reached this
   * track yet. A track's own tier is the BEST (max) of its attached
   * sheets' tiers -- an executed sheet says the track is done even if a
   * stale draft sheet is also attached to it. */
  attachedStatuses: string[]
}

export type CoverageResult = {
  earnedPoints: number
  status: 'complete' | 'warning' | 'missing'
  /** Count of needing tracks that have at least one attached split sheet
   * (of any status) -- so the surface can say "four of five" rather than
   * only showing a colour. */
  covered: number
  needing: number
  /** IDs of the needing tracks with NO attached split sheet at all --
   * the specific songs the breakdown page must name. */
  uncoveredTrackIds: string[]
}

function trackTier(track: CoverageTrackInput): number {
  if (track.attachedStatuses.length === 0) return 0
  return Math.max(...track.attachedStatuses.map(deriveSheetTier))
}

/**
 * Coverage-based tier for the split_sheets readiness item.
 *
 * Every track the project has needs its OWN split sheet (P18-15 --
 * tracksNeedingSheet() returns all of them, no exceptions). Returns null
 * when there is nothing to derive from (a project with no tracks at
 * all), letting the caller fall back to the legacy signedOf-only path --
 * the same no-signal degradation posture projectSplitTier() already takes
 * for an empty status list.
 *
 * Scoring (P18-16, replacing an earlier MIN-only draft that scored a
 * 5-track EP with 4 executed sheets at 0/15, unable to distinguish "done
 * nothing" from "nearly done"):
 *   - When EVERY needing track has at least one attached sheet, the score
 *     is the pessimistic MIN across their tiers -- unchanged from the
 *     pre-18-04 project-wide MIN semantic, now computed per track.
 *   - When at least one needing track has NO sheet at all, points become
 *     the average tier across every needing track (uncovered tracks
 *     contribute 0), so partial progress is visible.
 * Either way, `status` reads 'complete' only when earnedPoints reaches
 * the full tier -- which the MIN branch can only do when EVERY track is
 * individually at the top tier, and the average branch cannot reach at
 * all while any track is uncovered.
 */
export function coverageTier(tracks: CoverageTrackInput[]): CoverageResult | null {
  const needing = tracksNeedingSheet(tracks)
  if (needing.length === 0) return null

  const tiers = needing.map(trackTier)
  const uncovered = needing.filter((_, i) => tiers[i] === 0)
  const allCovered = uncovered.length === 0

  const earnedPoints = allCovered
    ? Math.min(...tiers)
    : Math.round(tiers.reduce((sum, tier) => sum + tier, 0) / needing.length)

  const status: CoverageResult['status'] =
    earnedPoints >= 15 ? 'complete' : earnedPoints === 0 ? 'missing' : 'warning'

  return {
    earnedPoints,
    status,
    covered: needing.length - uncovered.length,
    needing: needing.length,
    uncoveredTrackIds: uncovered.map(t => t.id),
  }
}
