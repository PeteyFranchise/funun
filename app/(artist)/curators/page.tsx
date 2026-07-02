import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { CuratorDirectory } from '@/components/curators/CuratorDirectory'
import { PLATFORM_VALUES } from '@/lib/curators/schema'
import { computeResponseRates } from '@/lib/curators/response-rate'
import type { DirectoryCurator } from '@/lib/curators/response-rate'
import type { Curator, CuratorPlatform } from '@/types'

export const dynamic = 'force-dynamic'

// Same directory-safe column projection as app/api/curators/route.ts — never
// select('*'), never email/claim_token/raw claimed_by (T-06-08).
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

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

// ─── /curators — artist-facing curator directory (PITCH-01, PITCH-04) ────
// Browse-only entry point (D-06/D-07 — the pitch composer never lives here).
// Fetches server-side directly (no self-fetch of /api/curators), mirroring
// the launchpad page's server-first data flow.
export default async function CuratorsPage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string | string[]; platform?: string | string[] }>
}) {
  const params = await searchParams
  const genres = toArray(params.genre).map(g => g.trim()).filter(Boolean)
  const platforms = toArray(params.platform)
    .map(p => p.trim())
    .filter((p): p is CuratorPlatform => (PLATFORM_VALUES as readonly string[]).includes(p))

  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  let query = supabase.from('curators').select(DIRECTORY_COLUMNS)
  if (platforms.length > 0) query = query.in('platform', platforms)
  if (genres.length > 0) query = query.overlaps('genre_focus', genres)

  const { data } = await query
  const rows = (data ?? []) as unknown as DirectoryRow[]

  const rates = await computeResponseRates(
    createServiceClient(),
    rows.map(r => r.id)
  )

  const curators: DirectoryCurator[] = rows.map(row => {
    const { claimed_by, ...rest } = row
    return {
      ...rest,
      claimed: claimed_by !== null,
      response_rate: rates.get(row.id) ?? null,
    }
  })

  return (
    <>
      <Topbar title="Curators" subtitle="Find playlist curators to pitch your release" />
      <div className="px-9 py-[30px]">
        <CuratorDirectory initialCurators={curators} />
      </div>
    </>
  )
}
