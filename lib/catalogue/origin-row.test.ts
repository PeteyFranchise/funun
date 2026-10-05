import { timeAgo, pickVisibleOriginIdeas } from '@/lib/catalogue/origin-row'

// No Supabase import, no React import, anywhere in this file — both
// functions under test are plain, injectable-free functions over data and
// ISO strings.

describe('lib/catalogue/origin-row — timeAgo (pure)', () => {
  const NOW = new Date('2026-10-04T12:00:00.000Z').getTime()

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('clamps anything under a minute to "1m ago"', () => {
    const iso = new Date(NOW - 10 * 1000).toISOString() // 10s ago
    expect(timeAgo(iso)).toBe('1m ago')
  })

  it('renders minutes under an hour', () => {
    const iso = new Date(NOW - 5 * 60 * 1000).toISOString() // 5m ago
    expect(timeAgo(iso)).toBe('5m ago')
  })

  it('renders hours under a day', () => {
    const iso = new Date(NOW - 3 * 3600 * 1000).toISOString() // 3h ago
    expect(timeAgo(iso)).toBe('3h ago')
  })

  it('renders days under a week', () => {
    const iso = new Date(NOW - 2 * 86400 * 1000).toISOString() // 2d ago
    expect(timeAgo(iso)).toBe('2d ago')
  })

  it('renders a date string at or beyond a week', () => {
    const iso = new Date(NOW - 7 * 86400 * 1000).toISOString() // exactly 7d ago
    expect(timeAgo(iso)).toBe(new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))
  })
})

describe('lib/catalogue/origin-row — pickVisibleOriginIdeas (pure)', () => {
  const ideaA = { id: 'idea-a', title: 'A' }
  const ideaB = { id: 'idea-b', title: 'B' }
  const ideaC = { id: 'idea-c', title: 'C' }

  it('returns only ideas whose id is in grantedIds, preserving input order', () => {
    const result = pickVisibleOriginIdeas([ideaA, ideaB, ideaC], new Set(['idea-c', 'idea-a']))
    expect(result).toEqual([ideaA, ideaC])
  })

  it('returns an empty array when grantedIds is empty', () => {
    const result = pickVisibleOriginIdeas([ideaA, ideaB], new Set())
    expect(result).toEqual([])
  })

  it('ignores ids in grantedIds that are not present in ideas', () => {
    const result = pickVisibleOriginIdeas([ideaA], new Set(['idea-a', 'idea-z']))
    expect(result).toEqual([ideaA])
  })

  it('returns an empty array when ideas is empty, regardless of grantedIds', () => {
    const result = pickVisibleOriginIdeas([], new Set(['idea-a']))
    expect(result).toEqual([])
  })
})
