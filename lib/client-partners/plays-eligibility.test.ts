import { matchingClientCount, buildAssignmentDeepLink, type PlaysEligibilityRow } from './plays-eligibility'

// ─── plays-eligibility.ts — own-book client-targeted matching (D-31.2-09, T-31.2-17) ──
// Proves matchingClientCount is a pure health/stage filter over whatever
// book it's handed (own-book scoping is the CALLER's responsibility — this
// module never fetches a book itself), and buildAssignmentDeepLink emits
// the existing My Client Partners route's query string, never a new route.

function row(overrides: Partial<PlaysEligibilityRow> = {}): PlaysEligibilityRow {
  return {
    id: 'row-1',
    name: 'Test Org',
    health: 'at_risk',
    pipelineStageKey: 'negotiating',
    ...overrides,
  }
}

describe('matchingClientCount', () => {
  it('counts only rows matching the health band when only healthBand is set', () => {
    const book: PlaysEligibilityRow[] = [
      row({ id: '1', health: 'at_risk' }),
      row({ id: '2', health: 'good' }),
      row({ id: '3', health: 'at_risk' }),
    ]
    expect(matchingClientCount(book, { healthBand: 'at_risk' })).toBe(2)
  })

  it('counts only rows matching the pipeline stage key when only pipelineStageKey is set', () => {
    const book: PlaysEligibilityRow[] = [
      row({ id: '1', pipelineStageKey: 'negotiating' }),
      row({ id: '2', pipelineStageKey: 'contacted' }),
      row({ id: '3', pipelineStageKey: 'negotiating' }),
    ]
    expect(matchingClientCount(book, { pipelineStageKey: 'negotiating' })).toBe(2)
  })

  it('requires BOTH health and stage to match when both filters are set', () => {
    const book: PlaysEligibilityRow[] = [
      row({ id: '1', health: 'at_risk', pipelineStageKey: 'negotiating' }),
      row({ id: '2', health: 'at_risk', pipelineStageKey: 'contacted' }),
      row({ id: '3', health: 'good', pipelineStageKey: 'negotiating' }),
    ]
    expect(matchingClientCount(book, { healthBand: 'at_risk', pipelineStageKey: 'negotiating' })).toBe(1)
  })

  it('with neither filter set, matches the whole book', () => {
    const book: PlaysEligibilityRow[] = [row({ id: '1' }), row({ id: '2' }), row({ id: '3' })]
    expect(matchingClientCount(book, {})).toBe(3)
  })

  it('an empty book always matches zero regardless of filters', () => {
    expect(matchingClientCount([], { healthBand: 'at_risk' })).toBe(0)
  })

  it('own-book scoping: the SAME assignment yields a DIFFERENT count for a DIFFERENT AE book (T-31.2-17)', () => {
    const assignment = { healthBand: 'at_risk' as const }
    const aeOneBook: PlaysEligibilityRow[] = [row({ id: '1', health: 'at_risk' }), row({ id: '2', health: 'good' })]
    const aeTwoBook: PlaysEligibilityRow[] = [
      row({ id: '3', health: 'at_risk' }),
      row({ id: '4', health: 'at_risk' }),
      row({ id: '5', health: 'at_risk' }),
    ]
    expect(matchingClientCount(aeOneBook, assignment)).toBe(1)
    expect(matchingClientCount(aeTwoBook, assignment)).toBe(3)
  })

  it('never leaks a match for a row not present in the evaluating AE own book (a global list would over-count)', () => {
    // A row from "another AE's book" simply never appears in the array the
    // caller hands us — proving the module has no hidden global data source.
    const ownBook: PlaysEligibilityRow[] = [row({ id: 'mine', health: 'at_risk' })]
    expect(matchingClientCount(ownBook, { healthBand: 'at_risk' })).toBe(1)
  })
})

describe('buildAssignmentDeepLink', () => {
  it('emits the health filter param on the existing My Client Partners route', () => {
    expect(buildAssignmentDeepLink({ healthBand: 'at_risk' })).toBe('/admin/client-partners?health=at_risk')
  })

  it('emits the stage filter param on the existing route', () => {
    expect(buildAssignmentDeepLink({ pipelineStageKey: 'negotiating' })).toBe('/admin/client-partners?stage=negotiating')
  })

  it('emits both params when both are set', () => {
    expect(buildAssignmentDeepLink({ healthBand: 'at_risk', pipelineStageKey: 'negotiating' })).toBe(
      '/admin/client-partners?health=at_risk&stage=negotiating'
    )
  })

  it('emits the bare route with no query string when neither filter is set — never a new route', () => {
    expect(buildAssignmentDeepLink({})).toBe('/admin/client-partners')
  })
})
