export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { requireStaffPage } from '@/lib/admin/gate'
import { CONFIG_ROW_ID } from '@/lib/client-partners/health-rules-config'
import { HealthRulesForm, type HealthRulesConfigRow } from '@/components/admin/HealthRulesForm'
import type { HealthSignals } from '@/lib/client-partners/health'

// ─── /admin/health-rules — leadership-only settings screen (D-31.1-03) ────
// requireStaffPage(['leadership']) is the fail-closed per-page authority
// check — no non-leadership caller reaches health_rules_config or the
// sample signal queries below (T-31.1-config-authz), matching every
// route/page in this plan. Pitfall 1 (commit 80443bb): every prop passed to
// HealthRulesForm ('use client') is data or a string action path, never a
// function — mirrors ClientPartnersRoom's RSC-boundary convention.

const CONFIG_COLUMNS =
  'id, good_within_days, warning_after_days, at_risk_after_days, cold_after_days, keep_warm_open_brief, keep_warm_open_deal, keep_warm_recent_selects, recent_selects_days, keep_warm_recent_contact, recent_contact_days, prospect_image_url, updated_at'

// A "lightweight sample" (not the whole book, D-06's live-preview scope) —
// enough clients that the state-split preview reads as representative
// without duplicating lib/client-partners/signals.ts's whole-book batched
// loader (which returns already-health-computed ClientPartnerRow[], not the
// raw HealthSignals this screen needs to recompute against a DRAFT config
// as the leader drags a threshold, before saving).
const SAMPLE_LIMIT = 30
const TERMINAL_DEAL_STAGES = new Set(['closed_won', 'closed_lost'])
const BRIEF_TERMINAL_STATUSES = new Set(['licensed', 'closed'])

type ServiceClient = ReturnType<typeof createServiceClient>

async function loadSampleSignals(service: ServiceClient): Promise<HealthSignals[]> {
  const { data: orgs } = await service
    .from('buyer_orgs')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(SAMPLE_LIMIT)
  const orgIds = ((orgs ?? []) as { id: string }[]).map(o => o.id)
  if (orgIds.length === 0) return []

  const [dealsRes, briefsRes, selectsRes, logRes] = await Promise.all([
    service.from('license_requests').select('buyer_org_id, stage, executed_at').in('buyer_org_id', orgIds),
    service.from('buyer_briefs').select('buyer_org_id, status').in('buyer_org_id', orgIds),
    service.from('selects').select('buyer_org_id, sent_at').in('buyer_org_id', orgIds),
    service.from('client_relationship_log').select('buyer_org_id, created_at').in('buyer_org_id', orgIds),
  ])

  const lastExecByOrg = new Map<string, string | null>()
  const openDealByOrg = new Set<string>()
  for (const row of (dealsRes.data ?? []) as { buyer_org_id: string; stage: string; executed_at: string | null }[]) {
    if (row.executed_at) {
      const current = lastExecByOrg.get(row.buyer_org_id) ?? null
      if (!current || new Date(row.executed_at) > new Date(current)) {
        lastExecByOrg.set(row.buyer_org_id, row.executed_at)
      }
    } else if (!TERMINAL_DEAL_STAGES.has(row.stage)) {
      openDealByOrg.add(row.buyer_org_id)
    }
  }

  const openBriefByOrg = new Set<string>()
  for (const row of (briefsRes.data ?? []) as { buyer_org_id: string; status: string }[]) {
    if (!BRIEF_TERMINAL_STATUSES.has(row.status)) openBriefByOrg.add(row.buyer_org_id)
  }

  const lastSelectsByOrg = new Map<string, string | null>()
  for (const row of (selectsRes.data ?? []) as { buyer_org_id: string; sent_at: string | null }[]) {
    if (!row.sent_at) continue
    const current = lastSelectsByOrg.get(row.buyer_org_id) ?? null
    if (!current || new Date(row.sent_at) > new Date(current)) lastSelectsByOrg.set(row.buyer_org_id, row.sent_at)
  }

  const lastContactByOrg = new Map<string, string | null>()
  for (const row of (logRes.data ?? []) as { buyer_org_id: string; created_at: string }[]) {
    const current = lastContactByOrg.get(row.buyer_org_id) ?? null
    if (!current || new Date(row.created_at) > new Date(current)) lastContactByOrg.set(row.buyer_org_id, row.created_at)
  }

  return orgIds.map(id => ({
    lastExecutedLicenseAt: lastExecByOrg.get(id) ?? null,
    hasOpenBrief: openBriefByOrg.has(id),
    hasOpenDeal: openDealByOrg.has(id),
    lastSelectsSentAt: lastSelectsByOrg.get(id) ?? null,
    lastContactAt: lastContactByOrg.get(id) ?? null,
  }))
}

export default async function HealthRulesPage() {
  // Fail-closed leadership-only gate — redirect()s internally, never
  // returns for a non-leadership/no-role/unauthenticated caller.
  await requireStaffPage(['leadership'])

  const service = createServiceClient()

  const [{ data: configRow }, sampleSignals] = await Promise.all([
    service.from('health_rules_config').select(CONFIG_COLUMNS).eq('id', CONFIG_ROW_ID).maybeSingle(),
    loadSampleSignals(service),
  ])

  const config = (configRow ?? null) as HealthRulesConfigRow | null

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-[color:var(--ink)]">Health rules</h1>
      {config ? (
        <HealthRulesForm
          config={config}
          sampleSignals={sampleSignals}
          configActionPath="/api/admin/health-rules"
          prospectImageActionPath="/api/admin/health-rules/prospect-image"
        />
      ) : (
        <p className="mt-4 text-[13px] text-[color:var(--ink-3)]">
          Health rules config not found. Run migration 128 before visiting this screen.
        </p>
      )}
    </div>
  )
}
