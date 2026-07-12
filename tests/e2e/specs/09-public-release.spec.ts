import { test, expect } from '@playwright/test'
import { getSeedContext, hasFullSeed, isSignedStorageUrl } from '../helpers'

// Checkpoint 9 (also covers CR-02) - the public Now Playing page streams the
// master via a signed URL for a logged-out visitor, and hides owner-only UI
// (no "Files" section, no "Readiness x/100" widget).
test.describe('checkpoint 9 - public Now Playing page', () => {
  // Force an anonymous context - no auth cookies.
  test.use({ storageState: { cookies: [], origins: [] } })
  test.skip(!hasFullSeed(), 'needs a fully seeded public project (npm run e2e:seed)')

  test('streams audio logged-out and hides owner-only UI', async ({ page }) => {
    test.setTimeout(60_000)
    const { fullProjectId } = getSeedContext()!
    await page.goto(`/r/${fullProjectId}`)

    // Public release renders (not a 404 / notFound).
    await expect(page.getByText('Now Playing', { exact: false }).first()).toBeVisible()

    const audio = page.locator('audio')
    const src = await audio.getAttribute('src')
    expect(isSignedStorageUrl(src), 'public master src is a signed URL').toBeTruthy()

    await page.getByRole('button', { name: 'play', exact: true }).click()
    await expect
      .poll(async () => audio.evaluate((el: HTMLAudioElement) => el.currentTime), { timeout: 15_000 })
      .toBeGreaterThan(0)

    // Owner-only UI must never render for the public viewer.
    await expect(page.getByText('Files', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/Readiness\s+\d+\/100/)).toHaveCount(0)
  })
})
