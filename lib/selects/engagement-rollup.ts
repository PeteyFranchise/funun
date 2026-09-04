import type { SupabaseClient } from '@supabase/supabase-js'

// ─── buildEngagementRollup — leadership-wide aggregate across the team's ───
// book (R13, D-31.2-13/14). Extracted into lib/ (rather than living inline
// in the route file) so BOTH app/api/admin/client-partners/engagement-
// rollup/route.ts (the leadership-only HTTP surface, verifyAdmin-gated) and
// app/(admin)/admin/client-partners/page.tsx's loadClientPartnersRoomData
// (the RSC leadership tower's server-side load) call the SAME
// implementation — a Next.js route module may only export HTTP method
// handlers, so this function cannot live in route.ts itself.
//
// Mirrors lib/client-partners/signals.ts's batched-read shape: one query per
// source plus one service-only SQL summary call, never a per-org/per-Selects
// round trip (T-31.2-27, no N+1). The database reads bounded daily
// aggregates, avoiding an unbounded raw-event scan in application memory.
// Callers MUST only invoke this for a verified leadership caller
// (T-31.2-27) — this module performs no role check itself; verifyAdmin()
// (the route) and the isLeadership
// branch (the RSC page, mirroring D-31.1-01's hide-not-filter discipline
// for loadWholeBookWithCoverage) are the sole gates.

type SelectsRow = { id: string; buyer_org_id: string; name: string }
type OrgRow = { id: string; name: string; ae_user_id: string | null }
type StaffRow = { user_id: string; display_name: string }
type EngagementSummaryRow = {
  selects_id: string
  selects_track_id: string | null
  audible_seconds: number | string
  qualified_listens: number | string
  replay_count: number | string
  opens: number | string
}

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
  const { data: summaryData, error: summaryError } = await service.rpc(
    'selects_engagement_summaries',
    { p_selects_ids: selectsIds }
  )
  if (summaryError) throw new Error(`Failed to load engagement summaries: ${summaryError.message}`)
  const summaryRows = (summaryData ?? []) as EngagementSummaryRow[]

  const summariesBySelects = new Map<string, EngagementSummaryRow[]>()
  for (const row of summaryRows) {
    const bucket = summariesBySelects.get(row.selects_id)
    if (bucket) bucket.push(row)
    else summariesBySelects.set(row.selects_id, [row])
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

    const summaries = summariesBySelects.get(selects.id) ?? []
    const audibleSeconds = summaries.reduce((sum, row) => sum + Number(row.audible_seconds), 0)
    const qualifiedListens = summaries.reduce((sum, row) => sum + Number(row.qualified_listens), 0)
    const replayCount = summaries.reduce((sum, row) => sum + Number(row.replay_count), 0)
    // The SQL summary repeats the Selects-level open count on each track row;
    // use the maximum once rather than multiplying it by the track count.
    const opens = summaries.reduce((max, row) => Math.max(max, Number(row.opens)), 0)

    const entry: EngagementRollupSelectsEntry = {
      selectsId: selects.id,
      selectsName: selects.name,
      orgId: selects.buyer_org_id,
      orgName: org?.name ?? 'Unknown client',
      audibleSeconds,
      qualifiedListens,
      replayCount,
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
