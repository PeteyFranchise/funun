import { test, expect } from '@playwright/test'
import { STORAGE_STATE, hasUserA, hasUserC } from '../env'
import { hasSeed, seed } from '../helpers'
import {
  clearBlocksBetween,
  countNotificationsFor,
  findThreadId,
  getThreadStatus,
  isBlocked,
  openConversationWith,
  resetRequestBudget,
  sendDm,
  uniqueBody,
} from '../messaging-helpers'

// PR #37 UAT 2: "Message request accept/decline/block round-trip."
//
// A and C are strangers (the seed deliberately connects only A and B), so every
// A->C send opens a cold request. Each test resets that pair first because the
// three transitions are terminal and would otherwise contaminate each other.

test.describe('DM request lifecycle - accept, decline, block', () => {
  test.skip(
    !hasUserA() || !hasUserC() || !hasSeed(),
    'needs User A + User C creds and a seeded fixture (npm run e2e:seed)',
  )

  // Reset the A<->C pair (the transitions below are terminal, so they'd
  // contaminate each other) and put A's weekly request budget back to the
  // seeded 9-of-10 - otherwise the cold send that opens each test could 429 for
  // reasons that have nothing to do with the transition being tested.
  test.beforeEach(async () => {
    const { userAId, userCId, fillerUserIds } = seed()
    await clearBlocksBetween(userAId, userCId)
    await resetRequestBudget(userAId, fillerUserIds, [userCId])
  })

  test('UAT 2a - C accepts A request, thread flips to direct and the composer opens up', async ({ browser }) => {
    const { userAId, userCId, nameA } = seed()
    const body = uniqueBody('accept')

    // A sends cold. Not connected -> chooseSendPath returns 'request'.
    const a = await browser.newContext({ storageState: STORAGE_STATE.userA })
    const aRequest = a.request
    const sent = await sendDm(aRequest, userCId, body)
    expect(sent.status, 'a cold first message should be accepted as a request').toBe(200)

    const threadId = await findThreadId(userAId, userCId)
    expect(threadId, 'the send should have created a thread').not.toBeNull()
    expect(await getThreadStatus(threadId!), 'a cold request thread starts pending').toBe('pending')

    // C sees it in the Requests section, not as a normal conversation.
    const c = await browser.newContext({ storageState: STORAGE_STATE.userC })
    const cPage = await c.newPage()
    await cPage.goto('/messages')
    await cPage.getByText('Requests', { exact: true }).waitFor()
    await cPage.getByTestId('thread-row').filter({ hasText: nameA }).click()

    await expect(cPage.getByText('sent you a message request')).toBeVisible()
    await expect(cPage.getByText(body)).toBeVisible()

    await cPage.getByRole('button', { name: 'Accept' }).click()
    await expect(cPage.getByText("You've accepted. Say hello!")).toBeVisible()

    // The server-side transition is what actually matters.
    await expect
      .poll(() => getThreadStatus(threadId!), { message: 'accept must flip the thread to direct' })
      .toBe('direct')

    // And A's composer should stop asking for a request. The placeholder is the
    // user-visible proof the gate opened.
    const aPage = await a.newPage()
    await openConversationWith(aPage, userCId)
    await expect(
      aPage.getByPlaceholder('Write a message…'),
      'once accepted, A messages C directly - no more request framing',
    ).toBeVisible({ timeout: 30_000 })

    await a.close()
    await c.close()
  })

  test('UAT 2b - decline is silent: A is never told', async ({ browser }) => {
    const { userAId, userCId, nameA } = seed()

    const a = await browser.newContext({ storageState: STORAGE_STATE.userA })
    await sendDm(a.request, userCId, uniqueBody('decline'))
    const threadId = await findThreadId(userAId, userCId)

    // Snapshot A's notification count BEFORE the decline so the assertion is
    // about the decline itself, not about whatever was already there.
    const before = await countNotificationsFor(userAId, 'message_request')

    const c = await browser.newContext({ storageState: STORAGE_STATE.userC })
    const cPage = await c.newPage()
    await cPage.goto('/messages')
    await cPage.getByTestId('thread-row').filter({ hasText: nameA }).click()
    await cPage.getByRole('button', { name: 'Decline' }).click()
    await expect(cPage.getByText('Request declined.')).toBeVisible()

    await expect
      .poll(() => getThreadStatus(threadId!), { message: 'decline must set status=declined' })
      .toBe('declined')

    // D-11: the requester must not learn they were declined.
    expect(
      await countNotificationsFor(userAId, 'message_request'),
      'declining must not notify the requester',
    ).toBe(before)

    // A declined thread is hidden from the inbox rather than shown as rejected.
    const aPage = await a.newPage()
    const threadsRes = await aPage.request.get('/api/dm/threads')
    const threads = (await threadsRes.json()).data as { id: string }[]
    expect(
      threads.some(t => t.id === threadId),
      'a declined thread should not surface in the requester inbox',
    ).toBe(false)

    await a.close()
    await c.close()
  })

  test('UAT 2c - block stops delivery, and A cannot tell block from decline', async ({ browser }) => {
    const { userAId, userCId, nameA } = seed()

    const a = await browser.newContext({ storageState: STORAGE_STATE.userA })
    await sendDm(a.request, userCId, uniqueBody('block'))

    const c = await browser.newContext({ storageState: STORAGE_STATE.userC })
    const cPage = await c.newPage()
    await cPage.goto('/messages')
    await cPage.getByTestId('thread-row').filter({ hasText: nameA }).click()

    // Inline confirmation, no modal.
    await cPage.getByRole('button', { name: 'Block' }).click()
    await cPage.getByRole('button', { name: 'Yes, block' }).click()

    await expect
      .poll(() => isBlocked(userCId, userAId), { message: 'block must persist a blocks row' })
      .toBe(true)

    // The send is refused, and with the SAME generic string a declined thread
    // returns - so A can't distinguish being blocked from being ignored.
    const after = await sendDm(a.request, userCId, uniqueBody('post-block'))
    expect(after.status, 'a blocked send must be refused').toBe(403)
    expect(
      after.body.error,
      'the block response must stay generic - leaking "you are blocked" defeats the point',
    ).toBe('Message could not be delivered')

    await a.close()
    await c.close()
  })

  test('a requester cannot accept their own request', async ({ browser }) => {
    const { userAId, userCId } = seed()

    const a = await browser.newContext({ storageState: STORAGE_STATE.userA })
    await sendDm(a.request, userCId, uniqueBody('self-accept'))
    const threadId = await findThreadId(userAId, userCId)

    // The accept route's UPDATE filter carries .neq('requester_id', user.id),
    // so this must miss rather than transition.
    const res = await a.request.post(`/api/dm/request/accept/${threadId}`)
    expect(res.status(), 'A must not be able to self-accept into a direct thread').toBe(404)
    expect(await getThreadStatus(threadId!)).toBe('pending')

    await a.close()
  })
})
