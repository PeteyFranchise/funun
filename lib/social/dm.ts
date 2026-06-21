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
