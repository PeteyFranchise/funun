// RED-first test for the coverage-based split_sheets tier (P18-14/15/16,
// 18-04). This is the pure module; __tests__/readiness.test.ts asserts the
// same fixture rows through the full readinessItemsForProject() surface
// (which also handles the legacy-wins-outright ordering these unit tests
// do not exercise).

import { coverageTier } from '@/lib/vault/readiness-coverage'
import { COVERAGE_FIXTURES } from '@/lib/vault/coverage-fixtures'

describe('coverageTier — pure coverage derivation', () => {
  it('returns null for zero tracks (no signal; caller falls back to legacy)', () => {
    expect(coverageTier([])).toBeNull()
  })

  it('all tracks executed -> 15/complete', () => {
    const result = coverageTier([
      { id: 't1', attachedStatuses: ['executed'] },
      { id: 't2', attachedStatuses: ['executed'] },
    ])
    expect(result).toEqual({
      earnedPoints: 15,
      status: 'complete',
      covered: 2,
      needing: 2,
      uncoveredTrackIds: [],
    })
  })

  it('takes the MIN across tiers when every track is covered but one is lower-tier', () => {
    const result = coverageTier([
      { id: 't1', attachedStatuses: ['executed'] },
      { id: 't2', attachedStatuses: ['approved'] },
    ])
    expect(result?.earnedPoints).toBe(10)
    expect(result?.status).toBe('warning')
  })

  it('takes the proportional average, not MIN, when a track is entirely uncovered', () => {
    // The exact scenario P18-16 named: MIN alone would score this 0/15,
    // unable to distinguish "done nothing" from "nearly done."
    const result = coverageTier([
      { id: 't1', attachedStatuses: ['executed'] },
      { id: 't2', attachedStatuses: ['executed'] },
      { id: 't3', attachedStatuses: ['executed'] },
      { id: 't4', attachedStatuses: ['executed'] },
      { id: 't5', attachedStatuses: [] },
    ])
    expect(result?.earnedPoints).toBe(12)
    expect(result?.status).toBe('warning')
    expect(result?.covered).toBe(4)
    expect(result?.needing).toBe(5)
    expect(result?.uncoveredTrackIds).toEqual(['t5'])
  })

  it('a best-of-multiple attached sheets on one track uses the highest tier', () => {
    const result = coverageTier([{ id: 't1', attachedStatuses: ['draft', 'executed'] }])
    expect(result?.earnedPoints).toBe(15)
  })

  it('zero coverage -> 0/missing', () => {
    const result = coverageTier([
      { id: 't1', attachedStatuses: [] },
      { id: 't2', attachedStatuses: [] },
    ])
    expect(result?.earnedPoints).toBe(0)
    expect(result?.status).toBe('missing')
    expect(result?.uncoveredTrackIds).toEqual(['t1', 't2'])
  })

  describe('every fixture scenario the pure coverage module (not the legacy-wins ordering) governs', () => {
    // The legacy-signed-document scenario and the no-tracks scenario are
    // asserted at the readinessItemsForProject() level in
    // __tests__/readiness.test.ts — coverageTier() itself has no concept
    // of a legacy vault_documents row and cannot short-circuit on it.
    it.each(
      COVERAGE_FIXTURES.filter(s => s.tracks.length > 0 && !s.hasLegacySignedDocument)
    )('$name', scenario => {
      const result = coverageTier(scenario.tracks)
      expect(result?.earnedPoints).toBe(scenario.expected.earnedPoints)
      expect(result?.status).toBe(scenario.expected.status)
    })
  })
})
