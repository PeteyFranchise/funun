// ─── The shared parity fixture ────────────────────────────────────────────
// P18-14/P18-15/P18-16 (18-CONTEXT.md), 18-04. Neither derivation is the
// source of truth for split-sheet coverage-based readiness — this table
// is. 17-02's research named the dual-implementation drift between the TS
// twin and the SQL trigger as the phase's single biggest risk; this is the
// same pattern applied here:
//
//   - lib/vault/readiness-coverage.test.ts runs the ACTUAL TypeScript
//     derivation (readinessItemsForProject()) against every row below and
//     asserts the exact expected earnedPoints/status.
//   - __tests__/migration-068.test.ts is a STRUCTURAL PROXY — Jest cannot
//     execute PL/pgSQL — asserting migration 068's SQL contains the
//     elements each named scenario requires (the attachment join, the
//     tier values, the minimum aggregate, the needing-set derivation
//     including uncovered tracks, and the preserved legacy branch).
//   - The EXECUTABLE half of the SQL parity is the human spot-check
//     against real data at this plan's blocking checkpoint (Task 4).
//
// Each row is a named project shape: its tracks, the statuses of any split
// sheets attached to each one via split_sheet_attachments (18-03), and
// whether a legacy signed split_sheet vault_documents row exists (AM-1's
// universal fallback) — paired with the expected earnedPoints and status.

export type CoverageFixtureTrack = {
  id: string
  /** Statuses of every split sheet attached to THIS track via
   * split_sheet_attachments. Empty = no sheet has reached this track yet.
   * Multiple entries are possible (a track can have more than one attached
   * sheet); the track's own tier is the BEST (max) of them. */
  attachedStatuses: string[]
}

export type CoverageFixtureScenario = {
  name: string
  tracks: CoverageFixtureTrack[]
  /** A signed split_sheet vault_documents row exists for the project
   * (AM-1's legacy wet-sign-upload universal fallback). It wins outright,
   * before any coverage math, regardless of the tracks/attachments above. */
  hasLegacySignedDocument: boolean
  expected: {
    /** undefined only for the "no coverage signal at all" degrade case,
     * where the derivation never assigns a tier and the item's status
     * falls back to the pre-existing signedOf()-only behavior. */
    earnedPoints?: number
    status: 'complete' | 'warning' | 'missing'
  }
}

export const COVERAGE_FIXTURES: CoverageFixtureScenario[] = [
  {
    // 18-CONTEXT finding 4, the bug this whole plan exists to fix: a
    // 5-track EP with ONE signed sheet must NOT read complete at 15/15.
    name: 'finding-4 regression guard: five tracks, one executed sheet',
    tracks: [
      { id: 't1', attachedStatuses: ['executed'] },
      { id: 't2', attachedStatuses: [] },
      { id: 't3', attachedStatuses: [] },
      { id: 't4', attachedStatuses: [] },
      { id: 't5', attachedStatuses: [] },
    ],
    hasLegacySignedDocument: false,
    expected: { earnedPoints: 3, status: 'warning' },
  },
  {
    name: 'all tracks covered by executed sheets',
    tracks: [
      { id: 't1', attachedStatuses: ['executed'] },
      { id: 't2', attachedStatuses: ['executed'] },
      { id: 't3', attachedStatuses: ['executed'] },
    ],
    hasLegacySignedDocument: false,
    expected: { earnedPoints: 15, status: 'complete' },
  },
  {
    // Every track has SOME attached sheet (no track is entirely
    // undocumented) but one sheet is only at the approved tier — the
    // pessimistic-MIN rule this phase inherits from 17-02/P17-03 still
    // applies once coverage itself is complete.
    name: 'all tracks covered, one sheet only at the approved tier',
    tracks: [
      { id: 't1', attachedStatuses: ['executed'] },
      { id: 't2', attachedStatuses: ['executed'] },
      { id: 't3', attachedStatuses: ['approved'] },
    ],
    hasLegacySignedDocument: false,
    expected: { earnedPoints: 10, status: 'warning' },
  },
  {
    name: 'no tracks covered at all',
    tracks: [
      { id: 't1', attachedStatuses: [] },
      { id: 't2', attachedStatuses: [] },
    ],
    hasLegacySignedDocument: false,
    expected: { earnedPoints: 0, status: 'missing' },
  },
  {
    // AM-1's universal fallback: a legacy signed split_sheet vault_document
    // wins outright, unaffected by coverage, even with zero attachments.
    name: 'legacy signed document present, zero attachments',
    tracks: [
      { id: 't1', attachedStatuses: [] },
      { id: 't2', attachedStatuses: [] },
    ],
    hasLegacySignedDocument: true,
    expected: { earnedPoints: 15, status: 'complete' },
  },
  {
    // A project with no tracks at all — the pre-existing behavior for
    // this case is unchanged: no coverage signal, degrade to legacy.
    name: 'a project with no tracks at all',
    tracks: [],
    hasLegacySignedDocument: false,
    expected: { status: 'missing' },
  },
  {
    // P18-15 regression guard: a single-composer (solo-written) track with
    // no sheet STILL counts in the denominator and STILL drags coverage
    // down. There is no solo-written exemption.
    name: 'a single-composer track with no sheet still counts in the denominator',
    tracks: [
      { id: 't1', attachedStatuses: ['executed'] },
      { id: 't2', attachedStatuses: [] },
    ],
    hasLegacySignedDocument: false,
    expected: { earnedPoints: 8, status: 'warning' },
  },
]
