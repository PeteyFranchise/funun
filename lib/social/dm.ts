import type { SupabaseClient } from '@supabase/supabase-js'

export type DmMessageView = { id: string; body: string; createdAt: string; mine: boolean }

// Canonical RFC-4122 UUID shape. User ids reaching the DM layer come from
// request bodies / query params and are interpolated into PostgREST `.or()`
// filters (see isConnected). Any non-UUID value is both meaningless as a
// target and a filter-injection surface, so callers MUST validate before use.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True only for a well-formed UUID string — reject everything else. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** Canonical (a < b) ordering so a pair always maps to one thread row. */
export function canonicalPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x]
}

/** Find the existing 1:1 thread id for two users, or null. */
export async function findThread(
  supabase: SupabaseClient,
  x: string,
  y: string
): Promise<string | null> {
  const [a, b] = canonicalPair(x, y)
  const { data } = await supabase
    .from('dm_threads')
    .select('id')
    .eq('a_id', a)
    .eq('b_id', b)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

/** Find or create the 1:1 thread id for two users. */
export async function ensureThread(supabase: SupabaseClient, x: string, y: string): Promise<string | null> {
  const existing = await findThread(supabase, x, y)
  if (existing) return existing
  const [a, b] = canonicalPair(x, y)
  const { data, error } = await supabase.from('dm_threads').insert({ a_id: a, b_id: b }).select('id').single()
  if (error) {
    // Race: another insert won — re-read.
    return findThread(supabase, x, y)
  }
  return (data as { id: string }).id
}

// ─── Rate-limit constants (D-15/D-18) ────────────────────────────────────
// Tunable weekly caps for outbound cold message requests.
// BASELINE: unverified members. VERIFIED: verified members (higher allowance).
// PENDING_STACK_CAP: max stacked messages allowed in a still-pending request thread.

export const BASELINE_REQUEST_LIMIT = 10
export const VERIFIED_REQUEST_LIMIT = 30
export const PENDING_STACK_CAP = 3

// ─── Send-gate decision core (pure, unit-tested) ─────────────────────────
// Lives here (not in app/api/dm/send/route.ts) because Next.js route files
// may only export HTTP method handlers — any other export fails the build's
// route-type validation. The route wires this to the real
// isConnected()/countRecentRequests()/countPendingMessagesFrom() queries.
export type SendPathKind = 'direct' | 'stack' | 'request' | 'reject-rate' | 'reject-stack'

export function chooseSendPath(args: {
  connected: boolean
  existingPendingByMe: boolean
  pendingMsgCount: number
  recentRequestCount: number
  verified: boolean
}): { kind: SendPathKind } {
  const { connected, existingPendingByMe, pendingMsgCount, recentRequestCount, verified } = args
  if (connected) return { kind: 'direct' }
  if (existingPendingByMe) {
    return { kind: pendingMsgCount >= PENDING_STACK_CAP ? 'reject-stack' : 'stack' }
  }
  const limit = verified ? VERIFIED_REQUEST_LIMIT : BASELINE_REQUEST_LIMIT
  return { kind: recentRequestCount >= limit ? 'reject-rate' : 'request' }
}

// ─── Rate-limit count — rolling 7-day window (CONNECT-04, D-14) ──────────

/**
 * Count the number of pending DM requests the requester has sent in the
 * last 7 days. Used by the send gate to enforce BASELINE_REQUEST_LIMIT /
 * VERIFIED_REQUEST_LIMIT caps. The window is rolling (no reset job needed).
 */
export async function countRecentRequests(
  supabase: SupabaseClient,
  requesterId: string
): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('dm_threads')
    .select('id', { count: 'exact', head: true })
    .eq('requester_id', requesterId)
    .eq('status', 'pending')
    .gte('created_at', since)
  return count ?? 0
}

// ─── Connection check (CONNECT-05, D-13) ─────────────────────────────────

/**
 * Returns true if users a and b have a mutually accepted connection in
 * either direction. Connected members bypass the message-request flow.
 */
export async function isConnected(
  supabase: SupabaseClient,
  a: string,
  b: string
): Promise<boolean> {
  const { data } = await supabase
    .from('connections')
    .select('id')
    .eq('status', 'accepted')
    .or(
      `and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`
    )
    .maybeSingle()
  return !!data
}

// ─── Pending stacked-message cap count (D-18) ────────────────────────────

/**
 * Count how many messages the sender has already sent in a still-pending
 * thread. Used to enforce PENDING_STACK_CAP without consuming rate-limit
 * budget for each follow-up message in the same request.
 */
export async function countPendingMessagesFrom(
  supabase: SupabaseClient,
  threadId: string,
  senderId: string
): Promise<number> {
  const { count } = await supabase
    .from('dm_messages')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId)
    .eq('sender_id', senderId)
  return count ?? 0
}

// ─── Unread predicate (PRESENCE-03, D-07) ────────────────────────────────

/**
 * Pure timestamp comparison for unread state — never a cached counter.
 * Returns true if the latest message is strictly newer than the read
 * marker, or if the marker is null (never read).
 */
export function hasUnread(
  lastReadAt: string | null,
  latestMessageAt: string | null
): boolean {
  if (!latestMessageAt) return false
  if (!lastReadAt) return true
  return new Date(latestMessageAt).getTime() > new Date(lastReadAt).getTime()
}

