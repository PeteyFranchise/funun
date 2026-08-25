import type { SupabaseClient } from '@supabase/supabase-js'
import { aggregateTrack, aggregateSelectsRollup, type SelectsTrackEngagementRow } from './engagement'

// ─── buildEngagementRollup — leadership-wide aggregate across the team's ───
// book (R13, D-31.2-13/14). Extracted into lib/ (rather than living inline
// in the route file) so BOTH app/api/admin/client-partners/engagement-
// rollup/route.ts (the leadership-only HTTP surface, verifyAdmin-gated) and
// app/(admin)/admin/client-partners/page.tsx's loadClientPartnersRoomData
// (the RSC leadership tower's server-side load) call the SAME
// implementation — a Next.js route module may only export HTTP method
// handlers (mirrors lib/selects/tracks-query.ts's resolveTracksWithRightsReady
// doc comment), so this function cannot live in route.ts itself.
//
// Mirrors lib/client-partners/signals.ts's loadWholeBookWithCoverage
// batched-read shape: one query per source table via .in(), never a
// per-org/per-Selects round trip (T-31.2-27, no N+1). Every audible-second/
// qualified-listen/replay total is SUMmed at read time from the raw
// selects_track_engagement rows via lib/selects/engagement.ts's aggregation
// (plan 02) — never a stored running total (D-06). Callers MUST only invoke
// this for a verified leadership caller (T-31.2-27) — this module performs
// no role check itself; verifyAdmin() (the route) and the isLeadership
// branch (the RSC page, mirroring D-31.1-01's hide-not-filter discipline
// for loadWholeBookWithCoverage) are the sole gates.

type SelectsRow = { id: string; buyer_org_id: string; name: string }
type OrgRow = { id: string; name: string; ae_user_id: string | null }
type SelectsTrackRow = { id: string; selects_id: string }
type RawEngagementRow = Pick<SelectsTrackEngagementRow, 'selects_track_id' | 'viewer_key' | 'delta_seconds' | 'event'>
type OpenRow = { selects_id: string }
type StaffRow = { user_id: string; display_name: string }

export type EngagementRollupSelectsEntry = {
  selectsId: string
  selectsName: string
  orgId: string
  orgName: string
  audibleSeconds: number
  qualifiedListens: number
  replayCount: number
  opens: number
}

export type EngagementRollupAeEntry = {
  aeId: string
  aeName: string
  audibleSeconds: number
  qualifiedListens: number
  replayCount: number
  opens: number
  selects: EngagementRollupSelectsEntry[]
}

export type EngagementRollupData = {
  byAe: EngagementRollupAeEntry[]
}

