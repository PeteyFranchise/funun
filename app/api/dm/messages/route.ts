import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { loadConversation, findThread } from '@/lib/social/dm'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// GET /api/dm/messages?with=<userId>  → the 1:1 conversation, oldest-first
export async function GET(request: Request) {
  if (DEMO) return NextResponse.json({ data: [] })

  const otherId = new URL(request.url).searchParams.get('with')
  if (!otherId) return NextResponse.json({ error: 'Missing ?with' }, { status: 400 })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [messages, threadId] = await Promise.all([
    loadConversation(supabase, user.id, otherId),
    findThread(supabase, user.id, otherId),
  ])
  return NextResponse.json({ data: messages, threadId })
}
