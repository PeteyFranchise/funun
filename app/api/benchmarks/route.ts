import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'

// Persists the artist's latest Breakthrough Benchmarking metrics so the Antenna
// room can gate opportunities against the same numbers. Stored in the existing
// artist_profiles.sound_identity JSONB (no new table), and mirrored to the
// monthly_listeners column so the rest of the app stays consistent.

const FIELDS = [
  'monthlyListeners',
  'savesToStreamsPct',
  'followerGrowthPctMonthly',
  'engagementRatePct',
  'playlistAddsPerMonth',
] as const

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export async function POST(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const metrics = Object.fromEntries(FIELDS.map(k => [k, num(body[k])])) as Record<
    (typeof FIELDS)[number],
    number
  >

  // sound_identity has no authenticated UPDATE grant (migration 040 comment
  // incorrectly stated it was write-only via profile/route.ts — this route
  // writes it directly). Ownership is confirmed via auth.getUser() above,
  // so both the merge-read and the update run via the service-role client
  // (D-19 pattern; see CR-02 fix).
  const service = createServiceClient()

  // Merge into the existing sound_identity so other fields are preserved.
  const { data: profile } = await service
    .from('artist_profiles')
    .select('sound_identity')
    .eq('id', user.id)
    .maybeSingle()

  const sound_identity = {
    ...((profile?.sound_identity as Record<string, unknown> | null) ?? {}),
    benchmarks: metrics,
  }

  const { error } = await service
    .from('artist_profiles')
    .update({ sound_identity, monthly_listeners: Math.round(metrics.monthlyListeners) })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
