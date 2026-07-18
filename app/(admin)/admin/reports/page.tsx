export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { loadReportsForAdmin } from '@/lib/trust-safety/admin-reports'
import { ReportsAdmin } from '@/components/admin/ReportsAdmin'

export default async function AdminReportsPage() {
  // T-05-02 convention: explicit per-page admin check — the layout redirect
  // alone is not relied upon as the authority decision (see lib/admin/gate.ts).
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) redirect('/')

  const service = createServiceClient()
  const reports = await loadReportsForAdmin(service, {
    status: null,
    reason: null,
    targetType: null,
    since: null,
    until: null,
  })

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-white">Reports</h1>
      <p className="mt-2 max-w-2xl text-sm text-white/55">
        Member reports on profiles, messages, and Green Room posts/comments/reposts/placements.
        Report details are admin-only — reported members never see this queue or its contents.
      </p>
      <ReportsAdmin initialReports={reports} />
    </div>
  )
}
