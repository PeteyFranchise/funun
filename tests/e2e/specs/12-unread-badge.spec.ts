import { test, expect } from '@playwright/test'
import { STORAGE_STATE, hasUserA, hasUserB } from '../env'
import { hasSeed, seed } from '../helpers'
import { findThreadId, sendDm, uniqueBody } from '../messaging-helpers'

// PR #37 UAT 3: "Unread badge increments and clears after opening a thread."
//
// A and B are connected, so B->A sends land directly with no request gate in
// the way. The badge number is only ever set from a fresh
// GET /api/dm/threads?unread=true (D-07, never client-incremented), and opening
// a conversation fires POST /api/dm/read/[threadId] (D-06, auto-read on open).
// Those two halves are what this proves end to end.

test.describe('unread badge', () => {
  test.skip(
    !hasUserA() || !hasUserB() || !hasSeed(),
    'needs User A + User B creds and a seeded fixture (npm run e2e:seed)',
  )

  test('UAT 3 - badge appears when B messages A, and clears once A opens the thread', async ({ browser }) => {
    const { userAId, userBId } = seed()

    const a = await browser.newContext({ storageState: STORAGE_STATE.userA })
    const aPage = await a.newPage()
    await aPage.goto('/vault')

    const badge = aPage.getByTestId('messages-unread-badge')

    // Start clean: if a previous run left A with unread threads, this test
    // would pass on stale state instead of the message it sends.
    const threadId = await findThreadId(userAId, userBId)
    if (threadId) await aPage.request.post(`/api/dm/read/${threadId}`)
    await aPage.reload()
    await expect(badge, 'A starts with nothing unread').toBeHidden()

    // B sends. A's MessagesIcon refetches the count on the dm_messages INSERT
    // it hears over Realtime (and on a 25s poll as a backstop).
    const b = await browser.newContext({ storageState: STORAGE_STATE.userB })
    const body = uniqueBody('unread')
    const sent = await sendDm(b.request, userAId, body)
    expect(sent.status, 'A and B are connected - this should send direct').toBe(200)

    await expect(badge, 'a new direct message should raise the badge').toBeVisible({ timeout: 40_000 })
    await expect(badge).toHaveText('1')

    // Opening the conversation auto-reads it.
    await aPage.goto(`/messages?with=${userBId}`)
    await expect(aPage.getByText(body)).toBeVisible()

    await expect(badge, 'opening the thread should clear the badge').toBeHidden({ timeout: 40_000 })

    await a.close()
    await b.close()
  })

  test('the badge caps at 9+ rather than showing a real count above nine', async ({ browser }) => {
    const { userAId, unreadFillerUserIds } = seed()
    const { supabaseAdmin } = await import('../helpers')
    const admin = supabaseAdmin()
    const created: string[] = []

    // The badge counts unread THREADS, not messages - ten separate senders are
    // needed, not ten messages from one. Plant them service-side: these fillers
    // have no session to send from, and post-056 a direct insert is the only
    // way in anyway.
    for (const fillerId of unreadFillerUserIds) {
      const [a_id, b_id] = userAId < fillerId ? [userAId, fillerId] : [fillerId, userAId]
      const { data } = await admin
        .from('dm_threads')
        .insert({ a_id, b_id, status: 'direct', requester_id: fillerId })
        .select('id')
        .single()
      const tid = (data as { id: string } | null)?.id
      if (!tid) continue
      created.push(tid)
      await admin.from('dm_messages').insert({ thread_id: tid, sender_id: fillerId, body: uniqueBody('cap') })
    }
    expect(created.length, 'need ten unread threads to exercise the cap').toBe(10)

    const a = await browser.newContext({ storageState: STORAGE_STATE.userA })
    const aPage = await a.newPage()
    await aPage.goto('/vault')

    await expect(aPage.getByTestId('messages-unread-badge')).toHaveText('9+', { timeout: 40_000 })

    await a.close()

    // Clean up rather than leaving A permanently at 9+ for the later specs.
    await admin.from('dm_messages').delete().in('thread_id', created)
    await admin.from('dm_thread_reads').delete().in('thread_id', created)
    await admin.from('dm_threads').delete().in('id', created)
  })
})
