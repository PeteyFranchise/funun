import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import {
  computeGtmMetrics,
  computeArtistReadinessPassRate,
  mapRawDealRow,
  type GtmRawDealRow,
} from '@/lib/deals/metrics'

// ─── GET /api/admin/deals/metrics (D-10 GTM beta metrics) ─────────────────
// Admin-only aggregate read (T-16-46): every D-10 gate metric computed
// from real license_requests rows via the service role. Never consumed by
// a buyer or artist surface — these aggregates span every org and include
// commission economics (gross fee), so verifyAdmin() gates the route
// exactly like every other /api/admin/* handler (lib/admin/gate.ts).
export async function GET() {
  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()

  const { data: dealRows, error: dealError } = await service
    .from('license_requests')
    .select('stage, created_at, updated_at, gross_fee_cents, buyer_org_id, admin_notes, vault_project_id')

  if (dealError) return NextResponse.json({ error: dealError.message }, { status: 500 })

  const rows = (dealRows ?? []) as (GtmRawDealRow & { vault_project_id: string })[]
  const metrics = computeGtmMetrics(rows.map(mapRawDealRow))

  // Artist readiness pass rate (GTM-06) reads over the DISTINCT projects
  // referenced by any request — a project requested five times counts
  // once, matching "share of requested projects" in the behavior block.
  const projectIds = Array.from(new Set(rows.map(r => r.vault_project_id)))
  const { data: projectRows, error: projectError } =
    projectIds.length > 0
      ? await service.from('vault_projects').select('is_public, vault_readiness_score').in('id', projectIds)
      : { data: [] as { is_public: boolean | null; vault_readiness_score: number | null }[], error: null }

  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 })

  const readiness = computeArtistReadinessPassRate(
    (projectRows ?? []).map(p => ({ isPublic: p.is_public, readinessScore: p.vault_readiness_score }))
  )

  return NextResponse.json({ data: { metrics, readiness } })
}
