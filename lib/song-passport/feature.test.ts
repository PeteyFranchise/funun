import {
  isSongPassportAvailableForWork,
  isSongPassportEnabled,
  type SongPassportCohortClient,
} from '@/lib/song-passport/feature'

describe('Song Passport server feature boundary', () => {
  it('defaults to disabled', () => {
    expect(isSongPassportEnabled({})).toBe(false)
  })

  it('enables only for the exact true value', () => {
    expect(isSongPassportEnabled({ SONG_PASSPORT_ENABLED: 'true' })).toBe(true)
    expect(isSongPassportEnabled({ SONG_PASSPORT_ENABLED: 'TRUE' })).toBe(false)
    expect(isSongPassportEnabled({ SONG_PASSPORT_ENABLED: '1' })).toBe(false)
    expect(isSongPassportEnabled({ SONG_PASSPORT_ENABLED: 'false' })).toBe(false)
  })

  it('lets the emergency stop override global release', async () => {
    const client = cohortClient([])
    await expect(isSongPassportAvailableForWork(client, 'work-1', 'user-1', {
      SONG_PASSPORT_ENABLED: 'true',
      SONG_PASSPORT_KILL_SWITCH: 'true',
    })).resolves.toBe(false)
  })

  it('uses active server-owned cohorts only when pilot mode is enabled', async () => {
    const client = cohortClient([{ account_user_id: 'user-1', work_id: null, enabled: true, starts_at: '2026-01-01T00:00:00Z', ends_at: null }])
    await expect(isSongPassportAvailableForWork(client, 'work-1', 'user-1', {
      SONG_PASSPORT_PILOT_ENABLED: 'true',
    })).resolves.toBe(true)
    await expect(isSongPassportAvailableForWork(client, 'work-1', 'other', {
      SONG_PASSPORT_PILOT_ENABLED: 'true',
    })).resolves.toBe(false)
  })
})

function cohortClient(rows: Array<Record<string, unknown>>): SongPassportCohortClient {
  return {
    from() {
      const filters: Array<[string, unknown]> = []
      const builder = {
        select() { return builder },
        eq(column: string, value: unknown) {
          filters.push([column, value])
          return builder
        },
        then(resolve: (result: unknown) => unknown) {
          return Promise.resolve(resolve({
            data: rows.filter(row => filters.every(([column, value]) => row[column] === value)),
            error: null,
          }))
        },
      }
      return builder
    },
  } as unknown as SongPassportCohortClient
}
