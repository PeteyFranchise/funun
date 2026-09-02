// Server-only rollout boundary. Do not expose this as NEXT_PUBLIC_*: Slice 1
// has no artist-facing UI or client writes, and the default must remain off.

type SongPassportEnvironment = Readonly<Record<string, string | undefined>>

export function isSongPassportEnabled(
  environment: SongPassportEnvironment = process.env
): boolean {
  return environment.SONG_PASSPORT_ENABLED === 'true'
}

type CohortQueryResult = PromiseLike<{
  data: Array<{ enabled: boolean; starts_at: string; ends_at: string | null }> | null
  error: unknown
}>

export interface SongPassportCohortClient {
  from(table: 'song_passport_cohorts'): {
    select(columns: string): {
      eq(column: string, value: string | boolean): {
        eq(column: string, value: string | boolean): CohortQueryResult
      }
    }
  }
}

/** Server-only rollout decision. The emergency stop always wins. */
export async function isSongPassportAvailableForWork(
  client: SongPassportCohortClient,
  workId: string,
  accountUserId: string,
  environment: SongPassportEnvironment = process.env
): Promise<boolean> {
  if (environment.SONG_PASSPORT_KILL_SWITCH === 'true') return false
  if (isSongPassportEnabled(environment)) return true
  if (environment.SONG_PASSPORT_PILOT_ENABLED !== 'true') return false

  const [account, work] = await Promise.all([
    client.from('song_passport_cohorts').select('enabled, starts_at, ends_at').eq('account_user_id', accountUserId).eq('enabled', true),
    client.from('song_passport_cohorts').select('enabled, starts_at, ends_at').eq('work_id', workId).eq('enabled', true),
  ])
  if (account.error || work.error) return false
  const now = Date.now()
  return [...(account.data ?? []), ...(work.data ?? [])].some(row => {
    const starts = new Date(row.starts_at).getTime()
    const ends = row.ends_at ? new Date(row.ends_at).getTime() : Number.POSITIVE_INFINITY
    return row.enabled && starts <= now && ends > now
  })
}
