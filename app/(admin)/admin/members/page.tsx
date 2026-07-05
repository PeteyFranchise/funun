export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { MembersAdmin } from '@/components/admin/MembersAdmin'
import type { IndustryMember } from '@/components/admin/MembersAdmin'

export default async function AdminMembersPage() {
  // Explicit per-page admin check — layout redirect alone is not relied upon
  // as the authority decision (project convention; see lib/admin/gate.ts).
  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) redirect('/')

  const service = createServiceClient()
  const { data: profiles } = await service
    .from('artist_profiles')
    .select('id, artist_name, member_type, industry_roles, roles, created_at')
    .eq('member_type', 'industry')
    .order('created_at', { ascending: false })

  // artist_profiles has no email column (it lives on auth.users) — attach it
  // per-row via the admin API so the list can render "{email} · Joined {date}"
  // per the 08-UI-SPEC list-item contract.
  const members: IndustryMember[] = await Promise.all(
    (profiles ?? []).map(async row => {
      const { data: userData } = await service.auth.admin.getUserById(row.id)
      return { ...row, email: userData?.user?.email ?? '' } as IndustryMember
    })
  )

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-white">Industry Members</h1>
      <MembersAdmin initialMembers={members} />
    </div>
  )
}