export async function buildEngagementRollup(service: SupabaseClient): Promise<EngagementRollupData> {
  const { data: selectsData, error: selectsError } = await service.from('selects').select('id, buyer_org_id, name')
  if (selectsError) throw new Error(`Failed to load Selects for engagement rollup: ${selectsError.message}`)
  const selectsRows = (selectsData ?? []) as SelectsRow[]
  if (selectsRows.length === 0) return { byAe: [] }

  const orgIds = Array.from(new Set(selectsRows.map(r => r.buyer_org_id)))
  const { data: orgData, error: orgError } = await service
    .from('buyer_orgs')
    .select('id, name, ae_user_id')
    .in('id', orgIds)
  if (orgError) throw new Error(`Failed to load orgs for engagement rollup: ${orgError.message}`)
  const orgById = new Map(((orgData ?? []) as OrgRow[]).map(o => [o.id, o]))

  const selectsIds = selectsRows.map(r => r.id)
  const { data: trackRowsData, error: trackError } = await service
    .from('selects_tracks')
    .select('id, selects_id')
    .in('selects_id', selectsIds)
  if (trackError) throw new Error(`Failed to load Selects tracks for engagement rollup: ${trackError.message}`)
  const trackRows = (trackRowsData ?? []) as SelectsTrackRow[]

  const selectsTrackIds = trackRows.map(r => r.id)
  const { data: engagementRowsData, error: engagementError } =
    selectsTrackIds.length > 0
      ? await service
          .from('selects_track_engagement')
          .select('selects_track_id, viewer_key, delta_seconds, event')
          .in('selects_track_id', selectsTrackIds)
      : { data: [] as RawEngagementRow[], error: null }
  if (engagementError) throw new Error(`Failed to load engagement deltas for rollup: ${engagementError.message}`)
  const engagementRows = (engagementRowsData ?? []) as RawEngagementRow[]

  const { data: opensRowsData, error: opensError } = await service
    .from('selects_opens')
    .select('selects_id')
    .in('selects_id', selectsIds)
  if (opensError) throw new Error(`Failed to load opens for engagement rollup: ${opensError.message}`)
  const opensRows = (opensRowsData ?? []) as OpenRow[]

  const opensBySelects = new Map<string, number>()
  for (const row of opensRows) {
    opensBySelects.set(row.selects_id, (opensBySelects.get(row.selects_id) ?? 0) + 1)
  }

  const engagementByTrack = new Map<string, RawEngagementRow[]>()
  for (const row of engagementRows) {
    const bucket = engagementByTrack.get(row.selects_track_id)
    if (bucket) bucket.push(row)
    else engagementByTrack.set(row.selects_track_id, [row])
  }

  const tracksBySelects = new Map<string, SelectsTrackRow[]>()
  for (const row of trackRows) {
    const bucket = tracksBySelects.get(row.selects_id)
    if (bucket) bucket.push(row)
    else tracksBySelects.set(row.selects_id, [row])
  }

  const aeIds = Array.from(
    new Set(selectsRows.map(r => orgById.get(r.buyer_org_id)?.ae_user_id ?? null).filter((v): v is string => !!v))
  )
  const { data: staffData, error: staffError } =
    aeIds.length > 0
      ? await service.from('funun_staff').select('user_id, display_name').in('user_id', aeIds)
      : { data: [] as StaffRow[], error: null }
  if (staffError) throw new Error(`Failed to load AE names for engagement rollup: ${staffError.message}`)
  const aeNameById = new Map(((staffData ?? []) as StaffRow[]).map(s => [s.user_id, s.display_name]))

  const byAeMap = new Map<string, EngagementRollupAeEntry>()

  for (const selects of selectsRows) {
    const org = orgById.get(selects.buyer_org_id)
    const aeId = org?.ae_user_id ?? null
    // An unassigned org's Selects has no AE to attribute engagement to — the
    // per-AE rollup omits it (mirrors byAe's grouping in
    // lib/client-partners/coverage.ts, which only buckets assigned rows).
    if (!aeId) continue

    const tracksForSelects = tracksBySelects.get(selects.id) ?? []
    const trackAggs = tracksForSelects.map(t => aggregateTrack(t.id, engagementByTrack.get(t.id) ?? []))
    const rollup = aggregateSelectsRollup(trackAggs)
    const opens = opensBySelects.get(selects.id) ?? 0

    const entry: EngagementRollupSelectsEntry = {
      selectsId: selects.id,
      selectsName: selects.name,
      orgId: selects.buyer_org_id,
      orgName: org?.name ?? 'Unknown client',
      audibleSeconds: rollup.audibleSeconds,
      qualifiedListens: rollup.qualifiedListens,
      replayCount: rollup.replayCount,
      opens,
    }

    const aeEntry =
      byAeMap.get(aeId) ??
      ({
        aeId,
        aeName: aeNameById.get(aeId) ?? 'Unassigned',
        audibleSeconds: 0,
        qualifiedListens: 0,
        replayCount: 0,
        opens: 0,
        selects: [],
      } satisfies EngagementRollupAeEntry)

    aeEntry.audibleSeconds += entry.audibleSeconds
    aeEntry.qualifiedListens += entry.qualifiedListens
    aeEntry.replayCount += entry.replayCount
    aeEntry.opens += entry.opens
    aeEntry.selects.push(entry)

    byAeMap.set(aeId, aeEntry)
  }

  const byAe = Array.from(byAeMap.values()).sort((a, b) => b.audibleSeconds - a.audibleSeconds)

  return { byAe }
}
