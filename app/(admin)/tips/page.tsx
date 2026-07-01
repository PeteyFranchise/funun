export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { TipsAdmin } from '@/components/admin/TipsAdmin'

export default async function AdminTipsPage() {
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
