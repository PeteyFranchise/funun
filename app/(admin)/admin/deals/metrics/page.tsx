export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getStaffRole } from '@/lib/admin/gate'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import {
  computeGtmMetrics,
  computeArtistReadinessPassRate,
  mapRawDealRow,
  type GtmRawDealRow,
} from '@/lib/deals/metrics'
import { GtmMetricsDashboard } from '@/components/admin/GtmMetricsDashboard'

// ─── /admin/deals/metrics (D-10) ───────────────────────────────────────────
// Server component reading its own query rather than calling its own API
// route — the established admin-page precedent (see app/(admin)/admin/
// deals/page.tsx, app/(admin)/admin/esign-usage/page.tsx).
export default async function AdminGtmMetricsPage() {
  // Explicit per-page admin check — the layout redirect alone is not relied
  // upon as the authority decision (T-16-27 / lib/admin/gate.ts doctrine).
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  if (getStaffRole(user) !== 'leadership') redirect('/')

  const service = createServiceClient()

  const { data: dealRows } = await service
    .from('license_requests')
    .select('stage, created_at, updated_at, gross_fee_cents, buyer_org_id, admin_notes, vault_project_id')

  const rows = (dealRows ?? []) as (GtmRawDealRow & { vault_project_id: string })[]
  const metrics = computeGtmMetrics(rows.map(mapRawDealRow))

  const projectIds = Array.from(new Set(rows.map(r => r.vault_project_id)))
  const { data: projectRows } =
    projectIds.length > 0
      ? await service.from('vault_projects').select('is_public, vault_readiness_score').in('id', projectIds)
      : { data: [] as { is_public: boolean | null; vault_readiness_score: number | null }[] }

  const readiness = computeArtistReadinessPassRate(
    (projectRows ?? []).map(p => ({ isPublic: p.is_public, readinessScore: p.vault_readiness_score }))
  )

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-white">GTM Beta Metrics</h1>
      <p className="mt-2 max-w-2xl text-sm text-white/55">
        Every D-10 gate metric computed from real deal data — the evidence the AE hire and any
        paid acquisition spend are gated behind, not spreadsheet confidence.
      </p>
      <div className="mt-6">
        <GtmMetricsDashboard metrics={metrics} readiness={readiness} />
      </div>
    </div>
  )
}
