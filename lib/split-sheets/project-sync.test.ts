import { mapPartiesToComposers, mapComposersToParties, mergeComposers, type SyncPartyInput } from './project-sync'
import { isSyncActive, SYNC_FROZEN_STATUSES, LIVING_DRAFT_STATUSES, CONSENSUS_RESET_STATUSES } from './lifecycle'
import type { Composer } from '@/lib/metadata/schema'

describe('isSyncActive — the sheet↔project sync boundary', () => {
  it.each([...LIVING_DRAFT_STATUSES, ...CONSENSUS_RESET_STATUSES])(
    '%s is still syncing (editable, just not frozen)',
    status => {
      expect(isSyncActive(status)).toBe(true)
    }
  )

  it.each(SYNC_FROZEN_STATUSES)('%s is frozen — sync stops', status => {
    expect(isSyncActive(status)).toBe(false)
  })
})

describe('mapPartiesToComposers', () => {
  it('maps party rows to composer entries preserving name/split/role/pro/ipi', () => {
    const parties: SyncPartyInput[] = [
      { name: 'Alex', role: 'composer_lyricist', split_percentage: 60, pro: 'ASCAP', ipi: '123' },
      { name: 'Jamie', role: 'producer', split_percentage: 40, pro: 'BMI', ipi: '456' },
    ]
    expect(mapPartiesToComposers(parties)).toEqual([
      { name: 'Alex', role: 'composer_lyricist', pro: 'ASCAP', ipi: '123', split: 60 },
      { name: 'Jamie', role: 'producer', pro: 'BMI', ipi: '456', split: 40 },
    ])
  })

  it('defaults an invalid role/pro and drops rows with an empty name', () => {
    const composers = mapPartiesToComposers([
      { name: '   ', role: 'weird', split_percentage: 10 },
      { name: 'Sam', role: 'weird', split_percentage: 30, pro: 'bogus' },
    ])
    expect(composers).toEqual([
      { name: 'Sam', role: 'composer_lyricist', pro: 'none', ipi: undefined, split: 30 },
    ])
  })
})

describe('mergeComposers — writers ⊆ credits', () => {
  it('preserves a project-only credit row with no matching writer party', () => {
    const existing: Composer[] = [
      { name: 'Alex', role: 'composer', pro: 'none', split: 100 },
      { name: 'Studio Sam', role: 'producer', pro: 'none', split: 0 }, // never a sheet party
    ]
    const writer: Composer[] = [
      { name: 'Alex', role: 'composer_lyricist', pro: 'ASCAP', split: 60 },
      { name: 'Jamie', role: 'lyricist', pro: 'BMI', split: 40 },
    ]
    const merged = mergeComposers(existing, writer)

    expect(merged).toHaveLength(3)
    expect(merged).toContainEqual({ name: 'Studio Sam', role: 'producer', pro: 'none', split: 0 })
    expect(merged.find(c => c.name === 'Alex')).toEqual({
      name: 'Alex',
      role: 'composer_lyricist',
      pro: 'ASCAP',
      split: 60,
    })
  })

  it('matches names case-insensitively and trimmed, replacing rather than duplicating', () => {
    const existing: Composer[] = [{ name: '  alex  ', role: 'composer', pro: 'none', split: 100 }]
    const writer: Composer[] = [{ name: 'Alex', role: 'composer_lyricist', pro: 'ASCAP', split: 100 }]
    expect(mergeComposers(existing, writer)).toEqual([
      { name: 'Alex', role: 'composer_lyricist', pro: 'ASCAP', split: 100 },
    ])
  })

  it('a no-op merge (unchanged roster) is idempotent', () => {
    const roster: Composer[] = [{ name: 'Alex', role: 'composer_lyricist', pro: 'ASCAP', split: 100 }]
    expect(mergeComposers(roster, roster)).toEqual(roster)
  })
})

describe('mapComposersToParties — writer rows only', () => {
  it('maps writer-role composers to party entries', () => {
    const composers: Composer[] = [
      { name: 'Alex', role: 'composer_lyricist', pro: 'ASCAP', ipi: '123', split: 60 },
      { name: 'Jamie', role: 'lyricist', pro: 'BMI', split: 40 },
    ]
    expect(mapComposersToParties(composers)).toEqual([
      { name: 'Alex', role: 'composer_lyricist', pro: 'ASCAP', ipi: '123', split_percentage: 60 },
      { name: 'Jamie', role: 'lyricist', pro: 'BMI', ipi: undefined, split_percentage: 40 },
    ])
  })

  it('excludes producer-role / project-only credit rows — they produce no party', () => {
    const composers: Composer[] = [
      { name: 'Alex', role: 'composer', pro: 'none', split: 70 },
      { name: 'Studio Sam', role: 'producer', pro: 'none', split: 30 },
    ]
    expect(mapComposersToParties(composers)).toEqual([
      { name: 'Alex', role: 'composer', pro: 'none', ipi: undefined, split_percentage: 70 },
    ])
  })
})

describe('round trip — an unchanged writer roster is a no-op', () => {
  it('parties -> composers -> merge(no existing) -> parties reproduces the original writer set', () => {
    const parties: SyncPartyInput[] = [
      { name: 'Alex', role: 'composer_lyricist', split_percentage: 60, pro: 'ASCAP', ipi: '111' },
      { name: 'Jamie', role: 'lyricist', split_percentage: 40, pro: 'BMI', ipi: '222' },
    ]
    const composers = mapPartiesToComposers(parties)
    const merged = mergeComposers([], composers)
    const backToParties = mapComposersToParties(merged)

    expect(backToParties).toEqual(
      parties.map(p => ({ name: p.name, role: p.role, pro: p.pro, ipi: p.ipi, split_percentage: p.split_percentage }))
    )
  })

  it('a project-only credit survives the round trip untouched', () => {
    const existing: Composer[] = [
      { name: 'Alex', role: 'composer_lyricist', pro: 'ASCAP', split: 60 },
      { name: 'Studio Sam', role: 'producer', pro: 'none', split: 0 },
    ]
    const writer = mapPartiesToComposers([{ name: 'Alex', role: 'composer_lyricist', split_percentage: 60, pro: 'ASCAP' }])
    const merged = mergeComposers(existing, writer)

    expect(merged).toContainEqual({ name: 'Studio Sam', role: 'producer', pro: 'none', split: 0 })
    expect(mapComposersToParties(merged)).toEqual([
      { name: 'Alex', role: 'composer_lyricist', pro: 'ASCAP', ipi: undefined, split_percentage: 60 },
    ])
  })
})
