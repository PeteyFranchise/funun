import { test, expect } from '@playwright/test'
import { STORAGE_STATE, hasUserA } from '../env'
import { getSeedContext, hasFullSeed } from '../helpers'

// Checkpoint 4 - shareable link works unauthenticated, with the 7-day helper.
// "Get shareable link" shows "This link expires in 7 days." and the link
// downloads the ZIP from a browser with no session.
test.describe('checkpoint 4 - shareable export link', () => {
  test.use({ storageState: STORAGE_STATE.userA })
  test.skip(
    !hasUserA() || !hasFullSeed(),
    'needs User A creds + fully seeded project (npm run e2e:seed)',
  )

  test('share link downloads unauthenticated and shows 7-day TTL', async ({ page, browser }) => {
    test.setTimeout(60_000)
    const { fullProjectId } = getSeedContext()!
    await page.goto(`/vault/${fullProjectId}/play`)

    await page.getByRole('button', { name: 'Export pack' }).click()

    const respPromise = page.waitForResponse(
      r => r.url().includes(`/api/vault/${fullProjectId}/export`) && r.request().method() === 'POST',
      { timeout: 20_000 },
    )
    await page.getByRole('button', { name: 'Get shareable link' }).first().click()
    const resp = await respPromise
    expect(resp.status()).toBe(200)
    const url = ((await resp.json()) as { data: { url: string } }).data.url

    // The 7-day helper text renders on success.
    await expect(page.getByText('This link expires in 7 days.')).toBeVisible()

    // Fetch the link from a fresh context with no auth cookies.
    const anon = await browser.newContext()
    try {
      const dl = await anon.request.get(url)
      expect(dl.ok(), 'unauthenticated link returned the ZIP').toBeTruthy()
      const ct = dl.headers()['content-type'] || ''
      expect(ct).toMatch(/zip|octet-stream/i)
    } finally {
      await anon.close()
    }
  })
})
