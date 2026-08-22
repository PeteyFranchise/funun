export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { requireStaffPage } from '@/lib/admin/gate'
import { StaffAdmin } from '@/components/admin/StaffAdmin'
import type { StaffRow } from '@/components/admin/StaffAdmin'

const STAFF_COLUMNS =
  'id, user_id, staff_role, staff_roles, display_name, first_name, last_name, title, phone, avatar_url, created_at'

export default async function AdminTeamMembersPage() {
  // Team Members management is leadership + TMS (people ops) — the redesign's
  // MANAGE_ROLES, matching the backing /api/admin/staff routes exactly.
  // requireStaffPage redirects a signed-out visitor to /signin and any other
  // staff role to / (Pitfall 2/3): the page is a self-guard, never the sole
  // authority — every /api/admin/staff handler re-checks requireStaff.
  const { user } = await requireStaffPage(['leadership', 'tms'])

  const service = createServiceClient()
  const { data: staff } = await service
    .from('funun_staff')
    .select(STAFF_COLUMNS)
    .order('created_at', { ascending: false })

  // funun_staff has no email column (it lives on auth.users) — attach it per
  // row via the admin API, and derive invite status: a member who has never
  // signed in is still 'pending'. Mirrors app/(admin)/admin/members/page.tsx.
  const staffRows: StaffRow[] = await Promise.all(
    (staff ?? []).map(async row => {
      const { data: userData } = await service.auth.admin.getUserById(row.user_id)
      return {
        ...row,
        email: userData?.user?.email ?? '',
        status: userData?.user?.last_sign_in_at ? 'active' : 'pending',
      } as StaffRow
    })
  )

  return (
    <div className="flex-1 px-9 py-[30px]">
      <StaffAdmin initialStaff={staffRows} currentUserId={user.id} />
    </div>
  )
}
