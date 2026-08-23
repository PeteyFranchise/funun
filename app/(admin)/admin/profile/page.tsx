export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { getStaffRoles, OPERATIONAL_STAFF_ROLES } from '@/lib/admin/gate'
import { isAvatarSelfEditEnabled } from '@/lib/staff/avatarSelfEdit'
import { MyProfile } from '@/components/admin/MyProfile'
import type { StaffRow } from '@/components/admin/StaffAdmin'

const STAFF_COLUMNS =
  'id, user_id, staff_role, staff_roles, display_name, first_name, last_name, title, phone, avatar_url, created_at'

// ─── /admin/profile — a staff member's own profile ──────────────────────────
// Open to any staff member (self-service). Slice 2 of avatar editing: view your
// details + change your own photo. Photo edit is allowed for Leadership/TMS
// always, and for other staff while STAFF_AVATAR_SELF_EDIT is enabled — the
// endpoint enforces the same rule.
export default async function MyProfilePage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  const roles = getStaffRoles(user)
  if (roles.length === 0) redirect('/') // not staff

  const service = createServiceClient()
  const { data } = await service
    .from('funun_staff')
    .select(STAFF_COLUMNS)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!data) redirect('/') // no staff display row (shouldn't happen for staff)

  const me: StaffRow = {
    ...(data as StaffRow),
    email: user.email ?? '',
    status: 'active',
  }
  const isManager = roles.some(r => r === 'leadership' || r === 'tms')
  // Pure-'it' staff can't self-edit (the endpoint's requireStaff() excludes it),
  // so don't offer a button that would 403.
  const isOperational = roles.some(r => (OPERATIONAL_STAFF_ROLES as readonly string[]).includes(r))
  const canEditPhoto = isManager || (isOperational && isAvatarSelfEditEnabled())

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="mb-6 text-2xl font-bold text-[color:var(--ink)]">My Profile</h1>
      <MyProfile me={me} canEditPhoto={canEditPhoto} />
    </div>
  )
}
