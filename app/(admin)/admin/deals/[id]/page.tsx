export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { DealDetailPanel, type AdminDealDetail } from '@/components/admin/DealDetailPanel'
import type { LicenseRequestAdmin } from '@/lib/deals/schema'

const ADMIN_DEAL_COLUMNS =
  'id, buyer_org_id, created_by, vault_project_id, usage_types, territories, term_months, exclusivity, budget_cents, need_by, buyer_notes, stage, matched_precleared, gross_fee_cents, contract_document_id, owner_id, admin_notes, commission_pct, artist_net_cents, created_at, updated_at'

export default async function AdminDealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Explicit per-page admin check (T-16-27 / lib/admin/gate.ts doctrine).
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) redirect('/')

  const service = createServiceClient()
  const { data: row } = await service
    .from('license_requests')
    .select(ADMIN_DEAL_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (!row) redirect('/admin/deals')
  const request = row as LicenseRequestAdmin

  const [{ data: org }, { data: project }, { data: submitterAuth }, ownerName] = await Promise.all([
    service.from('buyer_orgs').select('name').eq('id', request.buyer_org_id).maybeSingle(),
    service
      .from('vault_projects')
      .select('id, title, vault_readiness_score, tracks (id, title)')
      .eq('id', request.vault_project_id)
      .maybeSingle(),
    service.auth.admin.getUserById(request.created_by),
    (async () => {
      if (!request.owner_id) return null
      try {
        const { data } = await service.auth.admin.getUserById(request.owner_id)
        return (data?.user?.user_metadata as { display_name?: string } | undefined)?.display_name ?? null
      } catch {
        return null
      }
    })(),
  ])

  const submitterName =
    (submitterAuth?.user?.user_metadata as { display_name?: string } | undefined)?.display_name ?? null
  const submitterEmail = submitterAuth?.user?.email ?? null

  const detail: AdminDealDetail = {
    request,
    buyerOrgName: org?.name ?? 'Unknown company',
    submitterName,
    submitterEmail,
    project: project
      ? {
          id: project.id,
          title: project.title,
          readinessScore: project.vault_readiness_score,
          tracks: (project.tracks ?? []) as { id: string; title: string | null }[],
        }
      : null,
    ownerName,
  }

  return (
    <div className="flex-1 px-9 py-[30px]">
      <Link href="/admin/deals" className="text-xs font-semibold text-white/50 hover:text-white">
        ← Back to Deals
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-white">Deal negotiation</h1>
      <div className="mt-6 max-w-3xl">
        {/* Keyed on updated_at so a successful PATCH + router.refresh()
            remounts the panel with fresh server values instead of stale
            local input state from before the save. */}
        <DealDetailPanel key={request.updated_at} detail={detail} currentAdminId={user.id} />
      </div>
    </div>
  )
}
