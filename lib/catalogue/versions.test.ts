// Tests for the work-version pure logic: derived vN numbering (never
// stored — RESEARCH Pitfall 5 / 37-01's prohibition), deterministic
// tiebreaking, and version presentation. All fixtures are plain objects
// — no database, no mocks.

import {
  deriveVersionNumerals,
  latestVersion,
  presentVersion,
  type WorkVersionRecord,
} from './versions'

function makeVersion(overrides: Partial<WorkVersionRecord> & { id: string }): WorkVersionRecord {
  return {
    source: 'upload',
    label: null,
    created_at: '2026-01-01T00:00:00.000Z',
    audio_path: `work-1/${overrides.id}.wav`,
    audio_ext: 'wav',
    duration_seconds: 180,
    ...overrides,
  }
}

describe('deriveVersionNumerals', () => {
  it('derives v1, v2, v3 from creation order, regardless of the array order they arrive in', () => {
    const v1 = makeVersion({ id: 'a', created_at: '2026-01-01T00:00:00.000Z' })
    const v2 = makeVersion({ id: 'b', created_at: '2026-01-02T00:00:00.000Z' })
    const v3 = makeVersion({ id: 'c', created_at: '2026-01-03T00:00:00.000Z' })

    const inOrder = deriveVersionNumerals([v1, v2, v3])
    expect(inOrder.map(v => v.display)).toEqual(['v1', 'v2', 'v3'])
    expect(inOrder.map(v => v.id)).toEqual(['a', 'b', 'c'])

    // Shuffled input array — same numbering, because ordering is by
    // created_at, never by array position.
    const shuffled = deriveVersionNumerals([v3, v1, v2])
    expect(shuffled.map(v => v.id)).toEqual(['a', 'b', 'c'])
    expect(shuffled.map(v => v.display)).toEqual(['v1', 'v2', 'v3'])
  })

  it('removing the middle version renumbers the last from v3 to v2 — numerals are positional, never sticky', () => {
    const v1 = makeVersion({ id: 'a', created_at: '2026-01-01T00:00:00.000Z' })
    const v2 = makeVersion({ id: 'b', created_at: '2026-01-02T00:00:00.000Z' })
    const v3 = makeVersion({ id: 'c', created_at: '2026-01-03T00:00:00.000Z' })

    expect(deriveVersionNumerals([v1, v2, v3]).map(v => v.display)).toEqual(['v1', 'v2', 'v3'])

    const afterDelete = deriveVersionNumerals([v1, v3])
    expect(afterDelete.map(v => v.id)).toEqual(['a', 'c'])
    expect(afterDelete.map(v => v.display)).toEqual(['v1', 'v2'])
  })

  it('versions created within the same second fall back to a stable id tiebreak, deterministic across renders', () => {
    const sameSecond = '2026-01-01T00:00:00.000Z'
    const v1 = makeVersion({ id: 'zzz', created_at: sameSecond })
    const v2 = makeVersion({ id: 'aaa', created_at: sameSecond })

    const first = deriveVersionNumerals([v1, v2])
    const second = deriveVersionNumerals([v2, v1]) // different arrival order

    expect(first.map(v => v.id)).toEqual(['aaa', 'zzz']) // id tiebreak: 'aaa' < 'zzz'
    expect(second.map(v => v.id)).toEqual(['aaa', 'zzz'])
    expect(first.map(v => v.display)).toEqual(second.map(v => v.display))
  })
})

describe('latestVersion', () => {
  it('returns the newest version by the same ordering', () => {
    const v1 = makeVersion({ id: 'a', created_at: '2026-01-01T00:00:00.000Z' })
    const v2 = makeVersion({ id: 'b', created_at: '2026-01-03T00:00:00.000Z' })
    const v3 = makeVersion({ id: 'c', created_at: '2026-01-02T00:00:00.000Z' })

    const latest = latestVersion([v1, v2, v3])
    expect(latest?.id).toBe('b')
    expect(latest?.display).toBe('v3')
  })

  it('returns null for an empty catalogue of versions', () => {
    expect(latestVersion([])).toBeNull()
  })
})

describe('presentVersion', () => {
  it("presents a version's optional free-text label alongside the numeral, not instead of it", () => {
    const derived = deriveVersionNumerals([
      makeVersion({ id: 'a', label: 'acoustic take', created_at: '2026-01-01T00:00:00.000Z' }),
    ])
    const presentation = presentVersion(derived[0])

    expect(presentation.numeral).toBe(1)
    expect(presentation.display).toBe('v1')
    expect(presentation.description).toBe('acoustic take')
  })

  it('a version with no label presents a source-derived description distinguishing a hum from an upload', () => {
    const derived = deriveVersionNumerals([
      makeVersion({ id: 'a', source: 'hum', label: null, created_at: '2026-01-01T00:00:00.000Z' }),
      makeVersion({
        id: 'b',
        source: 'upload',
        label: null,
        created_at: '2026-01-02T00:00:00.000Z',
      }),
    ])

    expect(presentVersion(derived[0]).description).toBe('Hummed take')
    expect(presentVersion(derived[1]).description).toBe('Uploaded file')
    expect(presentVersion(derived[0]).description).not.toBe(presentVersion(derived[1]).description)
  })

  it('a blank label falls back to the source-derived description', () => {
    const derived = deriveVersionNumerals([
      makeVersion({ id: 'a', source: 'hum', label: '   ', created_at: '2026-01-01T00:00:00.000Z' }),
    ])
    expect(presentVersion(derived[0]).description).toBe('Hummed take')
  })
})
