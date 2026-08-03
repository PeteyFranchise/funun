export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { BuyerOrgsAdmin } from '@/components/admin/BuyerOrgsAdmin'
import type { BuyerOrgRow } from '@/components/admin/BuyerOrgsAdmin'

export default async function AdminBuyerOrgsPage() {
  // Explicit per-page admin check — layout redirect alone is not relied upon
  // as the authority decision (project convention; see lib/admin/gate.ts).
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) redirect('/')

  const service = createServiceClient()
  const { data: orgs } = await service
    .from('buyer_orgs')
    .select('id, name, is_personal, verified, created_at')
    .order('created_at', { ascending: false })

  const orgRows: BuyerOrgRow[] = await Promise.all(
    (orgs ?? []).map(async row => {
      const { count } = await service
        .from('buyer_members')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', row.id)
      return { ...row, memberCount: count ?? 0 }
    })
  )

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-white">Buyer Orgs</h1>
      <BuyerOrgsAdmin initialOrgs={orgRows} />
    </div>
  )
}
