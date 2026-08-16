import { rankCrateRequests, type CrateRequestItem } from './ranking'

// ─── fixtures ───────────────────────────────────────────────────────────
// Distinct clientOrgId per item (unless a test explicitly wants a merge) so
// de-dup never accidentally collapses fixtures meant to stay separate.

function item(overrides: Partial<CrateRequestItem> & { id: string }): CrateRequestItem {
  return {
    kind: 'tag_browse',
    clientOrgId: `org-${overrides.id}`,
    clientName: null,
    isGuest: false,
    createdAt: '2026-08-10T12:00:00.000Z',
    actionedAt: null,
    deadline: null,
    budget: null,
    ...overrides,
  }
}

describe('rankCrateRequests — intent ordering', () => {
  it('ranks briefs > repeat_search > selects_reopen > tag_browse', () => {
    const items: CrateRequestItem[] = [
      item({ id: 'tag', kind: 'tag_browse', createdAt: '2026-08-10T12:00:00.000Z' }),
      item({ id: 'reopen', kind: 'selects_reopen', createdAt: '2026-08-10T12:00:00.000Z' }),
      item({ id: 'search', kind: 'repeat_search', createdAt: '2026-08-10T12:00:00.000Z' }),
      item({ id: 'brief', kind: 'brief', createdAt: '2026-08-10T12:00:00.000Z' }),
    ]

    const result = rankCrateRequests(items)

    expect(result.map(r => r.id)).toEqual(['brief', 'search', 'reopen', 'tag'])
  })

  it('ranks unactioned items ahead of actioned items within the same kind', () => {
    const items: CrateRequestItem[] = [
      item({ id: 'actioned', kind: 'brief', actionedAt: '2026-08-10T13:00:00.000Z' }),
      item({ id: 'unactioned', kind: 'brief', actionedAt: null }),
    ]

    const result = rankCrateRequests(items)

    expect(result.map(r => r.id)).toEqual(['unactioned', 'actioned'])
  })

  it('ranks newer items ahead of older items within the same kind + actioned state', () => {
    const items: CrateRequestItem[] = [
      item({ id: 'older', kind: 'brief', createdAt: '2026-08-01T00:00:00.000Z' }),
      item({ id: 'newer', kind: 'brief', createdAt: '2026-08-10T00:00:00.000Z' }),
    ]

    const result = rankCrateRequests(items)

    expect(result.map(r => r.id)).toEqual(['newer', 'older'])
  })

  it('boosts an item with a deadline or budget ahead of an equal-weight item without one', () => {
    const items: CrateRequestItem[] = [
      item({ id: 'plain', kind: 'brief' }),
      item({ id: 'boosted-deadline', kind: 'brief', deadline: '2026-09-01' }),
    ]

    const result = rankCrateRequests(items)

    expect(result.map(r => r.id)).toEqual(['boosted-deadline', 'plain'])
  })

  it('exposes the intent weight so the UI can derive its own Hot/Warm labels', () => {
    const result = rankCrateRequests([item({ id: 'brief', kind: 'brief' })])
    expect(typeof result[0].weight).toBe('number')
    expect(result[0].weight).toBeGreaterThan(0)
  })
})

describe('rankCrateRequests — R10 stability backstop (held-out)', () => {
  // Five items that are IDENTICAL on every ranking key (kind, actioned
  // state, createdAt, deadline/budget boost) but distinct clients/ids — the
  // only thing left to break the tie is the documented STABLE id tiebreak.
  // Feeding the ranker every permutation of input order must always produce
  // the exact same output order.
  const equalKeyItems: CrateRequestItem[] = ['c', 'a', 'e', 'b', 'd'].map(id =>
    item({ id, kind: 'brief', createdAt: '2026-08-10T12:00:00.000Z', actionedAt: null })
  )
  const expectedOrder = [...equalKeyItems.map(i => i.id)].sort()

  it('produces the same order regardless of input order (baseline)', () => {
    const result = rankCrateRequests(equalKeyItems)
    expect(result.map(r => r.id)).toEqual(expectedOrder)
  })

  it('produces the same order for a shuffled copy of the input', () => {
    const shuffled = [equalKeyItems[3], equalKeyItems[0], equalKeyItems[4], equalKeyItems[1], equalKeyItems[2]]
    const result = rankCrateRequests(shuffled)
    expect(result.map(r => r.id)).toEqual(expectedOrder)
  })

  it('produces the same order for the reverse of the input', () => {
    const reversed = [...equalKeyItems].reverse()
    const result = rankCrateRequests(reversed)
    expect(result.map(r => r.id)).toEqual(expectedOrder)
  })
})

