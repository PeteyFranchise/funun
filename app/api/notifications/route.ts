import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { buildMarkAllReadFilter } from '@/lib/social/notifications'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
const PAGE_SIZE = 20

// GET /api/notifications?before=<iso>  → { data: [...], unreadCount }
//
// Cursor pagination via `before=<created_at>` (race-safe on a table that
// receives concurrent inserts, RESEARCH Open Question #2 — never offset).
// Unread count is ALWAYS a fresh head-count query (STATE.md convention,
// Anti-Patterns guard) — never derived from a stored counter.
export async function GET(request: Request) {
  if (DEMO) return NextResponse.json({ data: [], unreadCount: 0 })

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const before = new URL(request.url).searchParams.get('before')

  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)
  if (before) query = query.lt('created_at', before)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fresh unread head-count — recomputed on every call (never cached).
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('read', false)

  return NextResponse.json({ data: data ?? [], unreadCount: count ?? 0 })
}

// PATCH /api/notifications  → mark all the caller's unread rows read.
//
// Scoped to `user_id = caller AND read = false` (buildMarkAllReadFilter).
// Session client; RLS (`USING auth.uid() = user_id`) is the backstop, the
// explicit user_id filter is the primary scoping.
export async function PATCH() {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const filter = buildMarkAllReadFilter(user.id)
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', filter.user_id)
    .eq('read', filter.read)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: { ok: true } })
}
