import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// POST /api/dm/request/decline/[threadId]  → recipient declines a message
// request (D-11: silent — the sender is never notified).
export async function POST(_request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  if (DEMO) return NextResponse.json({ ok: true })

  const { threadId } = await params

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: updated, error } = await supabase
    .from('dm_threads')
    .update({ status: 'declined' })
    .eq('id', threadId)
    .eq('status', 'pending')
    .neq('requester_id', user.id)
    .select('id, requester_id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated) return NextResponse.json({ error: 'Request not found or not permitted' }, { status: 404 })

  const updatedRow = updated as { id: string; requester_id: string | null }

  // Recipient-only guard is enforced atomically above via requester_id != user.id.

  // No notification fired — decline is silent (D-11): the sender is never
  // told, and their side keeps showing the message as sent, never replied to.
  return NextResponse.json({ ok: true })
}
