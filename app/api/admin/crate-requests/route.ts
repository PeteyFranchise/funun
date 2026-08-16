import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { coerceBrief } from '@/lib/buyer/brief'
import { rankCrateRequests, type CrateRequestItem } from '@/lib/crate-requests/ranking'

// ─── GET /api/admin/crate-requests — the Crate Requests demand inbox (R10) ─
// Absorbs the read-only Lead Engine (app/(admin)/admin/lead-engine) into an
// intent-ranked, own-book-scoped, guest-aware feed: buyer_briefs (migration
// 106) + Selects re-opens (migration 111) for covered orgs, normalized into
// lib/crate-requests/ranking.ts's CrateRequestItem shape and ordered by
// rankCrateRequests — ordering is NEVER re-implemented here (the route only
// normalizes + tags; the ranker owns the order).
//
// Coverage mirrors app/(admin)/admin/my-client-partners/page.tsx exactly:
// non-leadership sees only buyer_orgs where ae_user_id = them; leadership is
// unscoped. Every query below is pre-filtered to that covered-org id set
// BEFORE it reaches the ranker, so a covered-org filter bug can only ever
// under-return, never leak another AE's client activity (T-31-16).
//
// Sources actually available today: buyer_briefs (106) and selects (111)
// status transitions (approved / changes_requested = the client re-opened
// and acted on a sent Selects). Search-activity logging and tag-browsing
// telemetry (BUILD-SPEC §2/§4) have no backing table yet — those two
// signal kinds are intentionally empty until a future slice ships them;
// this route degrades tolerantly (never throws) exactly like the Lead
// Engine page did for a lagging schema cache.
//
// Guest signals (T-31-17): a guest reaction on a covered org's sent
// Selects (selects_reactions.reacted_by IS NULL — the public /selects/
// [token] player needs no login) is surfaced as a new-lead item with
// clientOrgId deliberately set to null — never attributed to the org the
// link happened to belong to, since an anonymous forwarded link cannot be
// verified as coming from a named contact at that company.

type OrgRow = { id: string; name: string | null }

function orgNameMap(orgs: OrgRow[]): Map<string, string> {
  return new Map(orgs.map(o => [o.id, o.name ?? 'Client']))
}

// ─── buyer_briefs -> CrateRequestItem[] ────────────────────────────────────
type BriefRow = {
  id: string
  buyer_org_id: string
  status: string
  brief: unknown
  deadline: string | null
  created_at: string
  updated_at: string
}

function normalizeBriefs(rows: BriefRow[]): CrateRequestItem[] {
  return rows.map(r => {
    const brief = coerceBrief(r.brief)
    return {
      id: r.id,
      kind: 'brief',
      clientOrgId: r.buyer_org_id,
      isGuest: false,
      // 'new' means the AE hasn't touched it yet; anything past that has
      // been reviewed at least once.
      createdAt: r.created_at,
      actionedAt: r.status === 'new' ? null : r.updated_at,
      deadline: r.deadline,
      budget: brief.deal.budget || null,
    }
  })
}

// ─── selects (status transition) -> CrateRequestItem[] ────────────────────
// A Selects moving to 'approved' or 'changes_requested' after being sent IS
// the client re-opening it and acting — the closest concrete signal to a
// "re-open" available without the per-track engagement telemetry that R13
// (a later plan) adds. 'changes_requested' still needs an AE follow-up
// (unactioned); 'approved' does not (actioned).
type SelectsReopenRow = {
  id: string
  buyer_org_id: string
  status: string
  updated_at: string
}

function normalizeSelectsReopens(rows: SelectsReopenRow[]): CrateRequestItem[] {
  return rows.map(r => ({
    id: r.id,
    kind: 'selects_reopen',
    clientOrgId: r.buyer_org_id,
    isGuest: false,
    createdAt: r.updated_at,
    actionedAt: r.status === 'approved' ? r.updated_at : null,
    deadline: null,
    budget: null,
  }))
}

// ─── guest selects_reactions -> CrateRequestItem[] (new-lead) ─────────────
type GuestReactionRow = { id: string; created_at: string }

function normalizeGuestReactions(rows: GuestReactionRow[]): CrateRequestItem[] {
  return rows.map(r => ({
    id: r.id,
    kind: 'selects_reopen',
    clientOrgId: null,
    isGuest: true,
    createdAt: r.created_at,
    actionedAt: null,
    deadline: null,
    budget: null,
  }))
}

