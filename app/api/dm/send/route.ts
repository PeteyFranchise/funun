import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { ensureThread } from '@/lib/social/dm'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// POST /api/dm/send  { toUserId, body }  → send a 1:1 message
export async function POST(request: Request) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const { toUserId, body } = (await request.json().catch(() => ({}))) as {
    toUserId?: string
    body?: string
  }
  const text = (body ?? '').trim()
  if (!toUserId) return NextResponse.json({ error: 'Missing recipient' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'Message is empty' }, { status: 400 })
  if (text.length > 4000) return NextResponse.json({ error: 'Message too long' }, { status: 400 })

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.id === toUserId) return NextResponse.json({ error: 'Cannot message yourself' }, { status: 400 })

  const threadId = await ensureThread(supabase, user.id, toUserId)
  if (!threadId) return NextResponse.json({ error: 'Could not open thread' }, { status: 500 })

  const { data, error } = await supabase
    .from('dm_messages')
    .insert({ thread_id: threadId, sender_id: user.id, body: text })
    .select('id, body, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: { id: data.id, body: data.body, createdAt: data.created_at, mine: true, threadId },
  })
}
