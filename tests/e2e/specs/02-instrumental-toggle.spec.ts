import { test, expect } from '@playwright/test'
import { STORAGE_STATE, hasUserA } from '../env'
import { getSeedContext, hasUploadSeed, isSignedStorageUrl } from '../helpers'
import { ensureWav } from '../fixtures'

// Checkpoint 2 - instrumental upload + Master/Instrumental source swap.
// Upload an instrumental; its row flips to "Uploaded", the Master/Instrumental
// toggle appears (hidden before an instrumental exists), and toggling swaps the
// <audio> src between the master and instrumental signed URLs.
test.describe('checkpoint 2 - instrumental upload + toggle', () => {
  test.use({ storageState: STORAGE_STATE.userA })
  test.skip(
    !hasUserA() || !hasUploadSeed(),
    'needs User A creds + seeded upload project (npm run e2e:seed)',
  )

  test('uploads instrumental and swaps playback source', async ({ page }) => {
    test.setTimeout(120_000)
    const { uploadProjectId } = getSeedContext()!
    await page.goto(`/vault/${uploadProjectId}/play`)

    // Toggle is hidden before any instrumental exists.
    await expect(page.getByRole('button', { name: 'Instrumental', exact: true })).toHaveCount(0)

    // Instrumental input (accepts audio; disambiguated from the .zip stems input by .flac).
    const input = page.locator('input[type="file"][accept*=".flac"]')
    await expect(input).toBeAttached()
    await input.setInputFiles(ensureWav(2, 'instrumental'))

    // Row flips to "Uploaded".
    await expect(page.getByText('Uploaded', { exact: true }).first()).toBeVisible({ timeout: 60_000 })

    // Toggle now present.
    const master = page.getByRole('button', { name: 'Master', exact: true })
    const instrumental = page.getByRole('button', { name: 'Instrumental', exact: true })
    await expect(master).toBeVisible()
    await expect(instrumental).toBeVisible()

    const audio = page.locator('audio')
    const masterSrc = await audio.getAttribute('src')
    expect(isSignedStorageUrl(masterSrc)).toBeTruthy()

    await instrumental.click()
    await expect
      .poll(async () => audio.getAttribute('src'))
      .not.toBe(masterSrc)
    const instrumentalSrc = await audio.getAttribute('src')
    expect(isSignedStorageUrl(instrumentalSrc)).toBeTruthy()

    await master.click()
    await expect.poll(async () => audio.getAttribute('src')).toBe(masterSrc)
  })
})
