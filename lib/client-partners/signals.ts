import type { SupabaseClient } from '@supabase/supabase-js'
import { computeHealth, type HealthRulesConfig, type HealthSignals } from './health'
import { daysInStage, resolveStage, type PipelineStage } from './stages'
import type { ClientPartnerRow } from './columns'

// ─── Client Partners — health & stage data-source layer (R3/R6, plan 04) ───
// The I/O tier that assembles ClientPartnerRow[] for both the My tab
// (own-book, loadBook) and the leadership-only All tab
// (loadWholeBookWithCoverage) by fetching the already-built pure engines'
// inputs (health.ts's computeHealth, stages.ts's daysInStage/resolveStage)
// and calling them per row. Batched queries only (one round-trip per
// signal source across the whole org set, never per-row) — the whole-book
// loader can run over the entire buyer_orgs table.
//
// D-31.1-09: the health-color clock reads license_requests.executed_at
// (stamped by the explicit executed/signed action, lib/deals/executed.ts —
// NOT the closed_won stage transition). D-31.1-02: last contact is
// surfaced as lastTouchAt for the "last touch" column / "last contacted X
// ago" card copy, but is never itself the color driver — it only reaches
// computeHealth as the optional keep_warm_recent_contact hold input.

const BRIEF_TERMINAL_STATUSES = new Set(['licensed', 'closed'])
const TERMINAL_DEAL_STAGES = new Set(['closed_won', 'closed_lost'])

// Mirrors migration 129's owner-decided health_rules_config defaults
// (2026-08-24: good=30, warning=60, at_risk=180; cold_after_days is
// DEPRECATED/unused by the 3-threshold color model — kept equal to
// at_risk_after_days for backward compat with the DB column) — used only
// as a defensive fallback if the singleton row is somehow missing (it is
// seeded by the migration itself; this never fires in a correctly-migrated
// database, but a missing-row read must never throw or silently treat
// every client as 'good').
const DEFAULT_HEALTH_RULES: HealthRulesConfig = {
  good_within_days: 30,
  warning_after_days: 60,
  at_risk_after_days: 180,
  cold_after_days: 180,
  keep_warm_open_brief: true,
  keep_warm_open_deal: true,
  keep_warm_recent_selects: true,
  recent_selects_days: 21,
  keep_warm_recent_contact: false,
  recent_contact_days: 30,
}

// ─── Config + stage lookups ─────────────────────────────────────────────

export async function fetchHealthRulesConfig(service: SupabaseClient): Promise<HealthRulesConfig> {
  const { data, error } = await service
    .from('health_rules_config')
    .select(
      'good_within_days, warning_after_days, at_risk_after_days, cold_after_days, keep_warm_open_brief, keep_warm_open_deal, keep_warm_recent_selects, recent_selects_days, keep_warm_recent_contact, recent_contact_days'
    )
    .eq('id', 1)
    .maybeSingle()

  if (error) throw new Error(`Failed to fetch health rules config: ${error.message}`)
  // A genuine query error is handled above; a NULL row with no error means
  // the singleton is simply missing (never happens post-migration, but must
  // not throw) — fall back to the seeded defaults.
  if (!data) return DEFAULT_HEALTH_RULES
  return data as HealthRulesConfig
}

type PipelineStageRow = {
  id: string
  key: string
  label: string
  sort_order: number
  is_terminal: boolean
}

