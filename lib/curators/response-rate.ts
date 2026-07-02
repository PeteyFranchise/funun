import type { SupabaseClient } from '@supabase/supabase-js'
import type { Curator, PitchStatus } from '@/types'

// ─── Response-rate aggregation (D-13) ───────────────────────────────────
// Formula: round( (accepted + declined) / total * 100 ) over pitch_history
// rows sent within the last 90 days, grouped by curator_id. Aggregated in
// app code (no test framework, matches lib/vault/readiness.ts style) rather
// than a SQL view. Curators with zero pitches in the 90-day window are
// OMITTED from the returned Map — absence means "hide the badge", never a
// 0% entry (UI-SPEC locked: response-rate badge hidden, not "0%").

export type CuratorWithRate = Curator & { response_rate: number | null }

// Directory-safe curator shape returned by the artist-facing GET route and
// the /curators page (never claim_token, email, or the raw claimed_by
// UUID — see app/api/curators/route.ts DIRECTORY_COLUMNS). `claimed_by` is
// collapsed to a `claimed` boolean before this ever leaves the server.
export type DirectoryCurator = Pick<
  Curator,
  | 'id'
  | 'name'
  | 'playlist_name'
  | 'playlist_url'
  | 'platform'
  | 'genre_focus'
  | 'reach_signal'
  | 'reach_fetched_at'
  | 'drift_flagged'
  | 'do_not_pitch'
  | 'email_valid'
> & {
  claimed: boolean
  response_rate: number | null
}

type PitchHistoryRow = { curator_id: string; status: PitchStatus; sent_at: string }

/**
 * Computes each curator's 90-day response rate from pitch_history.
 * Accepts a service-role client (caller passes createServiceClient()) since
 * pitch_history has no user-scoped SELECT policy for artists browsing the
 * directory of other curators' aggregate stats.
 */
export async function computeResponseRates(
  service: SupabaseClient,
  curatorIds?: string[]
): Promise<Map<string, number>> {
  const rates = new Map<string, number>()
  if (curatorIds && curatorIds.length === 0) return rates

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  let query = service
    .from('pitch_history')
    .select('curator_id, status, sent_at')
    .gte('sent_at', cutoff)

  if (curatorIds) query = query.in('curator_id', curatorIds)

  const { data, error } = await query
  if (error || !data) return rates

  const totals = new Map<string, { total: number; responded: number }>()
  for (const row of data as PitchHistoryRow[]) {
    const entry = totals.get(row.curator_id) ?? { total: 0, responded: 0 }
    entry.total += 1
    if (row.status === 'accepted' || row.status === 'declined') entry.responded += 1
    totals.set(row.curator_id, entry)
  }

  for (const [curatorId, { total, responded }] of totals) {
    if (total === 0) continue
    rates.set(curatorId, Math.round((responded / total) * 100))
  }

  return rates
}
