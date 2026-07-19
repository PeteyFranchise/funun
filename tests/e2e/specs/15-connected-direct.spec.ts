import { test, expect } from '@playwright/test'
import { STORAGE_STATE, hasUserA, hasUserB } from '../env'
import { hasSeed, seed } from '../helpers'
import { getThreadStatus, findThreadId, sendDm, uniqueBody } from '../messaging-helpers'

// PR #37 UAT 6: "Connected users bypass request flow and message directly."
//
// The seed gives A and B an accepted connection and nothing else, so this is
// the 'direct' branch of chooseSendPath. The interesting half is the Realtime
// delivery: B has a conversation open while A types, and the message has to
// arrive without a reload. No unit test can see that.

test.describe('connected members message directly', () => {
  test.skip(
    !hasUserA() || !hasUserB() || !hasSeed(),
    'needs User A + User B creds and a seeded fixture (npm run e2e:seed)',
  )

  test('UAT 6 - no request step, and the message lands live in the other session', async ({ browser }) => {
    const { userAId, userBId } = seed()

    // B sits in the conversation with A the whole time.
    const b = await browser.newContext({ storageState: STORAGE_STATE.userB })
    const bPage = await b.newPage()
    await bPage.goto(`/messages?with=${userAId}`)
    await expect(
      bPage.getByPlaceholder('Write a message…'),
      'B is connected to A - the composer must not ask for a request',
    ).toBeVisible({ timeout: 30_000 })

    const a = await browser.newContext({ storageState: STORAGE_STATE.userA })
    const aPage = await a.newPage()
    await aPage.goto(`/messages?with=${userBId}`)

    // The placeholder is the user-visible tell that the gate is open. A cold
    // stranger would read "Send a message request…" here instead.
    await expect(aPage.getByPlaceholder('Write a message…')).toBeVisible({ timeout: 30_000 })
    await expect(aPage.getByPlaceholder('Send a message request…')).toBeHidden()
    await expect(
      aPage.getByText(/message request.? left this week/),
      'a connected send spends no request budget, so no budget hint should show',
    ).toBeHidden()

    const body = uniqueBody('direct')
    await aPage.getByPlaceholder('Write a message…').fill(body)
    await aPage.getByRole('button', { name: 'Send' }).click()

    // A sees their own message.
    await expect(aPage.getByText(body)).toBeVisible()

    // B receives it over Realtime, with no reload and no Accept step in between.
    await expect(
      bPage.getByText(body),
      'a direct message should arrive in B open session without a refresh',
    ).toBeVisible({ timeout: 30_000 })
    await expect(bPage.getByRole('button', { name: 'Accept' })).toBeHidden()

    // The thread is 'direct' from the start - it never passes through pending.
    const threadId = await findThreadId(userAId, userBId)
    expect(threadId).not.toBeNull()
    expect(
      await getThreadStatus(threadId!),
      'a connected pair opens a direct thread, never a pending request',
    ).toBe('direct')

    await a.close()
    await b.close()
  })

  test('a connected send is accepted regardless of the weekly request budget', async ({ browser }) => {
    const { userAId, userBId, fillerUserIds } = seed()
    const { resetRequestBudget } = await import('../messaging-helpers')

    // Drive A to the wall against strangers...
    await resetRequestBudget(userAId, fillerUserIds, [])
    const a = await browser.newContext({ storageState: STORAGE_STATE.userA })
    await sendDm(a.request, fillerUserIds[9], uniqueBody('spend-10th'))
    const walled = await sendDm(a.request, fillerUserIds[10], uniqueBody('spend-11th'))
    expect(walled.status, 'A should now be out of cold-request budget').toBe(429)

    // ...and B must still go through. The budget governs cold requests only; a
    // connection is not rationed. If this ever returns 429, the limit has
    // escaped its scope and is throttling real conversations.
    const direct = await sendDm(a.request, userBId, uniqueBody('connected-at-limit'))
    expect(
      direct.status,
      'the weekly cap is for cold requests - it must never throttle a connected conversation',
    ).toBe(200)

    await a.close()
  })
})