export async function fetchPipelineStages(service: SupabaseClient): Promise<PipelineStage[]> {
  const { data, error } = await service
    .from('pipeline_stages')
    .select('id, key, label, sort_order, is_terminal')
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Failed to fetch pipeline stages: ${error.message}`)
  return ((data ?? []) as PipelineStageRow[]).map(row => ({
    id: row.id,
    key: row.key,
    label: row.label,
    sortOrder: row.sort_order,
    isTerminal: row.is_terminal,
  }))
}

// ─── Deal signals (D-31.1-09 — the health-color clock source) ──────────

type DealSignalRow = {
  buyer_org_id: string
  stage: string
  gross_fee_cents: number | null
  budget_cents: number | null
  executed_at: string | null
}

type DealAgg = {
  lastExecutedLicenseAt: string | null
  hasOpenDeal: boolean
  /** Dollars, not cents — matches ClientPartnerRow.openDealValue's documented unit (coverage.ts). */
  openDealValue: number
  /** Dollars, not cents — matches ClientPartnerRow.lifetimeValue's documented unit. */
  lifetimeValue: number
}

function emptyDealAgg(): DealAgg {
  return { lastExecutedLicenseAt: null, hasOpenDeal: false, openDealValue: 0, lifetimeValue: 0 }
}

/**
 * Groups already-fetched deal rows by org, computing the executed-license
 * clock (lifetimeValue's source), and the in-flight/not-yet-executed
 * pipeline (openDealValue/hasOpenDeal — non-terminal stage AND no
 * executed_at yet). A deal with executed_at set counts toward
 * lifetimeValue regardless of its stage; a deal with no executed_at counts
 * toward the open pipeline only while its stage is non-terminal (a
 * closed_lost deal with no executed_at contributes to neither bucket).
 */
function aggregateDealsByOrg(deals: DealSignalRow[]): Map<string, DealAgg> {
  const map = new Map<string, DealAgg>()

  for (const deal of deals) {
    const agg = map.get(deal.buyer_org_id) ?? emptyDealAgg()

    if (deal.executed_at) {
      if (!agg.lastExecutedLicenseAt || new Date(deal.executed_at) > new Date(agg.lastExecutedLicenseAt)) {
        agg.lastExecutedLicenseAt = deal.executed_at
      }
      agg.lifetimeValue += (deal.gross_fee_cents ?? 0) / 100
    } else if (!TERMINAL_DEAL_STAGES.has(deal.stage)) {
      agg.hasOpenDeal = true
      agg.openDealValue += (deal.gross_fee_cents ?? deal.budget_cents ?? 0) / 100
    }

    map.set(deal.buyer_org_id, agg)
  }

  return map
}

async function fetchDealsForOrgs(service: SupabaseClient, orgIds: string[]): Promise<DealSignalRow[]> {
  if (orgIds.length === 0) return []
  const { data, error } = await service
    .from('license_requests')
    .select('buyer_org_id, stage, gross_fee_cents, budget_cents, executed_at')
    .in('buyer_org_id', orgIds)
  if (error) throw new Error(`Failed to fetch deals for orgs: ${error.message}`)
  return (data ?? []) as DealSignalRow[]
}

/** Pure max-ISO-timestamp reducer, exported for direct testing. Null/undefined entries are skipped; an all-empty input returns null. */
export function maxTimestamp(values: (string | null | undefined)[]): string | null {
  let max: string | null = null
  for (const value of values) {
    if (!value) continue
    if (!max || new Date(value) > new Date(max)) max = value
  }
  return max
}

/**
 * Single-org read of the executed-license clock (D-31.1-09) — the max
 * executed_at over the org's license_requests, or null when the org has
 * never had a license executed (the 'prospect' health state's source
 * signal). loadBook/loadWholeBookWithCoverage use the batched
 * fetchDealsForOrgs + aggregateDealsByOrg path instead (avoids an N+1
 * query per row); this export exists for callers/tests that need just
 * this one signal in isolation.
 */
export async function lastExecutedLicenseAt(service: SupabaseClient, orgId: string): Promise<string | null> {
  const { data, error } = await service
    .from('license_requests')
    .select('executed_at')
    .eq('buyer_org_id', orgId)
    .not('executed_at', 'is', null)
  if (error) throw new Error(`Failed to fetch last executed license: ${error.message}`)
  return maxTimestamp(((data ?? []) as { executed_at: string | null }[]).map(row => row.executed_at))
}

// ─── Other per-org signal fetches (batched, no N+1) ─────────────────────

async function fetchCountByOrg(
  service: SupabaseClient,
  table: 'buyer_org_contacts' | 'selects',
  orgIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (orgIds.length === 0) return counts
  const { data, error } = await service.from(table).select('buyer_org_id').in('buyer_org_id', orgIds)
  if (error) throw new Error(`Failed to fetch ${table} counts: ${error.message}`)
  for (const row of (data ?? []) as { buyer_org_id: string }[]) {
    counts.set(row.buyer_org_id, (counts.get(row.buyer_org_id) ?? 0) + 1)
  }
  return counts
}

async function fetchOpenBriefsByOrg(service: SupabaseClient, orgIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (orgIds.length === 0) return counts
  const { data, error } = await service.from('buyer_briefs').select('buyer_org_id, status').in('buyer_org_id', orgIds)
  if (error) throw new Error(`Failed to fetch open briefs by org: ${error.message}`)
  for (const row of (data ?? []) as { buyer_org_id: string; status: string }[]) {
    if (BRIEF_TERMINAL_STATUSES.has(row.status)) continue
    counts.set(row.buyer_org_id, (counts.get(row.buyer_org_id) ?? 0) + 1)
  }
  return counts
}

async function fetchLastSelectsSentByOrg(
  service: SupabaseClient,
  orgIds: string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  if (orgIds.length === 0) return map
  const { data, error } = await service.from('selects').select('buyer_org_id, sent_at').in('buyer_org_id', orgIds)
  if (error) throw new Error(`Failed to fetch last Selects sent by org: ${error.message}`)
  for (const row of (data ?? []) as { buyer_org_id: string; sent_at: string | null }[]) {
    if (!row.sent_at) continue
    const current = map.get(row.buyer_org_id)
    if (!current || new Date(row.sent_at) > new Date(current)) map.set(row.buyer_org_id, row.sent_at)
  }
  return map
}

async function fetchLastContactByOrg(
  service: SupabaseClient,
  orgIds: string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  if (orgIds.length === 0) return map
  const { data, error } = await service
    .from('client_relationship_log')
    .select('buyer_org_id, created_at')
    .in('buyer_org_id', orgIds)
  if (error) throw new Error(`Failed to fetch last contact by org: ${error.message}`)
  for (const row of (data ?? []) as { buyer_org_id: string; created_at: string }[]) {
    const current = map.get(row.buyer_org_id)
    if (!current || new Date(row.created_at) > new Date(current)) map.set(row.buyer_org_id, row.created_at)
  }
  return map
}

async function fetchStaffNames(service: SupabaseClient, userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (userIds.length === 0) return map
  const { data, error } = await service.from('funun_staff').select('user_id, display_name').in('user_id', userIds)
  if (error) throw new Error(`Failed to fetch staff names: ${error.message}`)
  for (const row of (data ?? []) as { user_id: string; display_name: string }[]) {
    map.set(row.user_id, row.display_name)
  }
  return map
}

// ─── Row assembly ────────────────────────────────────────────────────────

type OrgSignalRow = {
  id: string
  name: string
  website: string | null
  ae_user_id: string | null
  pipeline_stage_id: string | null
  stage_entered_at: string | null
}

const ORG_SIGNAL_COLUMNS = 'id, name, website, ae_user_id, pipeline_stage_id, stage_entered_at'

async function assembleRows(
  service: SupabaseClient,
  orgs: OrgSignalRow[],
  aeNameById: Map<string, string>
): Promise<ClientPartnerRow[]> {
  const orgIds = orgs.map(o => o.id)
  const now = Date.now()

  const [rules, stages, deals, openBriefsByOrg, activeSelectsByOrg, lastSelectsSentByOrg, contactsByOrg, lastContactByOrg] =
    await Promise.all([
      fetchHealthRulesConfig(service),
      fetchPipelineStages(service),
      fetchDealsForOrgs(service, orgIds),
      fetchOpenBriefsByOrg(service, orgIds),
      fetchCountByOrg(service, 'selects', orgIds),
      fetchLastSelectsSentByOrg(service, orgIds),
      fetchCountByOrg(service, 'buyer_org_contacts', orgIds),
      fetchLastContactByOrg(service, orgIds),
    ])

  const dealAggByOrg = aggregateDealsByOrg(deals)

  return orgs.map(org => {
    const agg = dealAggByOrg.get(org.id) ?? emptyDealAgg()
    const lastContactAt = lastContactByOrg.get(org.id) ?? null
    const signals: HealthSignals = {
      lastExecutedLicenseAt: agg.lastExecutedLicenseAt,
      hasOpenBrief: (openBriefsByOrg.get(org.id) ?? 0) > 0,
      hasOpenDeal: agg.hasOpenDeal,
      lastSelectsSentAt: lastSelectsSentByOrg.get(org.id) ?? null,
      lastContactAt,
      now,
    }
    const stage = resolveStage(org.pipeline_stage_id, stages)

    return {
      id: org.id,
      name: org.name,
      website: org.website,
      status: stage?.label ?? null,
      // 31.2 plan 09: the resolved stage KEY (not the label) — closes plan
      // 06's deferred wiring item so matchingClientCount (plays-eligibility.ts)
      // can match a Play assignment's pipelineStageKey targeting against the
      // AE's own book, exactly as it already does for healthBand.
      pipelineStageKey: stage?.key ?? null,
      health: computeHealth(signals, rules),
      stageDays: daysInStage(org.stage_entered_at, now),
      openBriefs: openBriefsByOrg.get(org.id) ?? 0,
      activeSelects: activeSelectsByOrg.get(org.id) ?? 0,
      openDealValue: agg.openDealValue,
      lifetimeValue: agg.lifetimeValue,
      // D-31.1-02: tracked/shown, never a color input except through the
      // explicit keep_warm_recent_contact hold folded into `signals` above.
      lastTouchAt: lastContactAt,
      contactsCount: contactsByOrg.get(org.id) ?? 0,
      assignedAeId: org.ae_user_id,
      assignedAeName: org.ae_user_id ? aeNameById.get(org.ae_user_id) ?? null : null,
    }
  })
}

/**
 * Own-book rows (My tab) — scoped to a single AE/BD's assigned orgs.
 * Mirrors app/(admin)/admin/my-client-partners/page.tsx's prior scope
 * query (`.eq('ae_user_id', ...)`), now producing fully health-resolved
 * rows instead of the Slice-1 partial columns.
 */
export async function loadBook(service: SupabaseClient, opts: { aeUserId: string }): Promise<ClientPartnerRow[]> {
  const { data, error } = await service
    .from('buyer_orgs')
    .select(ORG_SIGNAL_COLUMNS)
    .eq('ae_user_id', opts.aeUserId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to load book: ${error.message}`)
  const orgs = (data ?? []) as OrgSignalRow[]
  return assembleRows(service, orgs, new Map())
}

/**
 * Whole-book rows (All tab) — every buyer_org, with Assigned-AE identity
 * resolved for the coverage strip / By-AE grouping / book table (D-31.1-04).
 * Callers MUST only invoke this for a leadership caller (T-31.1-info-
 * disclosure) — this module performs no role check itself; the RSC page
 * (plan 04 Task 2) is the sole gate, verified by the Task 3 hide-not-filter
 * test.
 */
export async function loadWholeBookWithCoverage(service: SupabaseClient): Promise<ClientPartnerRow[]> {
  const { data, error } = await service
    .from('buyer_orgs')
    .select(ORG_SIGNAL_COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to load whole book: ${error.message}`)
  const orgs = (data ?? []) as OrgSignalRow[]

  const aeIds = Array.from(new Set(orgs.map(o => o.ae_user_id).filter((v): v is string => !!v)))
  const aeNameById = await fetchStaffNames(service, aeIds)

  return assembleRows(service, orgs, aeNameById)
}
