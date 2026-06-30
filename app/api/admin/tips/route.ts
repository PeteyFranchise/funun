import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'

// ─── GET /api/admin/tips ────────────────────────────────────────────────
// Returns checklist items that have a pending tip draft awaiting approval.
// T-05-05: tip_draft is admin-only; it becomes visible to artists only after
// approve sets tip_approved=true (Plan 03 artist GET filters on tip_approved).
export async function GET() {
  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('launchpad_checklist_items')
    .select('key, label, tip_draft, tip_body, tip_approved, author, tip_drafted_at')
    .not('tip_draft', 'is', null)
    .order('tip_drafted_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
