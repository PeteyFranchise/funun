import type { APIRequestContext, Page } from '@playwright/test'
import { supabaseAdmin } from './helpers'

// ─── Direct DB manipulation (service role) ───────────────────────────────
// Migration 056 revoked authenticated INSERT/UPDATE on dm_threads and
// dm_messages, so anything that needs to plant a thread or message out-of-band
// has to come through here.

/** dm_threads has CHECK (a_id < b_id) - a pair must map to exactly one row. */
export function canonicalPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x]
}

export async function findThreadId(x: string, y: string): Promise<string | null> {
  const [a_id, b_id] = canonicalPair(x, y)
  const { data } = await supabaseAdmin()
    .from('dm_threads')
    .select('id')
    .eq('a_id', a_id)
    .eq('b_id', b_id)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

export async function getThreadStatus(threadId: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from('dm_threads')
    .select('status')
    .eq('id', threadId)
    .maybeSingle()
  return (data as { status: string } | null)?.status ?? null
}

export async function isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const { data } = await supabaseAdmin()
    .from('blocks')
    .select('blocker_id')
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
    .maybeSingle()
  return Boolean(data)
}

export async function countNotificationsFor(userId: string, type: string): Promise<number> {
  const { count } = await supabaseAdmin()
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', type)
  return count ?? 0
}

/**
 * Drop any block in either direction between x and y.
 *
 * Blocks are bidirectional for delivery and checked before anything else in
 * /api/dm/send, so a single leftover row turns every later send between the
 * pair into a generic 403 - which is deliberately indistinguishable from a real
 * delivery failure. That makes a stale block just about the most confusing state
 * a run can be left in.
 */
export async function clearBlocksBetween(x: string, y: string): Promise<void> {
  await supabaseAdmin()
    .from('blocks')
    .delete()
    .or(`and(blocker_id.eq.${x},blocked_id.eq.${y}),and(blocker_id.eq.${y},blocked_id.eq.${x})`)
}

/** Delete the x<->y thread so a spec can start that pair from scratch. */
export async function clearThreadBetween(x: string, y: string): Promise<void> {
  const id = await findThreadId(x, y)
  if (!id) return
  const admin = supabaseAdmin()
  await admin.from('dm_messages').delete().eq('thread_id', id)
  await admin.from('dm_thread_reads').delete().eq('thread_id', id)
  await admin.from('dm_threads').delete().eq('id', id)
}

/**
 * Put A's weekly request budget back to the seeded baseline: exactly 9 pending
 * cold requests out of BASELINE_REQUEST_LIMIT (10).
 *
 * countRecentRequests() counts pending threads where requester_id = A inside a
 * rolling 7-day window, so "spending" budget just means creating more of them -
 * and any test that spends a slot leaves the next one starting from a different
 * number. Without this reset the rate-limit tests pass or fail depending on
 * execution order, which is the worst kind of green.
 */
export async function resetRequestBudget(
  userAId: string,
  fillerUserIds: string[],
  alsoClearWith: string[] = [],
): Promise<void> {
  const admin = supabaseAdmin()

  // Drop every thread A opened against a filler or a listed extra target.
  for (const other of [...fillerUserIds, ...alsoClearWith]) {
    await clearThreadBetween(userAId, other)
  }

  // Re-plant the nine. Service role: migration 056 revoked authenticated
  // INSERT on dm_threads, so this is the only path.
  for (const fillerId of fillerUserIds.slice(0, 9)) {
    const [a_id, b_id] = canonicalPair(userAId, fillerId)
    const { error } = await admin
      .from('dm_threads')
      .insert({ a_id, b_id, status: 'pending', requester_id: userAId })
    if (error) throw new Error(`Rebuilding request budget failed: ${error.message}`)
  }
}

// ─── API-level helpers ───────────────────────────────────────────────────
// These call the real routes with a signed-in request context, which is the
// only sanctioned write path post-056.

export type SendResult = { status: number; body: Record<string, unknown> }

export async function sendDm(
  request: APIRequestContext,
  toUserId: string,
  body: string,
): Promise<SendResult> {
  const res = await request.post('/api/dm/send', { data: { toUserId, body } })
  return { status: res.status(), body: await res.json().catch(() => ({})) }
}

// ─── Page helpers ────────────────────────────────────────────────────────

/**
 * Open a conversation with a specific user via the ?with= deep link. This is
 * the path that resolves a stand-in contact when no thread exists yet, so it
 * works for both a cold stranger and an existing thread.
 */
export async function openConversationWith(page: Page, otherUserId: string): Promise<void> {
  await page.goto(`/messages?with=${otherUserId}`)
  await page.waitForLoadState('networkidle')
}

/** A unique body so an assertion can't accidentally match a leftover message. */
export function uniqueBody(label: string): string {
  return `e2e ${label} ${Math.random().toString(36).slice(2, 10)}`
}
