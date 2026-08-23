import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/lib/admin/staff-role'
import { STAFF_HOME, BUYER_HOME } from '@/lib/auth/postSignInPath'

export const dynamic = 'force-dynamic'

// Root entry — route people into the app BY ROLE.
//
// Logged-out visitors go straight to /signin. We must NOT send them to
// /dashboard first: middleware would bounce that to /signin?next=/dashboard,
// and postSignInPath honors an explicit ?next= over role routing — so a staff
// member or buyer would sign in and still land on the artist dashboard. A clean
// /signin (no ?next=) lets postSignInPath decide the destination by role.
//
// Logged-in staff/buyers go to their own homes (STAFF_HOME / BUYER_HOME — the
// same destinations postSignInPath resolves); artists stay on /dashboard.
export default async function RootPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  if (getStaffRole(user)) redirect(STAFF_HOME)
  if ((user.app_metadata as { role?: string } | undefined)?.role === 'buyer') redirect(BUYER_HOME)
  redirect('/dashboard')
}
