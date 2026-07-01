export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { ChecklistAdmin } from '@/components/admin/ChecklistAdmin'
import type { ChecklistItem } from '@/types'

// Admin-facing item includes tip_draft and author fields excluded from the
// artist-facing ChecklistItem type. Extend inline to avoid polluting the
// artist type.
type AdminChecklistItem = ChecklistItem & {
  tip_draft: string | null
  author: string | null
}

export default async function AdminChecklistPage() {
  const service = createServiceClient()
  const { data: items } = await service
    .from('launchpad_checklist_items')
    .select('*')
    .order('sort_order')

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-white">Checklist Items</h1>
      <ChecklistAdmin initialItems={(items ?? []) as AdminChecklistItem[]} />
    </div>
  )
}
