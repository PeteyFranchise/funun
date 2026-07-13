export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { TipsAdmin } from '@/components/admin/TipsAdmin'

export default async function AdminTipsPage() {
  // T-05-02: explicit per-page admin check — layout redirect alone is not
  // relied upon as the authority decision (see lib/admin/gate.ts comment).
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) redirect('/')

  const service = createServiceClient()
  const { data: items } = await service
    .from('launchpad_checklist_items')
    .select('key, label, tip_draft, tip_body, tip_approved, author, tip_drafted_at')
    .not('tip_draft', 'is', null)
    .order('tip_drafted_at')

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-white">Tips</h1>
      <TipsAdmin initialDrafts={items ?? []} />
    </div>
  )
}
