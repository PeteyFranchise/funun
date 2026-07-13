import type { SupabaseClient } from '@supabase/supabase-js'

export type DmMessageView = { id: string; body: string; createdAt: string; mine: boolean }

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
