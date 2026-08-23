import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/lib/admin/staff-role'
import { STAFF_HOME, BUYER_HOME } from '@/lib/auth/postSignInPath'

export const dynamic = 'force-dynamic'

// Root entry — route people into the app BY ROLE. Middleware still guards auth
// (an unauthenticated visitor hitting /dashboard is bounced to /signin). The
// root used to send EVERYONE to the artist /dashboard, which dropped Funūn
// staff and buyers on the wrong side of the app; send them to their own homes
// instead (STAFF_HOME / BUYER_HOME — the same destinations postSignInPath
// resolves after sign-in), and leave artists on /dashboard unchanged.
export default async function RootPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    if (getStaffRole(user)) redirect(STAFF_HOME)
    if ((user.app_metadata as { role?: string } | undefined)?.role === 'buyer') redirect(BUYER_HOME)
  }
  redirect('/dashboard')
}
