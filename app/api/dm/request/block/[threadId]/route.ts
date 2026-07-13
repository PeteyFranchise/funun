import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// POST /api/dm/request/block/[threadId]  → recipient blocks the requester (D-12)
// `no_block()` (already live, migrations 035/038) makes the block
// immediately effective across follows/messages/requests.
export async function POST(_request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  if (DEMO) return NextResponse.json({ ok: true })

  const { threadId } = await params

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resolve the other participant from the pending thread. Session client —
  // dmt_select_participant RLS already scopes this to the caller's own threads.
  const { data: threadRow } = await supabase
    .from('dm_threads')
    .select('id, requester_id, a_id, b_id')
    .eq('id', threadId)
    .eq('status', 'pending')
    .maybeSingle()
  if (!threadRow) return NextResponse.json({ error: 'Request not found or not permitted' }, { status: 404 })

  const row = threadRow as { id: string; requester_id: string | null; a_id: string; b_id: string }
  const otherId = row.a_id === user.id ? row.b_id : row.a_id

  // Recipient guard: the requester must never be able to block themselves
  // out of their own outbound request via this route.
  if (row.requester_id === user.id) {
    return NextResponse.json({ error: 'Cannot block on your own request' }, { status: 403 })
  }

  // SESSION client — blocks_insert_own RLS requires blocker_id = auth.uid(),
  // so this must be the caller's own session, never the service client.
  const { error: blockError } = await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: otherId })
  if (blockError && blockError.code !== '23505') {
    return NextResponse.json({ error: blockError.message }, { status: 500 })
  }

  // Move the thread out of the Requests section either way (idempotent on
  // a duplicate block: the thread should still leave 'pending').
  await supabase.from('dm_threads').update({ status: 'declined' }).eq('id', threadId).eq('status', 'pending')

  return NextResponse.json({ ok: true })
}
