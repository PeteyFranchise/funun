export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/lib/admin/gate'
import { StaffAdmin } from '@/components/admin/StaffAdmin'
import type { StaffRow } from '@/components/admin/StaffAdmin'

const STAFF_COLUMNS = 'id, user_id, staff_role, display_name, title, phone, avatar_url, created_at'

export default async function AdminTeamMembersPage() {
  // Explicit per-page leadership check — layout redirect alone is not relied
  // upon as the authority decision (project convention; see lib/admin/gate.ts).
  // This page is leadership-only even though the layout now admits any staff
  // role (Pitfall 3): an AE/BD navigating here is bounced, not shown a broken
  // empty page.
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  if (getStaffRole(user) !== 'leadership') redirect('/')

  const service = createServiceClient()
  const { data: staff } = await service
    .from('funun_staff')
    .select(STAFF_COLUMNS)
    .order('created_at', { ascending: false })

  // funun_staff has no email column (it lives on auth.users) — attach it
  // per-row via the admin API, mirroring app/(admin)/admin/members/page.tsx.
  const staffRows: StaffRow[] = await Promise.all(
    (staff ?? []).map(async row => {
      const { data: userData } = await service.auth.admin.getUserById(row.user_id)
      return { ...row, email: userData?.user?.email ?? '' } as StaffRow
    })
  )

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-white">Team Members</h1>
      <StaffAdmin initialStaff={staffRows} />
    </div>
  )
}
