export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/lib/admin/gate'
import { TeamDirectory } from '@/components/admin/TeamDirectory'
import type { DirectoryMember } from '@/components/admin/TeamDirectory'

const STAFF_COLUMNS = 'user_id, staff_role, display_name, title, phone, avatar_url'

export default async function AdminDirectoryPage() {
  // Explicit per-page staff check — layout redirect alone is not relied upon
  // as the authority decision (project convention; see lib/admin/gate.ts).
  // Unlike /admin/team-members (leadership-only), this gate admits ANY
  // non-null staff role — the Directory is for every Team Member.
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  if (getStaffRole(user) === null) redirect('/')

  const service = createServiceClient()
  const { data: staff } = await service
    .from('funun_staff')
    .select(STAFF_COLUMNS)
    .order('display_name', { ascending: true })

  // funun_staff has no email column (it lives on auth.users) — attach it
  // per-row via the admin API, mirroring app/(admin)/admin/members/page.tsx.
  const members: DirectoryMember[] = await Promise.all(
    (staff ?? []).map(async row => {
      const { data: userData } = await service.auth.admin.getUserById(row.user_id)
      return { ...row, email: userData?.user?.email ?? '' } as DirectoryMember
    })
  )

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-[color:var(--ink)]">Team Directory</h1>
      <TeamDirectory members={members} />
    </div>
  )
}
