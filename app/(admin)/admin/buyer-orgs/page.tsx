export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/lib/admin/gate'
import { BuyerOrgsAdmin } from '@/components/admin/BuyerOrgsAdmin'
import type { AePoolOption, BuyerOrgRow } from '@/components/admin/BuyerOrgsAdmin'

export default async function AdminBuyerOrgsPage() {
  // Explicit per-page leadership check — layout redirect alone is not relied
  // upon as the authority decision (project convention; see lib/admin/gate.ts).
  // This page stays leadership-only (unchanged scope) even though the layout
  // now admits any staff role — AE/BD have their own scoped queue at
  // /admin/my-client-partners (25-06). The reassign control (25-09) is
  // leadership-only by the same gate that already restricts this whole page.
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const isLeadership = getStaffRole(user) === 'leadership'
  if (!isLeadership) redirect('/')

  const service = createServiceClient()
  const { data: orgs } = await service
    .from('buyer_orgs')
    .select('id, name, is_personal, verified, created_at, ae_user_id')
    .order('created_at', { ascending: false })

  // AE pool + a name lookup for whoever an org's ae_user_id currently
  // points at (covers a formerly-AE staffer whose role has since changed —
  // the picker's OPTIONS are still 'ae'-only per the plan's must_haves).
  const { data: staffRows } = await service
    .from('funun_staff')
    .select('user_id, display_name, staff_role')
    .order('display_name', { ascending: true })

  const staffNameById = new Map(
    (staffRows ?? []).map(row => [row.user_id as string, row.display_name as string])
  )
  const aePool: AePoolOption[] = (staffRows ?? [])
    .filter(row => row.staff_role === 'ae')
    .map(row => ({ userId: row.user_id as string, displayName: row.display_name as string }))

  const orgRows: BuyerOrgRow[] = await Promise.all(
    (orgs ?? []).map(async row => {
      const { count } = await service
        .from('buyer_members')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', row.id)

      // Primary contact = the org's first org-admin member. Its auth email is
      // surfaced on the card so leadership can identify the company at a glance
      // without expanding the member list.
      const { data: adminMember } = await service
        .from('buyer_members')
        .select('user_id')
        .eq('org_id', row.id)
        .eq('is_org_admin', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      let adminEmail: string | null = null
      if (adminMember?.user_id) {
        const { data: authData } = await service.auth.admin.getUserById(adminMember.user_id as string)
        adminEmail = authData?.user?.email ?? null
      }

      return {
        id: row.id,
        name: row.name,
        is_personal: row.is_personal,
        verified: row.verified,
        created_at: row.created_at,
        memberCount: count ?? 0,
        adminEmail,
        aeUserId: row.ae_user_id ?? null,
        aeName: row.ae_user_id ? staffNameById.get(row.ae_user_id) ?? null : null,
      }
    })
  )

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-white">Buyer Orgs</h1>
      <BuyerOrgsAdmin initialOrgs={orgRows} isLeadership={isLeadership} aePool={aePool} />
    </div>
  )
}