// ─── Conversation loader ───────────────────────────────────────────────────

/** Load the conversation between viewer and other, oldest-first. */
export async function loadConversation(
  supabase: SupabaseClient,
  viewerId: string,
  otherId: string
): Promise<DmMessageView[]> {
  const threadId = await findThread(supabase, viewerId, otherId)
  if (!threadId) return []
  const { data } = await supabase
    .from('dm_messages')
    .select('id, body, sender_id, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(200)
  return ((data ?? []) as { id: string; body: string; sender_id: string; created_at: string }[]).map(m => ({
    id: m.id,
    body: m.body,
    createdAt: m.created_at,
    mine: m.sender_id === viewerId,
  }))
}

// ─── Thread-list view builder (Plan 05) ──────────────────────────────────
// Moved here from app/api/dm/threads/route.ts so the server page component
// (app/(artist)/messages/page.tsx) can build the SAME initial thread list
// directly, without an internal self-fetch round-trip — mirrors this
// codebase's established pattern of page components querying Supabase
// directly (see app/(artist)/vault/page.tsx). GET /api/dm/threads imports
// and re-exposes this exact function so both callers share one query shape.

export type ThreadOtherView = { id: string; name: string; avatarUrl: string | null; handle: string; lastSeenAt: string | null }

export type ThreadView = {
  id: string
  status: string
  requesterId: string | null
  createdAt: string
  other: ThreadOtherView
  lastMessage: { body: string; createdAt: string } | null
  hasUnread: boolean
}

type ThreadRow = {
  id: string
  a_id: string
  b_id: string
  status: string
  requester_id: string | null
  created_at: string
}

export async function buildThreadViews(supabase: SupabaseClient, userId: string): Promise<ThreadView[]> {
  const { data: threadsData } = await supabase
    .from('dm_threads')
    .select('id, a_id, b_id, status, requester_id, created_at')
  const threads = ((threadsData ?? []) as ThreadRow[]).filter(t => t.status !== 'declined')
  if (threads.length === 0) return []

  const threadIds = threads.map(t => t.id)
  const otherIds = Array.from(new Set(threads.map(t => (t.a_id === userId ? t.b_id : t.a_id))))

  const [messagesRes, readsRes, profilesRes] = await Promise.all([
    supabase
      .from('dm_messages')
      .select('thread_id, body, created_at')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false }),
    supabase.from('dm_thread_reads').select('thread_id, last_read_at').eq('user_id', userId).in('thread_id', threadIds),
    // Explicit column list — never select('*') on artist_profiles
    // (migration 040 column lockdown returns 42501 otherwise).
    supabase.from('artist_profiles').select('id, artist_name, avatar_url, handle, last_seen_at').in('id', otherIds),
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
    { artist_name: string | null; avatar_url: string | null; handle: string | null; last_seen_at: string | null }
  >()
  for (const p of (profilesRes.data ?? []) as {
    id: string
    artist_name: string | null
    avatar_url: string | null
    handle: string | null
    last_seen_at: string | null
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
      createdAt: t.created_at,
      other: {
        id: otherId,
        name: profile?.artist_name || 'Member',
        avatarUrl: profile?.avatar_url ?? null,
        handle: profile?.handle ?? '',
        lastSeenAt: profile?.last_seen_at ?? null,
      },
      lastMessage,
      hasUnread: hasUnread(lastReadAt, lastMessage?.createdAt ?? null),
    }
  })

  // Order threads by latest message time desc; threads with no message yet
  // use epoch fallback and sort last.
  views.sort((a, b) => {
    const aTime = new Date(a.lastMessage?.createdAt ?? 0).getTime()
    const bTime = new Date(b.lastMessage?.createdAt ?? 0).getTime()
    return bTime - aTime
  })

  return views
}

// ─── Rate-limit budget projection (D-17, client + server shared) ────────
// Pure computation over the viewer's own thread list — mirrors
// countRecentRequests()'s rolling-7-day window exactly, but works off
// already-fetched ThreadView rows so the /messages client never needs a
// dedicated "remaining budget" endpoint (Plan 05 deviation note).

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export function computeRequestBudget(
  threads: { status: string; requesterId: string | null; createdAt: string }[],
  viewerId: string,
  verified: boolean
): { remainingRequests: number; nextSlotDate: string | null; weeklyLimit: number } {
  const now = Date.now()
  const recentSent = threads.filter(
    t => t.status === 'pending' && t.requesterId === viewerId && now - new Date(t.createdAt).getTime() < SEVEN_DAYS_MS
  )
  const weeklyLimit = verified ? VERIFIED_REQUEST_LIMIT : BASELINE_REQUEST_LIMIT
  const remainingRequests = Math.max(0, weeklyLimit - recentSent.length)
  let nextSlotDate: string | null = null
  if (recentSent.length > 0) {
    const oldest = recentSent.reduce((min, t) => (new Date(t.createdAt) < new Date(min.createdAt) ? t : min))
    nextSlotDate = new Date(new Date(oldest.createdAt).getTime() + SEVEN_DAYS_MS).toISOString()
  }
  return { remainingRequests, nextSlotDate, weeklyLimit }
}
