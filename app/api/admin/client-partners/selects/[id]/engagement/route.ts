import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { loadSelectsInScope } from '@/lib/selects/persistence'
import { aggregateTrack, aggregateSelectsRollup, type SelectsTrackEngagementRow } from '@/lib/selects/engagement'

// ─── GET /api/admin/client-partners/selects/[id]/engagement (R13, D-31.2-13/14) ─
// Staff GET mirroring app/api/admin/client-partners/[orgId]/game-plan/
// route.ts's pattern: requireStaff() -> own-Selects scope
// (loadSelectsInScope — the SAME authority every /api/admin/selects/*
// route uses, T-31-23) -> 404 not 403 for an out-of-book Selects. Reads
// the raw selects_track_engagement + selects_opens rows and SUMs them at
// read time via lib/selects/engagement.ts's aggregation (plan 02) — never
// a stored total (D-06). Staff-only, own-Selects-scoped (D-31.2-14); this
// response is never reachable from any client-facing surface — only the
// staff-gated EngagementPanel (plan 10 Task 1) calls it.

type SelectsTrackRow = { id: string; track_id: string }
type TrackTitleRow = { id: string; title: string | null }
type RawEngagementRow = Pick<SelectsTrackEngagementRow, 'selects_track_id' | 'viewer_key' | 'delta_seconds' | 'event'>

export type EngagementTrackReadout = {
  selectsTrackId: string
  title: string
  audibleSeconds: number
  qualifiedListens: number
  replayCount: number
}

export type EngagementReadoutSummary = {
  audibleSeconds: number
  qualifiedListens: number
  replayCount: number
  trackCount: number
}

export type EngagementReadout = {
  tracks: EngagementTrackReadout[]
  summary: EngagementReadoutSummary
  opens: number
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const service = createServiceClient()
  const selects = await loadSelectsInScope(service, id, auth.staffRole, auth.user.id)
  if (!selects) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: trackRowsData } = await service
    .from('selects_tracks')
    .select('id, track_id')
    .eq('selects_id', id)
    .is('removed_at', null)
  const trackRows = (trackRowsData ?? []) as SelectsTrackRow[]

  const trackIds = Array.from(new Set(trackRows.map(r => r.track_id)))
  const { data: titleRowsData } =
    trackIds.length > 0
      ? await service.from('tracks').select('id, title').in('id', trackIds)
      : { data: [] as TrackTitleRow[] }
  const titleById = new Map(((titleRowsData ?? []) as TrackTitleRow[]).map(t => [t.id, t.title]))

  const selectsTrackIds = trackRows.map(r => r.id)
  const { data: engagementRowsData } =
    selectsTrackIds.length > 0
      ? await service
          .from('selects_track_engagement')
          .select('selects_track_id, viewer_key, delta_seconds, event')
          .in('selects_track_id', selectsTrackIds)
      : { data: [] as RawEngagementRow[] }
  const engagementRows = (engagementRowsData ?? []) as RawEngagementRow[]

  const rowsByTrack = new Map<string, RawEngagementRow[]>()
  for (const row of engagementRows) {
    const bucket = rowsByTrack.get(row.selects_track_id)
    if (bucket) bucket.push(row)
    else rowsByTrack.set(row.selects_track_id, [row])
  }

  const tracks: EngagementTrackReadout[] = trackRows.map(row => {
    const agg = aggregateTrack(row.id, rowsByTrack.get(row.id) ?? [])
    return {
      selectsTrackId: row.id,
      title: titleById.get(row.track_id) ?? 'Untitled track',
      audibleSeconds: agg.audibleSeconds,
      qualifiedListens: agg.qualifiedListens,
      replayCount: agg.replayCount,
    }
  })

  const summary = aggregateSelectsRollup(
    tracks.map(t => ({
      selectsTrackId: t.selectsTrackId,
      audibleSeconds: t.audibleSeconds,
      qualifiedListens: t.qualifiedListens,
      replayCount: t.replayCount,
    }))
  )

  const { count: opensCount } = await service
    .from('selects_opens')
    .select('id', { count: 'exact', head: true })
    .eq('selects_id', id)

  const data: EngagementReadout = { tracks, summary, opens: opensCount ?? 0 }
  return NextResponse.json({ data })
}
