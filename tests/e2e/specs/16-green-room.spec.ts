import { test, expect } from '@playwright/test'
import { STORAGE_STATE, hasUserA, hasUserB } from '../env'
import { hasSeed, seed, supabaseAdmin } from '../helpers'
import { uniqueBody } from '../messaging-helpers'

// Phase 12 (Green Room). No UAT line names it, but posting and reading the feed
// is the whole point of the room, so it gets covered as a common scenario.
//
// The units already cover audience matching, ranking, cursors and validation.
// What they can't reach is the Realtime pill: a new post must NOT auto-insert
// into the feed - it increments a counter and offers "Show latest" instead, so
// the list never jumps under a reader mid-scroll. That's a deliberate product
// decision worth pinning down.

test.describe('Green Room feed', () => {
  test.skip(
    !hasUserA() || !hasUserB() || !hasSeed(),
    'needs User A + User B creds and a seeded fixture (npm run e2e:seed)',
  )

  test.afterEach(async () => {
    const { userAId, userBId } = seed()
    await supabaseAdmin().from('green_room_posts').delete().in('author_id', [userAId, userBId])
  })

  test('a published post appears in the feed', async ({ browser }) => {
    const a = await browser.newContext({ storageState: STORAGE_STATE.userA })
    const page = await a.newPage()
    await page.goto('/green-room')

    const body = uniqueBody('post')
    await page.getByPlaceholder('Share an update, ask for feedback, or post a specific opportunity...').fill(body)
    await page.getByRole('button', { name: 'Post', exact: true }).click()

    await expect(page.getByTestId('feed-card').filter({ hasText: body })).toBeVisible({ timeout: 30_000 })

    await a.close()
  })

  test('a draft is not published to the feed', async ({ browser }) => {
    const a = await browser.newContext({ storageState: STORAGE_STATE.userA })
    const page = await a.newPage()
    await page.goto('/green-room')

    const body = uniqueBody('draft')
    await page.getByPlaceholder('Share an update, ask for feedback, or post a specific opportunity...').fill(body)
    await page.getByRole('button', { name: 'Save draft' }).click()

    await page.reload()
    await expect(
      page.getByTestId('feed-card').filter({ hasText: body }),
      'a draft must never reach the public feed',
    ).toBeHidden()

    await a.close()
  })

  test('every tab loads', async ({ browser }) => {
    const a = await browser.newContext({ storageState: STORAGE_STATE.userA })
    const page = await a.newPage()
    await page.goto('/green-room')

    for (const label of ['Following', 'Discover', 'Opportunities', 'For You']) {
      await page.getByRole('button', { name: label, exact: true }).click()
      // Either cards or the empty state - both are a loaded tab. What must NOT
      // happen is being stuck on the loading state or rendering nothing.
      await expect
        .poll(
          async () =>
            (await page.getByTestId('feed-card').count()) > 0 ||
            (await page.getByText('The room is quiet on this tab.').isVisible()),
          { message: `the ${label} tab should settle into cards or the empty state` },
        )
        .toBe(true)
      await expect(page.getByText('Loading the room...')).toBeHidden()
    }

    await a.close()
  })

  test('a new post offers "Show latest" instead of jumping the feed', async ({ browser }) => {
    const a = await browser.newContext({ storageState: STORAGE_STATE.userA })
    const aPage = await a.newPage()
    await aPage.goto('/green-room')
    await aPage.waitForLoadState('networkidle')

    // B posts while A is reading.
    const b = await browser.newContext({ storageState: STORAGE_STATE.userB })
    const body = uniqueBody('realtime')
    const res = await b.request.post('/api/green-room/posts', {
      data: { postType: 'general_update', body, status: 'published', visibility: 'public' },
    })
    expect(res.status(), 'B should be able to publish a public post').toBe(201)

    // The pill appears...
    const pill = aPage.getByTestId('feed-new-updates')
    await expect(pill).toBeVisible({ timeout: 30_000 })
    await expect(pill).toHaveText(/1 new update · Show latest/)

    // ...and the post is NOT in the feed until A asks for it. This is the half
    // that matters: silently inserting would move the list under a reader.
    await expect(
      aPage.getByTestId('feed-card').filter({ hasText: body }),
      'new activity must not auto-insert - it waits behind the pill',
    ).toBeHidden()

    await pill.click()
    await expect(aPage.getByTestId('feed-card').filter({ hasText: body })).toBeVisible({ timeout: 30_000 })
    await expect(pill).toBeHidden()

    await a.close()
    await b.close()
  })
})
