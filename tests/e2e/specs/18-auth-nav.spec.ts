import { test, expect } from '@playwright/test'
import { STORAGE_STATE, CREDS, hasUserA, hasUserB } from '../env'
import { hasSeed, seed } from '../helpers'

// Common scenarios around the two new surfaces: can a logged-out visitor reach
// them, and can a logged-in member find them.

test.describe('anonymous access to the new surfaces', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('/messages bounces an anonymous visitor to sign-in', async ({ page }) => {
    await page.goto('/messages')
    await expect(page).toHaveURL(/\/signin/)
  })

  test('the DM API refuses an anonymous caller', async ({ request }) => {
    for (const path of ['/api/dm/threads', '/api/dm/messages?with=00000000-0000-4000-8000-000000000000']) {
      const res = await request.get(path)
      expect(res.status(), `${path} must refuse an anonymous caller`).toBe(401)
    }
    const send = await request.post('/api/dm/send', {
      data: { toUserId: '00000000-0000-4000-8000-000000000000', body: 'hi' },
    })
    expect(send.status()).toBe(401)
  })

  test('the Green Room API refuses an anonymous caller', async ({ request }) => {
    // NOTE: unlike /messages, the /green-room PAGE does not redirect - it is
    // absent from middleware's isProtected list and its page component has no
    // getUser guard, so an anonymous visitor renders the shell and composer.
    // No data leaks (this API is the gate, asserted here), but the two surfaces
    // are inconsistent. Asserting what the code does today rather than what it
    // arguably should - see the PR body.
    const feed = await request.get('/api/green-room/feed?tab=for_you')
    expect(feed.status(), 'the feed must refuse an anonymous caller').toBe(401)

    const post = await request.post('/api/green-room/posts', {
      data: { postType: 'general_update', body: 'anon', status: 'published', visibility: 'public' },
    })
    expect(post.status(), 'an anonymous caller must not be able to publish').toBe(401)
  })

  test('presence cannot be pinged anonymously', async ({ request }) => {
    const res = await request.post('/api/presence/heartbeat')
    expect(res.status()).toBe(401)
  })
})

test.describe('signed-in navigation', () => {
  test.skip(!hasUserA() || !hasSeed(), 'needs User A creds and a seeded fixture (npm run e2e:seed)')
  test.use({ storageState: STORAGE_STATE.userA })

  test('both new surfaces are reachable from the nav', async ({ page }) => {
    await page.goto('/vault')

    await page.getByRole('link', { name: 'The Green Room' }).click()
    await page.waitForURL(/\/green-room/)
    await expect(page.getByText('Loading the room...')).toBeHidden({ timeout: 30_000 })

    await page.getByRole('link', { name: 'Messages', exact: true }).first().click()
    await page.waitForURL(/\/messages/)
    await expect(page.getByPlaceholder('Search by name…')).toBeVisible()
  })

  test('signing in lands on the vault with the messages icon mounted', async ({ browser }) => {
    test.skip(!hasUserB(), 'needs User B creds')
    // A fresh sign-in through the real form, not a restored storage state -
    // proves the authenticated layout (and with it PresenceTracker and the
    // MessagesIcon) mounts on a genuinely new session.
    const fresh = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await fresh.newPage()
    await page.goto('/signin')
    await page.locator('#email').fill(CREDS.userA.email)
    await page.locator('#password').fill(CREDS.userA.password)
    await page.getByRole('button', { name: /sign in/i }).click()

    await page.waitForURL(/\/vault/)
    await expect(page.getByLabel('Messages')).toBeVisible()

    await fresh.close()
  })
})

test.describe('the ?with= deep link', () => {
  test.skip(!hasUserA() || !hasUserB() || !hasSeed(), 'needs User A + User B creds and a seeded fixture')
  test.use({ storageState: STORAGE_STATE.userA })

  test('resolves a stand-in contact even with no thread yet', async ({ page }) => {
    const { userCId, nameC } = seed()

    // C is a stranger with no A<->C thread guaranteed, so this exercises the
    // stand-in resolution path rather than just selecting an existing row.
    await page.goto(`/messages?with=${userCId}`)
    await expect(page.getByText(nameC).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Select a conversation')).toBeHidden()
  })

  test('an unknown ?with= does not break the inbox', async ({ page }) => {
    await page.goto('/messages?with=00000000-0000-4000-8000-000000000000')
    // Should degrade to the plain inbox, not a crash or an error page.
    await expect(page.getByPlaceholder('Search by name…')).toBeVisible()
  })
})
