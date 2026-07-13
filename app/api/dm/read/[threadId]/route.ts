import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// POST /api/dm/read/[threadId]  → upsert the caller's own read marker (D-06)
// Best-effort: the upsert result is never surfaced as a failure to the UI —
// auto-read must not block opening a conversation.
export async function POST(_request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  if (DEMO) return NextResponse.json({ ok: true })

  const { threadId } = await params

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Session client — dm_thread_reads RLS scopes INSERT/UPDATE to the
  // caller's own (thread_id, user_id) row (migration 036).
  await supabase.from('dm_thread_reads').upsert(
    { thread_id: threadId, user_id: user.id, last_read_at: new Date().toISOString() },
    { onConflict: 'thread_id,user_id' }
  )

  return NextResponse.json({ ok: true })
}
