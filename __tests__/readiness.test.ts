// RED-first parity test for the TS twin of the split-sheet readiness
// tiering (P17-03/P17-03-impl, ESIGN-08). This scenario table is the SAME
// status->tier mapping the migration-062 SQL CASE assertions cover
// (SPLIT_SHEET_TIER_MAP in lib/vault/readiness-tiers.ts) — proving the two
// derivations agree (RESEARCH Pitfall 3: the phase's single biggest risk
// is the DB trigger and this TS mirror drifting apart).

import { readinessItemsForProject } from '@/lib/vault/readiness'

function splitSheetItem(input: Parameters<typeof readinessItemsForProject>[0]) {
  const items = readinessItemsForProject(input)
  const item = items.find(i => i.key === 'split_sheets')
  if (!item) throw new Error('split_sheets item missing from readinessItemsForProject output')
  return item
}

describe('readinessItemsForProject — split_sheets tiering', () => {
  describe('legacy wet-sign upload path (AM-1 universal fallback)', () => {
    it('earns 15/complete when a signed split_sheet vault_document exists, regardless of pipeline status', () => {
      const item = splitSheetItem({
        type: 'single',
        documents: [{ type: 'split_sheet', status: 'signed' }],
        split_sheets: [{ status: 'draft' }],
      })
      expect(item.status).toBe('complete')
      expect(item.earnedPoints).toBe(15)
    })

    it('still stays 15 points in the registry (derivation change, not a points change)', () => {
      const item = splitSheetItem({
        type: 'single',
        documents: [{ type: 'split_sheet', status: 'signed' }],
      })
      expect(item.points).toBe(15)
    })
  })

  describe('pipeline-derived tier — the SAME scenario table migration 062 asserts in SQL', () => {
    it.each([
      ['draft', 0, 'missing'],
      ['pending_approval', 5, 'warning'],
      ['countered', 5, 'warning'],
      ['approved', 10, 'warning'],
      ['esign_pending', 10, 'warning'],
      ['executed', 15, 'complete'],
    ] as const)('status=%s -> earnedPoints=%i, status=%s', (sheetStatus, earnedPoints, expectedStatus) => {
      const item = splitSheetItem({
        type: 'single',
        documents: [],
        split_sheets: [{ status: sheetStatus }],
      })
      expect(item.earnedPoints).toBe(earnedPoints)
      expect(item.status).toBe(expectedStatus)
    })
  })

  describe('pessimistic MIN across multiple split sheets tied to one project', () => {
    it('takes the lowest tier when sheets disagree', () => {
      const item = splitSheetItem({
        type: 'ep',
        documents: [],
        split_sheets: [{ status: 'executed' }, { status: 'countered' }],
      })
      expect(item.earnedPoints).toBe(5)
      expect(item.status).toBe('warning')
    })

    it('all executed -> 15/complete', () => {
      const item = splitSheetItem({
        type: 'ep',
        documents: [],
        split_sheets: [{ status: 'executed' }, { status: 'executed' }],
      })
      expect(item.earnedPoints).toBe(15)
      expect(item.status).toBe('complete')
    })
  })

  describe('countered sheets set a renegotiating note without scoring above consensus (tier 5)', () => {
    it('flags the note when the pessimistic sheet is countered', () => {
      const item = splitSheetItem({
        type: 'single',
        documents: [],
        split_sheets: [{ status: 'countered' }],
      })
      expect(item.earnedPoints).toBe(5)
      expect(item.note).toMatch(/renegotiat/i)
    })

    it('does not set the note for a non-countered tier-5 status (pending_approval)', () => {
      const item = splitSheetItem({
        type: 'single',
        documents: [],
        split_sheets: [{ status: 'pending_approval' }],
      })
      expect(item.note).toBeUndefined()
    })
  })

  describe('no pipeline signal at all', () => {
    it('an empty split_sheets array with no signed doc falls back to missing', () => {
      const item = splitSheetItem({
        type: 'single',
        documents: [],
        split_sheets: [],
      })
      expect(item.status).toBe('missing')
    })
  })

  describe('backward compatibility — omitted split_sheets field degrades to legacy signedOf-only behavior', () => {
    it('complete when a signed doc exists and split_sheets is omitted entirely (existing callers)', () => {
      const item = splitSheetItem({
        type: 'single',
        documents: [{ type: 'split_sheet', status: 'signed' }],
      })
      expect(item.status).toBe('complete')
    })

    it('missing when no signed doc exists and split_sheets is omitted entirely', () => {
      const item = splitSheetItem({
        type: 'single',
        documents: [],
      })
      expect(item.status).toBe('missing')
    })

    it('warning when a partial (unsigned) split_sheet doc exists and split_sheets is omitted', () => {
      const item = splitSheetItem({
        type: 'single',
        documents: [{ type: 'split_sheet', status: 'pending' }],
      })
      expect(item.status).toBe('warning')
    })
  })
})
