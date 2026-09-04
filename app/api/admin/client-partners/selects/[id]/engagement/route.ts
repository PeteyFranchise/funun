import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { loadSelectsInScope } from '@/lib/selects/persistence'

// ─── GET /api/admin/client-partners/selects/[id]/engagement (R13, D-31.2-13/14) ─
// Staff GET mirroring app/api/admin/client-partners/[orgId]/game-plan/
// route.ts's pattern: requireStaff() -> own-Selects scope
// (loadSelectsInScope — the SAME authority every /api/admin/selects/*
// route uses, T-31-23) -> 404 not 403 for an out-of-book Selects. Reads
// bounded daily aggregates through a service-only SQL summary function.
// Staff-only, own-Selects-scoped (D-31.2-14); this response is never
// reachable from any client-facing surface — only the staff-gated
// EngagementPanel (plan 10 Task 1) calls it.

type SelectsTrackRow = { id: string; track_id: string }
type TrackTitleRow = { id: string; title: string | null }
type EngagementSummaryRow = {
  selects_track_id: string | null
  audible_seconds: number | string
  qualified_listens: number | string
  replay_count: number | string
  opens: number | string
}

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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const service = createServiceClient()
  const selects = await loadSelectsInScope(service, id, auth.staffRole, auth.user.id)
  if (!selects) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: trackRowsData, error: trackRowsError } = await service
    .from('selects_tracks')
    .select('id, track_id')
    .eq('selects_id', id)
    .is('removed_at', null)
  if (trackRowsError) {
    return NextResponse.json({ error: 'Could not load engagement.' }, { status: 500 })
  }
  const trackRows = (trackRowsData ?? []) as SelectsTrackRow[]

  const trackIds = Array.from(new Set(trackRows.map(r => r.track_id)))
  const { data: titleRowsData, error: titleRowsError } =
    trackIds.length > 0
      ? await service.from('tracks').select('id, title').in('id', trackIds)
      : { data: [] as TrackTitleRow[], error: null }
  if (titleRowsError) {
    return NextResponse.json({ error: 'Could not load engagement.' }, { status: 500 })
  }
  const titleById = new Map(((titleRowsData ?? []) as TrackTitleRow[]).map(t => [t.id, t.title]))

  const { data: summaryRowsData, error: summaryRowsError } = await service.rpc(
    'selects_engagement_summaries',
    { p_selects_ids: [id] }
  )
  if (summaryRowsError) {
    return NextResponse.json({ error: 'Could not load engagement.' }, { status: 500 })
  }
  const summaryRows = (summaryRowsData ?? []) as EngagementSummaryRow[]
  const summaryByTrack = new Map(
    summaryRows
      .filter((row): row is EngagementSummaryRow & { selects_track_id: string } => !!row.selects_track_id)
      .map(row => [row.selects_track_id, row])
  )

  const tracks: EngagementTrackReadout[] = trackRows.map(row => {
    const agg = summaryByTrack.get(row.id)
    return {
      selectsTrackId: row.id,
      title: titleById.get(row.track_id) ?? 'Untitled track',
      audibleSeconds: Number(agg?.audible_seconds ?? 0),
      qualifiedListens: Number(agg?.qualified_listens ?? 0),
      replayCount: Number(agg?.replay_count ?? 0),
    }
  })

  const summary = tracks.reduce<EngagementReadoutSummary>(
    (totals, track) => ({
      audibleSeconds: totals.audibleSeconds + track.audibleSeconds,
      qualifiedListens: totals.qualifiedListens + track.qualifiedListens,
      replayCount: totals.replayCount + track.replayCount,
      trackCount: totals.trackCount + 1,
    }),
    { audibleSeconds: 0, qualifiedListens: 0, replayCount: 0, trackCount: 0 }
  )

  const opens = summaryRows.reduce((max, row) => Math.max(max, Number(row.opens)), 0)
  const data: EngagementReadout = { tracks, summary, opens }
  return NextResponse.json({ data })
}