// Fetches selects_reactions rows with no authenticated reactor
// (reacted_by IS NULL — a guest viewing the public token player) scoped to
// Selects belonging to a covered org. Three round trips (selects ->
// selects_tracks -> selects_reactions) because Postgres FKs, not a text
// ref, connect them (migration 111); each step tolerates a query error by
// degrading to an empty result rather than throwing.
async function fetchGuestReactionItems(
  service: ReturnType<typeof createServiceClient>,
  orgIds: string[]
): Promise<CrateRequestItem[]> {
  if (orgIds.length === 0) return []

  const { data: selectsRows } = await service
    .from('selects')
    .select('id')
    .in('buyer_org_id', orgIds)
    .neq('status', 'draft')
    .limit(500)
  const selectsIds = (selectsRows ?? []).map(r => r.id as string)
  if (selectsIds.length === 0) return []

  const { data: trackRows } = await service
    .from('selects_tracks')
    .select('id')
    .in('selects_id', selectsIds)
    .limit(2000)
  const trackIds = (trackRows ?? []).map(r => r.id as string)
  if (trackIds.length === 0) return []

  const { data: reactionRows, error } = await service
    .from('selects_reactions')
    .select('id, created_at')
    .in('selects_track_id', trackIds)
    .is('reacted_by', null)
    .limit(500)
  if (error || !reactionRows) return []

  return normalizeGuestReactions(reactionRows as GuestReactionRow[])
}

// ─── per-row one-click action (UI-consumable, no page URL guessed here — ─
// the builder UI (31-10) and its route wiring land in a later plan) ────────
// Exported so the Crate Requests room (31-11, CrateRequestsFeed.tsx) can
// type its fetched rows against this route's exact response shape instead
// of re-declaring a parallel type that could drift.
export type RowAction =
  | { type: 'see_lead' }
  | { type: 'build_selects'; buyerOrgId: string; briefId: string }
  | { type: 'follow_up'; buyerOrgId: string }

function actionFor(row: { isNewLead: boolean; kind: string; clientOrgId: string | null; id: string }): RowAction {
  if (row.isNewLead) return { type: 'see_lead' }
  if (row.kind === 'brief' && row.clientOrgId) {
    return { type: 'build_selects', buyerOrgId: row.clientOrgId, briefId: row.id }
  }
  return { type: 'follow_up', buyerOrgId: row.clientOrgId ?? '' }
}

export async function GET() {
  const auth = await requireStaff()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const service = createServiceClient()

  // Covered orgs — the exact read-side twin of /admin/my-client-partners
  // and GET /api/admin/buyer-orgs: non-leadership scoped to their assigned
  // orgs, leadership unscoped.
  let orgQuery = service.from('buyer_orgs').select('id, name')
  if (auth.staffRole !== 'leadership') {
    orgQuery = orgQuery.eq('ae_user_id', auth.user.id)
  }
  const { data: orgRows } = await orgQuery
  const orgs = (orgRows ?? []) as OrgRow[]
  const orgIds = orgs.map(o => o.id)
  const orgName = orgNameMap(orgs)

  if (orgIds.length === 0) {
    return NextResponse.json({ data: [] })
  }

  // Tolerant of a table lagging behind a fresh migration (schema-cache
  // reload) — a query error degrades to an empty source, never a 500.
  const { data: briefRows, error: briefsError } = await service
    .from('buyer_briefs')
    .select('id, buyer_org_id, status, brief, deadline, created_at, updated_at')
    .in('buyer_org_id', orgIds)
    .limit(200)

  const { data: selectsRows, error: selectsError } = await service
    .from('selects')
    .select('id, buyer_org_id, status, updated_at')
    .in('buyer_org_id', orgIds)
    .in('status', ['approved', 'changes_requested'])
    .limit(200)

  const guestItems = await fetchGuestReactionItems(service, orgIds)

  const items: CrateRequestItem[] = [
    ...(briefsError || !briefRows ? [] : normalizeBriefs(briefRows as BriefRow[])),
    ...(selectsError || !selectsRows ? [] : normalizeSelectsReopens(selectsRows as SelectsReopenRow[])),
    // Search-activity + tag-browsing sources are not built yet (no backing
    // table) — intentionally empty until a future slice adds them.
    ...guestItems,
  ]

  const ranked = rankCrateRequests(items)

  const data = ranked.map(row => ({
    ...row,
    clientTag: row.isNewLead ? 'New lead' : orgName.get(row.clientOrgId ?? '') ?? 'Client',
    action: actionFor(row),
  }))

  return NextResponse.json({ data })
}