describe('rankCrateRequests — guest new-lead handling', () => {
  it('keeps a guest / null-client signal in the output, tagged as a new lead', () => {
    const items: CrateRequestItem[] = [
      item({ id: 'known', kind: 'brief', isGuest: false, clientOrgId: 'org-known' }),
      item({ id: 'guest', kind: 'tag_browse', isGuest: true, clientOrgId: null }),
    ]

    const result = rankCrateRequests(items)

    expect(result).toHaveLength(2)
    const guestRow = result.find(r => r.id === 'guest')
    expect(guestRow).toBeDefined()
    expect(guestRow?.isNewLead).toBe(true)
    const knownRow = result.find(r => r.id === 'known')
    expect(knownRow?.isNewLead).toBe(false)
  })

  it('never drops a guest signal even when many known-client items outrank it', () => {
    const items: CrateRequestItem[] = [
      ...Array.from({ length: 5 }, (_, i) =>
        item({ id: `brief-${i}`, kind: 'brief', clientOrgId: `org-${i}` })
      ),
      item({ id: 'guest-lowest', kind: 'tag_browse', isGuest: true, clientOrgId: null }),
    ]

    const result = rankCrateRequests(items)

    expect(result.some(r => r.id === 'guest-lowest')).toBe(true)
    expect(result).toHaveLength(6)
  })
})

describe('rankCrateRequests — de-dup', () => {
  it('collapses repeat signals of the same kind+client within the dedupe window into one row carrying a count', () => {
    const items: CrateRequestItem[] = [
      item({ id: 'search-1', kind: 'repeat_search', clientOrgId: 'org-x', createdAt: '2026-08-10T09:00:00.000Z' }),
      item({ id: 'search-2', kind: 'repeat_search', clientOrgId: 'org-x', createdAt: '2026-08-10T10:00:00.000Z' }),
      item({ id: 'search-3', kind: 'repeat_search', clientOrgId: 'org-x', createdAt: '2026-08-10T11:00:00.000Z' }),
    ]

    const result = rankCrateRequests(items)

    expect(result).toHaveLength(1)
    expect(result[0].count).toBe(3)
    expect(result[0].clientOrgId).toBe('org-x')
  })

  it('does NOT collapse signals of the same kind+client that fall outside the dedupe window', () => {
    const items: CrateRequestItem[] = [
      item({ id: 'search-old', kind: 'repeat_search', clientOrgId: 'org-y', createdAt: '2026-08-01T09:00:00.000Z' }),
      item({ id: 'search-new', kind: 'repeat_search', clientOrgId: 'org-y', createdAt: '2026-08-10T09:00:00.000Z' }),
    ]

    const result = rankCrateRequests(items)

    expect(result).toHaveLength(2)
    expect(result.every(r => r.count === 1)).toBe(true)
  })

  it('de-dup is deterministic — the same input in a different order collapses to the same output', () => {
    const items: CrateRequestItem[] = [
      item({ id: 'search-1', kind: 'repeat_search', clientOrgId: 'org-z', createdAt: '2026-08-10T09:00:00.000Z' }),
      item({ id: 'search-2', kind: 'repeat_search', clientOrgId: 'org-z', createdAt: '2026-08-10T10:00:00.000Z' }),
    ]

    const resultA = rankCrateRequests(items)
    const resultB = rankCrateRequests([...items].reverse())

    expect(resultA).toEqual(resultB)
  })

  it('never merges across different clients even for the same kind', () => {
    const items: CrateRequestItem[] = [
      item({ id: 'a', kind: 'repeat_search', clientOrgId: 'org-a', createdAt: '2026-08-10T09:00:00.000Z' }),
      item({ id: 'b', kind: 'repeat_search', clientOrgId: 'org-b', createdAt: '2026-08-10T09:05:00.000Z' }),
    ]

    const result = rankCrateRequests(items)

    expect(result).toHaveLength(2)
  })
})
