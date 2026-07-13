import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { PLATFORM_VALUES } from '@/lib/curators/schema'
import { computeResponseRates } from '@/lib/curators/response-rate'
import type { DirectoryCurator } from '@/lib/curators/response-rate'
import type { Curator, CuratorPlatform } from '@/types'

// Explicit directory-safe column projection — NEVER select('*'). Excludes
// email, claim_token, claim_token_expires_at, baseline_genre_focus, and
// submission_notes (admin/curator-portal-only); claimed_by is projected
// but collapsed to a `claimed` boolean below, never returned raw (T-06-08).
const DIRECTORY_COLUMNS =
  'id, name, playlist_name, playlist_url, platform, genre_focus, reach_signal, reach_fetched_at, drift_flagged, do_not_pitch, email_valid, claimed_by'

type DirectoryRow = Pick<
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
  | 'claimed_by'
>

// ─── GET /api/curators ────────────────────────────────────────────────
// Authenticated-artist directory read (NOT public — 401 when unauthenticated).
// Returns directory-safe curator fields joined with each curator's 90-day
// response rate (PITCH-04 display side). Filterable via repeatable
// ?genre= and ?platform= searchParams (PITCH-01).
export async function GET(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const genres = searchParams
    .getAll('genre')
    .map(g => g.trim())
    .filter(Boolean)
  const platforms = searchParams
    .getAll('platform')
    .map(p => p.trim())
    .filter((p): p is CuratorPlatform => (PLATFORM_VALUES as readonly string[]).includes(p))

  // curators RLS SELECT policy is USING(true) — the artist-scoped client can
  // read the directory directly, no service client needed for this query.
  let query = supabase.from('curators').select(DIRECTORY_COLUMNS)
  if (platforms.length > 0) query = query.in('platform', platforms)
  if (genres.length > 0) query = query.overlaps('genre_focus', genres)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as unknown as DirectoryRow[]
  const rates = await computeResponseRates(
    createServiceClient(),
    rows.map(r => r.id)
  )

  const result: DirectoryCurator[] = rows.map(row => {
    const { claimed_by, ...rest } = row
    return {
      ...rest,
      claimed: claimed_by !== null,
      response_rate: rates.get(row.id) ?? null,
    }
  })

  return NextResponse.json({ data: result })
}
