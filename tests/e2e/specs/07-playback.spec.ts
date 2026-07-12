import { test, expect } from '@playwright/test'
import { STORAGE_STATE, hasUserA } from '../env'
import { getSeedContext, hasFullSeed, isSignedStorageUrl } from '../helpers'

// Checkpoint 7 - the playback room actually plays the master (signed-URL fix).
// Previously raw storage paths were passed as the audio URL and nothing played.
test.describe('checkpoint 7 - playback room plays the master', () => {
  test.use({ storageState: STORAGE_STATE.userA })
  test.skip(
    !hasUserA() || !hasFullSeed(),
    'needs User A creds + fully seeded project (npm run e2e:seed)',
  )

  test('master audio has a signed src and advances on play', async ({ page }) => {
    test.setTimeout(60_000)
    const { fullProjectId } = getSeedContext()!
    await page.goto(`/vault/${fullProjectId}/play`)

    const audio = page.locator('audio')
    const src = await audio.getAttribute('src')
    expect(isSignedStorageUrl(src), 'audio src is a signed URL, not a raw storage path').toBeTruthy()

    // The signed URL must actually resolve to playable audio (metadata loads).
    await expect
      .poll(async () => audio.evaluate((el: HTMLAudioElement) => el.readyState), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1)
    expect(await audio.evaluate((el: HTMLAudioElement) => el.error === null)).toBeTruthy()

    await page.getByRole('button', { name: 'play', exact: true }).click()
    await expect
      .poll(async () => audio.evaluate((el: HTMLAudioElement) => el.currentTime), { timeout: 15_000 })
      .toBeGreaterThan(0)
  })
})
