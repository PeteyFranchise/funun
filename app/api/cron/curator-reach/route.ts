import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchReachSignal } from '@/lib/curators/reach'
import type { CuratorPlatform } from '@/types'

// ─── GET /api/cron/curator-reach ─────────────────────────────────────────
// Invoked weekly by Vercel Cron (vercel.json, "0 6 * * 1"). Vercel attaches
// an `Authorization: Bearer $CRON_SECRET` header automatically — this route
// rejects any request whose header doesn't match BEFORE any external fetch
// (T-06-02: without this check first, the route is a quota-burning DoS
// vector reachable by anyone on the public internet).
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  // Fail closed when CRON_SECRET isn't configured — otherwise the
  // comparison becomes `authHeader !== 'Bearer undefined'`, and any caller
  // who literally sends `Authorization: Bearer undefined` passes (WR-05).
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const service = createServiceClient()
  const { data: curators, error } = await service
    .from('curators')
    .select('id, platform, playlist_url')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let refreshed = 0
  for (const curator of curators ?? []) {
    // fetchReachSignal is a no-op (returns null) when SPOTIFY_/YOUTUBE_ env
    // vars are unset (D-04) and never throws, so one bad row can't break
    // the batch loop.
    const reach = await fetchReachSignal(
      curator.platform as CuratorPlatform,
      curator.playlist_url as string | null
    )
    if (reach !== null) {
      await service
        .from('curators')
        .update({ reach_signal: reach, reach_fetched_at: new Date().toISOString() })
        .eq('id', curator.id)
      refreshed += 1
    }
  }

  return NextResponse.json({ ok: true, refreshed })
}
