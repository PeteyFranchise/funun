// RED-first tests for the single-source split-sheet readiness tier map
// (ESIGN-08, P17-03/P17-03-impl). Both the DB trigger (migration 062,
// string-asserted separately) and readinessItemsForProject() (17-02) must
// agree with SPLIT_SHEET_TIER_MAP — this file locks the numbers.

import {
  SPLIT_SHEET_TIER_MAP,
  deriveSheetTier,
  projectSplitTier,
  isRenegotiating,
} from './readiness-tiers'

describe('SPLIT_SHEET_TIER_MAP', () => {
  it('maps every pipeline status to its tier', () => {
    expect(SPLIT_SHEET_TIER_MAP).toEqual({
      draft: 0,
      pending_approval: 5,
      countered: 5,
      approved: 10,
      esign_pending: 10,
      executed: 15,
    })
  })
})

describe('deriveSheetTier', () => {
  it.each([
    ['draft', 0],
    ['pending_approval', 5],
    ['countered', 5],
    ['approved', 10],
    ['esign_pending', 10],
    ['executed', 15],
  ])('maps %s -> %i', (status, tier) => {
    expect(deriveSheetTier(status)).toBe(tier)
  })

  it('defaults an unknown status to 0 rather than throwing', () => {
    expect(deriveSheetTier('some_future_status')).toBe(0)
  })
})

describe('projectSplitTier', () => {
  it('returns null for an empty list (no pipeline signal)', () => {
    expect(projectSplitTier([])).toBeNull()
  })

  it('returns the single tier for one sheet', () => {
    expect(projectSplitTier(['esign_pending'])).toBe(10)
  })

  it('returns the pessimistic MIN tier across multiple sheets', () => {
    expect(projectSplitTier(['executed', 'esign_pending', 'pending_approval'])).toBe(5)
  })

  it('all executed -> 15', () => {
    expect(projectSplitTier(['executed', 'executed'])).toBe(15)
  })

  it('any draft sheet drags the project tier to 0', () => {
    expect(projectSplitTier(['executed', 'draft'])).toBe(0)
  })
})

describe('isRenegotiating', () => {
  it('is true only for countered', () => {
    expect(isRenegotiating('countered')).toBe(true)
  })

  it.each(['draft', 'pending_approval', 'approved', 'esign_pending', 'executed'])(
    'is false for %s',
    status => {
      expect(isRenegotiating(status)).toBe(false)
    }
  )

  it('never implies a tier above consensus — countered stays tier 5', () => {
    expect(isRenegotiating('countered')).toBe(true)
    expect(deriveSheetTier('countered')).toBe(5)
  })
})
