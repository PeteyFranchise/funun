export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/lib/admin/gate'
import { MyCompanies } from '@/components/admin/MyCompanies'
import type { MyCompanyRow } from '@/components/admin/MyCompanies'

const ORG_COLUMNS = 'id, name, is_personal, verified, created_at, ae_user_id'

export default async function AdminMyClientPartnersPage() {
  // Explicit per-page staff check — layout redirect alone is not relied upon
  // as the authority decision (project convention; see lib/admin/gate.ts).
  // Unlike /admin/team-members, this page admits ANY staff role — it's the
  // AE/BD work queue (TEAM-06).
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const role = getStaffRole(user)
  if (!role) redirect('/')

  const service = createServiceClient()
  let query = service
    .from('buyer_orgs')
    .select(ORG_COLUMNS)
    .order('created_at', { ascending: false })
  // Read-side twin of the scoped GET /api/admin/buyer-orgs (Pitfall 4): an
  // AE/BD sees only companies assigned to them; leadership sees all.
  if (role !== 'leadership') {
    query = query.eq('ae_user_id', user.id)
  }
  const { data: orgs } = await query

  const orgRows: MyCompanyRow[] = await Promise.all(
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
      <h1 className="text-2xl font-bold text-white">My Client Partners</h1>
      <MyCompanies initialOrgs={orgRows} />
    </div>
  )
}
