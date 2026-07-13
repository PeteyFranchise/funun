import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { loadConversation, findThread, isConnected } from '@/lib/social/dm'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// GET /api/dm/messages?with=<userId>  → the 1:1 conversation, oldest-first
//
// Also returns isConnection (Plan 05) so the Composer can decide its
// placeholder/budget-hint state for BOTH an existing thread and a brand-new
// (?with=, no thread yet) conversation without a dedicated connection-check
// endpoint, and otherLastSeenAt (Plan 05) so ConversationView/DockedWidget
// can render the D-21 offline presence bucket for the open conversation.
export async function GET(request: Request) {
  if (DEMO) return NextResponse.json({ data: [], isConnection: true, otherLastSeenAt: null })

  const otherId = new URL(request.url).searchParams.get('with')
  if (!otherId) return NextResponse.json({ error: 'Missing ?with' }, { status: 400 })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [messages, threadId, connected, otherProfileRes] = await Promise.all([
    loadConversation(supabase, user.id, otherId),
    findThread(supabase, user.id, otherId),
    isConnected(supabase, user.id, otherId),
    // Explicit column list — never select('*') on artist_profiles
    // (migration 040 column lockdown returns 42501 otherwise).
    supabase.from('artist_profiles').select('last_seen_at').eq('id', otherId).maybeSingle(),
  ])
  const otherLastSeenAt = (otherProfileRes.data as { last_seen_at?: string | null } | null)?.last_seen_at ?? null

  return NextResponse.json({ data: messages, threadId, isConnection: connected, otherLastSeenAt })
}
