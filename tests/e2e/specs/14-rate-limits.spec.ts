import { test, expect } from '@playwright/test'
import { STORAGE_STATE, hasUserA, hasUserC } from '../env'
import { hasSeed, seed } from '../helpers'
import {
  clearBlocksBetween,
  findThreadId,
  resetRequestBudget,
  sendDm,
  uniqueBody,
} from '../messaging-helpers'

// PR #37 UAT 5: "Rate-limit wall and stacked pending cap."
//
// The seed leaves A holding 9 pending cold requests out of BASELINE_REQUEST_LIMIT
// (10), and A is forced verified:false so 10 - not VERIFIED_REQUEST_LIMIT's 30 -
// is the limit under test. One request then proves the wall.
//
// The key thing these tests separate: the UI and the server enforce the caps
// independently. The composer swaps itself out for a RateLimitWall at zero
// budget, and disables its input at PENDING_STACK_CAP - both computed
// client-side. That's a courtesy, not a control: it's trivially bypassed by
// posting straight to /api/dm/send. So every cap is asserted twice - once as
// the thing the user sees, once as the thing the server actually refuses.

test.describe('DM rate limits', () => {
  test.skip(
    !hasUserA() || !hasUserC() || !hasSeed(),
    'needs User A + User C creds and a seeded fixture (npm run e2e:seed)',
  )

  // Every test here spends budget, so each one has to start from the same
  // 9-of-10 baseline. Without this the results depend on execution order.
  test.beforeEach(async () => {
    const { userAId, userCId, fillerUserIds } = seed()
    // Spec 11's block test leaves a blocks row behind; a stale one would turn
    // every send here into a 403 that looks nothing like a rate limit.
    await clearBlocksBetween(userAId, userCId)
    await resetRequestBudget(userAId, fillerUserIds, [userCId])
  })

  test('UAT 5a - the last slot is offered, spent, and then the wall goes up', async ({ browser }) => {
    const { fillerUserIds } = seed()
    const tenth = fillerUserIds[9] // spare: no thread yet
    const eleventh = fillerUserIds[10] // spare: no thread yet

    const a = await browser.newContext({ storageState: STORAGE_STATE.userA })
    const page = await a.newPage()

    // 9 of 10 spent -> the composer offers exactly one more.
    await page.goto(`/messages?with=${tenth}`)
    await expect(
      page.getByText('1 message request left this week'),
      'seeded at 9/10, the budget hint should read exactly one left',
    ).toBeVisible({ timeout: 30_000 })

    // Spend it through the UI - the 10th request is allowed.
    await page.getByPlaceholder('Send a message request…').fill(uniqueBody('tenth'))
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText(/message request/i).first()).toBeVisible()

    // 10 of 10 -> the composer is replaced by the wall for a fresh stranger.
    await page.goto(`/messages?with=${eleventh}`)
    await expect(
      page.getByText("You've used all 10 message requests this week"),
      'at the limit the composer must be replaced by the wall',
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('link', { name: 'Send Connect Request' })).toBeVisible()
    await expect(
      page.getByPlaceholder('Send a message request…'),
      'the composer must be gone, not merely disabled',
    ).toBeHidden()

    // The wall is only UI. The server is the thing that actually has to say no.
    const bypass = await sendDm(a.request, eleventh, uniqueBody('eleventh'))
    expect(bypass.status, 'the 11th request must be refused server-side, not just hidden in the UI').toBe(429)
    expect(bypass.body.error).toBe('Rate limit reached')
    expect(bypass.body.remaining).toBe(0)

    await a.close()
  })

  test('UAT 5b - a pending request stacks up to three messages, then stops', async ({ browser }) => {
    const { userAId, userCId } = seed()

    const a = await browser.newContext({ storageState: STORAGE_STATE.userA })
    const page = await a.newPage()
    await page.goto(`/messages?with=${userCId}`)

    // Message 1 opens the request; 2 and 3 stack onto it.
    for (let i = 1; i <= 3; i++) {
      const res = await sendDm(a.request, userCId, uniqueBody(`stack-${i}`))
      expect(res.status, `message ${i} of 3 should be accepted onto the pending request`).toBe(200)
    }

    // 4th: server refuses. This is the assertion that matters - the UI guard
    // below is bypassable, this one isn't.
    const fourth = await sendDm(a.request, userCId, uniqueBody('stack-4'))
    expect(fourth.status, 'the 4th stacked message must be refused').toBe(400)
    expect(fourth.body.error).toBe('Pending request message limit reached')

    // And the UI reflects it: input disabled, cap explained.
    await page.reload()
    await expect(page.getByText('You can add up to 3 messages while your request is pending.')).toBeVisible()
    await expect(
      page.getByPlaceholder('Send a message request…'),
      'at the stack cap the composer input should be disabled',
    ).toBeDisabled()

    await a.close()
  })

  test('stacking onto an existing request spends no weekly budget (D-18)', async ({ browser }) => {
    const { userAId, userCId } = seed()

    const a = await browser.newContext({ storageState: STORAGE_STATE.userA })
    const page = await a.newPage()

    // Opening the request to C spends one slot. The seed leaves 9 pending, so
    // this is the 10th and the budget hits zero.
    const opened = await sendDm(a.request, userCId, uniqueBody('budget-open'))
    expect(opened.status).toBe(200)
    expect(await findThreadId(userAId, userCId)).not.toBeNull()

    // Stacking a second message onto that same pending request must NOT count
    // as a new request. If it did, the send would come back 429 instead of 200.
    const stacked = await sendDm(a.request, userCId, uniqueBody('budget-stack'))
    expect(
      stacked.status,
      'stacking is not a new cold request - it must not be charged against the weekly budget',
    ).toBe(200)

    // Meanwhile a genuinely new stranger is walled, proving the budget really
    // is exhausted and the stack above was an exemption, not a hole.
    const { fillerUserIds } = seed()
    const stranger = fillerUserIds[10]
    const fresh = await sendDm(a.request, stranger, uniqueBody('budget-fresh'))
    expect(fresh.status, 'the budget IS spent - a new stranger must still be refused').toBe(429)

    await page.close()
    await a.close()
  })
})
