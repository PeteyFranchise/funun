// RED-first parity test for the TS twin of the split-sheet readiness
// tiering (P17-03/P17-03-impl, ESIGN-08). This scenario table is the SAME
// status->tier mapping the migration-062 SQL CASE assertions cover
// (SPLIT_SHEET_TIER_MAP in lib/vault/readiness-tiers.ts) — proving the two
// derivations agree (RESEARCH Pitfall 3: the phase's single biggest risk
// is the DB trigger and this TS mirror drifting apart).

import { readinessItemsForProject } from '@/lib/vault/readiness'
import { COVERAGE_FIXTURES, type CoverageFixtureScenario } from '@/lib/vault/coverage-fixtures'

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

  describe('coverage-based derivation (P18-14/P18-15/P18-16, 18-04) — the shared fixture', () => {
    // The parity anchor: lib/vault/coverage-fixtures.ts also drives
    // lib/vault/readiness-coverage.test.ts (the pure module) and
    // __tests__/migration-068.test.ts (the SQL structural proxy). Every
    // row here exercises the FULL readinessItemsForProject() surface,
    // including the legacy-wins-outright ordering the pure module does
    // not see.
    function inputFromScenario(scenario: CoverageFixtureScenario) {
      return {
        type: 'ep' as const,
        tracks: scenario.tracks.map(t => ({ id: t.id })),
        documents: scenario.hasLegacySignedDocument
          ? [{ type: 'split_sheet', status: 'signed' }]
          : [],
        track_split_sheet_attachments: scenario.tracks.map(t => ({
          track_id: t.id,
          statuses: t.attachedStatuses,
        })),
      }
    }

    it.each(COVERAGE_FIXTURES)('$name', scenario => {
      const item = splitSheetItem(inputFromScenario(scenario))
      expect(item.earnedPoints).toBe(scenario.expected.earnedPoints)
      expect(item.status).toBe(scenario.expected.status)
    })
  })

  // WR-02 (18-REVIEW.md): the readiness breakdown page decides whether to
  // render the coverage widget based on which branch produced the status.
  // A legacy-signed-document "Passed" gate must never be reported as
  // 'coverage' — the page's contradiction bug came from rendering the
  // widget without checking this discriminant at all.
  describe('splitSheetSource discriminant (WR-02) — which branch produced the status', () => {
    it("'legacy' when the wet-signed-document fallback wins outright, even with zero attachment coverage", () => {
      const item = splitSheetItem({
        type: 'ep',
        tracks: [{ id: 'track-1' }, { id: 'track-2' }],
        documents: [{ type: 'split_sheet', status: 'signed' }],
        track_split_sheet_attachments: [
          { track_id: 'track-1', statuses: [] },
          { track_id: 'track-2', statuses: [] },
        ],
      })
      expect(item.status).toBe('complete')
      expect(item.splitSheetSource).toBe('legacy')
    })

    it("'coverage' when per-track attachment data drove the status", () => {
      const item = splitSheetItem({
        type: 'ep',
        tracks: [{ id: 'track-1' }],
        documents: [],
        track_split_sheet_attachments: [{ track_id: 'track-1', statuses: ['executed'] }],
      })
      expect(item.splitSheetSource).toBe('coverage')
    })

    it("'pipeline' when project-level split_sheets data drove the status (no attachment field supplied)", () => {
      const item = splitSheetItem({
        type: 'single',
        documents: [],
        split_sheets: [{ status: 'executed' }],
      })
      expect(item.splitSheetSource).toBe('pipeline')
    })

    it("'none' when no pipeline signal is present at all (legacy-only, non-complete)", () => {
      const item = splitSheetItem({
        type: 'single',
        documents: [],
      })
      expect(item.status).toBe('missing')
      expect(item.splitSheetSource).toBe('none')
    })

    it('is left unset on every non-split_sheets item', () => {
      const items = readinessItemsForProject({ type: 'single', documents: [] })
      const others = items.filter(i => i.key !== 'split_sheets')
      expect(others.every(i => i.splitSheetSource === undefined)).toBe(true)
    })
  })
})
