import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { STORAGE_STATE, CREDS, SUPABASE, hasUserA, hasUserB, hasUserC } from '../env'
import { hasSeed, seed } from '../helpers'
import { canonicalPair, findThreadId, resetRequestBudget, uniqueBody } from '../messaging-helpers'

// The trust boundary PR #37 explicitly asks reviewers to focus on.
//
// Migration 056 revoked authenticated INSERT/UPDATE on dm_threads and
// dm_messages so /api/dm/send is the only write path - every block check,
// connection check and rate limit lives behind it. If those grants ever come
// back (a re-ordered migration, a `GRANT ALL` in a later file, a fresh
// environment where 056 silently didn't apply), the entire gate is bypassable
// with one PostgREST call and the UI looks completely normal. Nothing else in
// the suite would notice.
//
// These tests talk to PostgREST directly with a real member's JWT - the exact
// thing an attacker has - rather than going through the app.

async function memberClient(email: string, password: string) {
  const client = createClient(SUPABASE.url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Could not sign in ${email} against PostgREST: ${error.message}`)
  return client
}

test.describe('messaging write-boundary (migration 056)', () => {
  test.skip(
    !hasUserA() || !hasUserB() || !hasUserC() || !hasSeed() || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    'needs all three creds, a seeded fixture, and NEXT_PUBLIC_SUPABASE_ANON_KEY',
  )

  test('an authenticated member cannot INSERT a dm_message directly', async () => {
    const { userAId, userBId } = seed()
    const threadId = await findThreadId(userAId, userBId)
    test.skip(!threadId, 'needs an existing A<->B thread - run spec 15 first or reseed')

    const a = await memberClient(CREDS.userA.email, CREDS.userA.password)
    const { error } = await a
      .from('dm_messages')
      .insert({ thread_id: threadId, sender_id: userAId, body: uniqueBody('bypass') })

    // A is a genuine participant in this thread, so this is not an RLS scope
    // failure - it's the privilege revoke. Even a legitimate participant must
    // go through /api/dm/send, because that's where the gates are.
    expect(
      error,
      'a member inserting straight into dm_messages must be refused - /api/dm/send is the only write path',
    ).not.toBeNull()
    expect(error?.code, `expected a privilege error, got: ${error?.message}`).toBe('42501')
  })

  test('an authenticated member cannot INSERT a dm_thread directly', async () => {
    const { userAId, userCId } = seed()
    const [a_id, b_id] = canonicalPair(userAId, userCId)

    const a = await memberClient(CREDS.userA.email, CREDS.userA.password)
    const { error } = await a.from('dm_threads').insert({ a_id, b_id, status: 'direct', requester_id: userAId })

    // Self-minting a 'direct' thread with a stranger would skip the request
    // flow outright - which is the whole feature.
    expect(error, 'a member must not be able to mint their own thread').not.toBeNull()
    expect(error?.code, `expected a privilege error, got: ${error?.message}`).toBe('42501')
  })

  test('an authenticated member cannot UPDATE a dm_thread status directly', async () => {
    const { userAId, userCId, fillerUserIds } = seed()
    await resetRequestBudget(userAId, fillerUserIds, [userCId])

    // Plant a pending request from A to C service-side, then have A try to
    // self-accept it via PostgREST - bypassing the route's requester-exclusion
    // filter entirely.
    const { supabaseAdmin } = await import('../helpers')
    const [a_id, b_id] = canonicalPair(userAId, userCId)
    const { data } = await supabaseAdmin()
      .from('dm_threads')
      .insert({ a_id, b_id, status: 'pending', requester_id: userAId })
      .select('id')
      .single()
    const threadId = (data as { id: string }).id

    const a = await memberClient(CREDS.userA.email, CREDS.userA.password)
    await a.from('dm_threads').update({ status: 'direct' }).eq('id', threadId)

    // Whether it errors or silently matches zero rows, what must be true is
    // that the status did not move.
    const { getThreadStatus } = await import('../messaging-helpers')
    expect(
      await getThreadStatus(threadId),
      'A must not be able to promote their own pending request to direct',
    ).toBe('pending')
  })

  test('an authenticated member cannot forge their own last_seen_at', async () => {
    const { userAId } = seed()
    const { supabaseAdmin } = await import('../helpers')

    await supabaseAdmin().from('artist_profiles').update({ last_seen_at: null }).eq('id', userAId)

    const a = await memberClient(CREDS.userA.email, CREDS.userA.password)
    await a.from('artist_profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', userAId)

    // Migration 054 withheld the UPDATE grant on this column deliberately -
    // presence is written only by the service-role heartbeat, so a member can't
    // advertise "Active now" while away.
    const { data } = await supabaseAdmin()
      .from('artist_profiles')
      .select('last_seen_at')
      .eq('id', userAId)
      .maybeSingle()
    expect(
      (data as { last_seen_at: string | null } | null)?.last_seen_at,
      'presence must not be self-writable - only the service-role heartbeat sets last_seen_at',
    ).toBeNull()
  })
})

test.describe('messaging API input handling', () => {
  test.use({ storageState: STORAGE_STATE.userA })

  test.skip(!hasUserA() || !hasSeed(), 'needs User A creds and a seeded fixture (npm run e2e:seed)')

  test('a non-UUID recipient is rejected before it reaches a PostgREST filter', async ({ request }) => {
    // toUserId is interpolated into isConnected's .or() filter, so a non-UUID is
    // both meaningless and a filter-injection surface.
    const res = await request.post('/api/dm/send', {
      data: { toUserId: 'not-a-uuid,or(1.eq.1)', body: 'x' },
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toBe('Invalid recipient')
  })

  test('a member cannot mark a thread they are not in as read', async ({ request }) => {
    const { userBId, userCId } = seed()
    const { supabaseAdmin } = await import('../helpers')

    // A thread between B and C. A is a stranger to it.
    const [a_id, b_id] = canonicalPair(userBId, userCId)
    const { data } = await supabaseAdmin()
      .from('dm_threads')
      .upsert({ a_id, b_id, status: 'direct' }, { onConflict: 'a_id,b_id' })
      .select('id')
      .single()
    const foreignThreadId = (data as { id: string }).id

    const res = await request.post(`/api/dm/read/${foreignThreadId}`)
    expect(res.status(), 'A must not be able to write a read marker on a thread they cannot see').toBe(404)

    await supabaseAdmin().from('dm_threads').delete().eq('id', foreignThreadId)
  })

  test('an over-long message body is rejected', async ({ request }) => {
    const { userBId } = seed()
    const res = await request.post('/api/dm/send', {
      data: { toUserId: userBId, body: 'x'.repeat(4001) },
    })
    // The DB has its own CHECK at 4000; the route should refuse first so this
    // surfaces as a clean 400 rather than a 500 from a constraint violation.
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toBe('Message too long')
  })

  test('a member cannot message themselves', async ({ request }) => {
    const { userAId } = seed()
    const res = await request.post('/api/dm/send', { data: { toUserId: userAId, body: 'hello me' } })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toBe('Cannot message yourself')
  })
})
