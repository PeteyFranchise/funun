import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { hasUnread } from '@/lib/social/dm'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

type ThreadRow = {
  id: string
  a_id: string
  b_id: string
  status: string
  requester_id: string | null
  created_at: string
}

type ThreadView = {
  id: string
  status: string
  requesterId: string | null
  other: { id: string; name: string; avatarUrl: string | null; handle: string }
  lastMessage: { body: string; createdAt: string } | null
  hasUnread: boolean
}

// Build the full thread-list view for a caller: participant threads +
// other-party profile snapshot + last-message preview + fresh unread state
// (computed via hasUnread() timestamp comparison — never a cached counter,
// per Wave 4 research + D-07).
async function buildThreadViews(
  supabase: Awaited<ReturnType<typeof createApiClient>>,
  userId: string
): Promise<ThreadView[]> {
  const { data: threadsData } = await supabase
    .from('dm_threads')
    .select('id, a_id, b_id, status, requester_id, created_at')
  const threads = (threadsData ?? []) as ThreadRow[]
  if (threads.length === 0) return []

  const threadIds = threads.map(t => t.id)
  const otherIds = Array.from(
    new Set(threads.map(t => (t.a_id === userId ? t.b_id : t.a_id)))
  )

  const [messagesRes, readsRes, profilesRes] = await Promise.all([
    supabase
      .from('dm_messages')
      .select('thread_id, body, created_at')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('dm_thread_reads')
      .select('thread_id, last_read_at')
      .eq('user_id', userId)
      .in('thread_id', threadIds),
    // Explicit column list — never select('*') on artist_profiles
    // (migration 040 column lockdown returns 42501 otherwise).
    supabase.from('artist_profiles').select('id, artist_name, avatar_url, handle').in('id', otherIds),
  ])

  const latestByThread = new Map<string, { body: string; createdAt: string }>()
  for (const m of (messagesRes.data ?? []) as { thread_id: string; body: string; created_at: string }[]) {
    // Ordered desc — the first row seen per thread_id is the latest.
    if (!latestByThread.has(m.thread_id)) {
      latestByThread.set(m.thread_id, { body: m.body, createdAt: m.created_at })
    }
  }

  const readByThread = new Map<string, string>()
  for (const r of (readsRes.data ?? []) as { thread_id: string; last_read_at: string }[]) {
    readByThread.set(r.thread_id, r.last_read_at)
  }

  const profileById = new Map<
    string,
    { artist_name: string | null; avatar_url: string | null; handle: string | null }
  >()
  for (const p of (profilesRes.data ?? []) as {
    id: string
    artist_name: string | null
    avatar_url: string | null
    handle: string | null
  }[]) {
    profileById.set(p.id, p)
  }

  const views: ThreadView[] = threads.map(t => {
    const otherId = t.a_id === userId ? t.b_id : t.a_id
    const profile = profileById.get(otherId)
    const lastMessage = latestByThread.get(t.id) ?? null
    const lastReadAt = readByThread.get(t.id) ?? null
    return {
      id: t.id,
      status: t.status,
      requesterId: t.requester_id,
      other: {
        id: otherId,
        name: profile?.artist_name || 'Member',
        avatarUrl: profile?.avatar_url ?? null,
        handle: profile?.handle ?? '',
      },
      lastMessage,
      hasUnread: hasUnread(lastReadAt, lastMessage?.createdAt ?? null),
    }
  })

  // Order threads by latest message time desc; threads with no message yet
  // (shouldn't normally happen — a thread is only created alongside its
  // first message) fall back to created_at and sort last.
  views.sort((a, b) => {
    const aTime = new Date(a.lastMessage?.createdAt ?? 0).getTime()
    const bTime = new Date(b.lastMessage?.createdAt ?? 0).getTime()
    return bTime - aTime
  })

  return views
}

// GET /api/dm/threads[?unread=true]  → thread list + unread state
export async function GET(request: Request) {
  if (DEMO) return NextResponse.json({ data: [], unreadCount: 0 })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const wantsUnreadOnly = new URL(request.url).searchParams.get('unread') === 'true'
  const views = await buildThreadViews(supabase, user.id)

  if (wantsUnreadOnly) {
    // Unread count over DIRECT threads only — pending requests are not
    // "unread messages" for the badge (D-07 note).
    const unreadCount = views.filter(v => v.status === 'direct' && v.hasUnread).length
    return NextResponse.json({ unreadCount })
  }

  return NextResponse.json({ data: views })
}
