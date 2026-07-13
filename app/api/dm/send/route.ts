import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import {
  ensureThread,
  findThread,
  isConnected,
  countRecentRequests,
  countPendingMessagesFrom,
  chooseSendPath,
} from '@/lib/social/dm'
import { buildMessageRequestNotification, buildNewDmNotification } from '@/lib/social/notifications'
import { createNotification } from '@/lib/notifications'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
// A direct-message notification is suppressed when the recipient's read
// marker is fresher than this window (D-discretion, RESEARCH Open Question
// #2) — avoids firing a notification per message in an active conversation.
const NEW_DM_SUPPRESSION_WINDOW_MS = 60_000

// ─── actor snapshot ─────────────────────────────────────────────────────
// Read the caller's own artist_profiles row for the notification actor
// snapshot. Explicit column list — never select('*') on artist_profiles
// (migration 040 column lockdown returns 42501 for any other column set).
async function loadActor(
  supabase: Awaited<ReturnType<typeof createApiClient>>,
  userId: string
): Promise<{ name: string; avatarUrl: string | null; handle: string }> {
  const { data } = await supabase
    .from('artist_profiles')
    .select('artist_name, avatar_url, handle')
    .eq('id', userId)
    .maybeSingle()
  const row = (data ?? {}) as {
    artist_name?: string | null
    avatar_url?: string | null
    handle?: string | null
  }
  return {
    name: row.artist_name || 'Member',
    avatarUrl: row.avatar_url ?? null,
    handle: row.handle ?? '',
  }
}

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

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.id === toUserId) return NextResponse.json({ error: 'Cannot message yourself' }, { status: 400 })

  // ─── Connection gate (CONNECT-05, D-13) ───────────────────────────────
  // The single trust boundary for "who may message whom" — checked
  // server-side before any thread/message write, never trusted from the client.
  const connected = await isConnected(supabase, user.id, toUserId)

  if (connected) {
    const threadId = await ensureThread(supabase, user.id, toUserId)
    if (!threadId) return NextResponse.json({ error: 'Could not open thread' }, { status: 500 })

    const service = createServiceClient()

    // Grandfather edge (belt-and-suspenders): an earlier cold request that
    // has since become a mutual connection converts its thread to 'direct'.
    await service.from('dm_threads').update({ status: 'direct' }).eq('id', threadId).eq('status', 'pending')

    const { data, error } = await supabase
      .from('dm_messages')
      .insert({ thread_id: threadId, sender_id: user.id, body: text })
      .select('id, body, created_at')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // new_dm notification — suppressed when the recipient's read marker for
    // this thread is fresher than the 60s window, so an active
    // back-and-forth does not fire a notification per message. Best-effort
    // — the message itself is already persisted either way.
    try {
      const { data: readRow } = await service
        .from('dm_thread_reads')
        .select('last_read_at')
        .eq('thread_id', threadId)
        .eq('user_id', toUserId)
        .maybeSingle()
      const lastReadAt = (readRow as { last_read_at?: string } | null)?.last_read_at ?? null
      const isStale = !lastReadAt || Date.now() - new Date(lastReadAt).getTime() > NEW_DM_SUPPRESSION_WINDOW_MS
      if (isStale) {
        const actor = await loadActor(supabase, user.id)
        await createNotification(
          service,
          buildNewDmNotification({
            recipientId: toUserId,
            actorId: user.id,
            actorName: actor.name,
            actorAvatarUrl: actor.avatarUrl,
            threadId,
          })
        )
      }
    } catch {
      // Non-fatal — the message itself was persisted.
    }

    return NextResponse.json({
      data: { id: data.id, body: data.body, createdAt: data.created_at, mine: true, threadId },
    })
  }

  // ─── Not connected — message-request flow (D-09) ──────────────────────
  // The first message IS the request; no separate "request to message" step.
  const existingThreadId = await findThread(supabase, user.id, toUserId)
  let existingPendingByMe = false
  let pendingMsgCount = 0

  if (existingThreadId) {
    const { data: threadRow } = await supabase
      .from('dm_threads')
      .select('status, requester_id')
      .eq('id', existingThreadId)
      .maybeSingle()
    const row = (threadRow ?? null) as { status: string; requester_id: string | null } | null
    existingPendingByMe = !!row && row.status === 'pending' && row.requester_id === user.id
    if (existingPendingByMe) {
      pendingMsgCount = await countPendingMessagesFrom(supabase, existingThreadId, user.id)
    }
  }

  // The rate limit only applies to NEW cold outreach — stacking onto an
  // already-pending request the caller started spends no extra budget (D-18).
  let recentRequestCount = 0
  let verified = false
  if (!existingPendingByMe) {
    const { data: profileRow } = await supabase
      .from('artist_profiles')
      .select('verified')
      .eq('id', user.id)
      .maybeSingle()
    verified = !!(profileRow as { verified?: boolean } | null)?.verified
    recentRequestCount = await countRecentRequests(supabase, user.id)
  }

  const decision = chooseSendPath({
    connected: false,
    existingPendingByMe,
    pendingMsgCount,
    recentRequestCount,
    verified,
  })

  if (decision.kind === 'reject-stack') {
    return NextResponse.json({ error: 'Pending request message limit reached' }, { status: 400 })
  }
  if (decision.kind === 'reject-rate') {
    return NextResponse.json({ error: 'Rate limit reached', remaining: 0 }, { status: 429 })
  }

  const isNewRequest = decision.kind === 'request'
  let threadId: string | null
  if (decision.kind === 'stack') {
    threadId = existingThreadId
  } else {
    threadId = await ensureThread(supabase, user.id, toUserId)
    if (!threadId) return NextResponse.json({ error: 'Could not open thread' }, { status: 500 })

    // Stamp the freshly-created/never-used thread as a pending request. The
    // `.eq('status', 'direct')` guard means this never clobbers a real
    // direct thread — only a brand-new row (default status) qualifies.
    const service = createServiceClient()
    await service
      .from('dm_threads')
      .update({ requester_id: user.id, status: 'pending' })
      .eq('id', threadId)
      .eq('status', 'direct')
  }
  if (!threadId) return NextResponse.json({ error: 'Could not open thread' }, { status: 500 })

  const { data, error } = await supabase
    .from('dm_messages')
    .insert({ thread_id: threadId, sender_id: user.id, body: text })
    .select('id, body, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // message_request notification fires once per cold thread only — never
  // re-fired for stacked messages on an already-pending request.
  if (isNewRequest) {
    try {
      const actor = await loadActor(supabase, user.id)
      const service = createServiceClient()
      const preview = text.length > 60 ? text.slice(0, 60) : text
      await createNotification(
        service,
        buildMessageRequestNotification({
          recipientId: toUserId,
          actorId: user.id,
          actorName: actor.name,
          actorAvatarUrl: actor.avatarUrl,
          actorHandle: actor.handle,
          threadId,
          preview,
        })
      )
    } catch {
      // Non-fatal — the message request itself was persisted.
    }
  }

  return NextResponse.json({
    data: { id: data.id, body: data.body, createdAt: data.created_at, mine: true, threadId },
  })
}
