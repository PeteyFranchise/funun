export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { DealsQueue, type AdminDealRow } from '@/components/admin/DealsQueue'
import type { LicenseRequestAdmin } from '@/lib/deals/schema'

// Every internal column — mirrors GET /api/admin/deals's column list
// exactly (both live behind the same verifyAdmin/service-role boundary;
// this page runs its own query rather than calling its own API route, the
// established admin-page precedent — see app/(admin)/admin/buyer-orgs/
// page.tsx and app/(admin)/admin/verification/page.tsx).
const ADMIN_DEAL_COLUMNS =
  'id, buyer_org_id, created_by, vault_project_id, usage_types, territories, term_months, exclusivity, budget_cents, need_by, buyer_notes, stage, matched_precleared, gross_fee_cents, contract_document_id, owner_id, admin_notes, commission_pct, artist_net_cents, created_at, updated_at'

export default async function AdminDealsPage() {
  // Explicit per-page admin check — the layout redirect alone is not relied
  // upon as the authority decision (T-16-27 / lib/admin/gate.ts doctrine).
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) redirect('/')

  const service = createServiceClient()
  const { data } = await service
    .from('license_requests')
    .select(ADMIN_DEAL_COLUMNS)
    .order('created_at', { ascending: true })

  const requests = (data ?? []) as LicenseRequestAdmin[]

  const orgIds = Array.from(new Set(requests.map(r => r.buyer_org_id)))
  const projectIds = Array.from(new Set(requests.map(r => r.vault_project_id)))
  const userIds = Array.from(
    new Set(requests.flatMap(r => [r.created_by, r.owner_id].filter((v): v is string => !!v)))
  )

  const [{ data: orgRows }, { data: projectRows }] = await Promise.all([
    orgIds.length > 0
      ? service.from('buyer_orgs').select('id, name').in('id', orgIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    projectIds.length > 0
      ? service.from('vault_projects').select('id, title, vault_readiness_score').in('id', projectIds)
      : Promise.resolve({ data: [] as { id: string; title: string; vault_readiness_score: number }[] }),
  ])

  const orgNameById = new Map((orgRows ?? []).map(o => [o.id, o.name]))
  const projectById = new Map(
    (projectRows ?? []).map(p => [p.id, { title: p.title, readiness: p.vault_readiness_score }])
  )

  const userNameById = new Map<string, string | null>()
  await Promise.all(
    userIds.map(async id => {
      try {
        const { data: authUser } = await service.auth.admin.getUserById(id)
        const name =
          (authUser?.user?.user_metadata as { display_name?: string } | undefined)?.display_name ?? null
        userNameById.set(id, name)
      } catch {
        userNameById.set(id, null)
      }
    })
  )

  const rows: AdminDealRow[] = requests.map(r => ({
    request: r,
    buyerOrgName: orgNameById.get(r.buyer_org_id) ?? 'Unknown company',
    projectTitle: projectById.get(r.vault_project_id)?.title ?? 'Unknown project',
    projectReadinessScore: projectById.get(r.vault_project_id)?.readiness ?? null,
    submitterName: userNameById.get(r.created_by) ?? null,
    ownerName: r.owner_id ? (userNameById.get(r.owner_id) ?? null) : null,
  }))

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-white">Deals</h1>
      <p className="mt-2 max-w-2xl text-sm text-white/55">
        Every inbound license request, buyer-submitted or admin-created — qualify, assign, quote,
        and advance each through the D-16a pipeline (D-06). Defaults to the requests that still
        need negotiation, oldest first (D-15a).
      </p>
      <div className="mt-6">
        <DealsQueue initialRows={rows} />
      </div>
    </div>
  )
}
