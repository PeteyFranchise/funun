import { test, expect } from '@playwright/test'
import { STORAGE_STATE, hasUserA } from '../env'
import { getSeedContext, hasUploadSeed } from '../helpers'
import { ensureStemsZip } from '../fixtures'

// Checkpoint 1 (@live) - HOBBY-1.
// Upload a stems ZIP over 4.5MB from a project the tester owns. The upload must
// go direct-to-Supabase-Storage (bypassing Vercel's serverless 4.5MB body
// ceiling), so there must be NO 413 FUNCTION_PAYLOAD_TOO_LARGE, the resumable
// requests must hit Supabase (never a *.vercel.app route), and "Download stems"
// must appear once it lands.
//
// Only meaningful on a real Vercel deployment - run with `npm run e2e:live`
// against E2E_BASE_URL set to the PR preview. Set E2E_STEMS_MB=240 to also
// exercise the ~250MB upper bound.
const STEMS_MB = Number(process.env.E2E_STEMS_MB || 8)

test.describe('@live checkpoint 1 - stems ZIP upload over 4.5MB', () => {
  test.use({ storageState: STORAGE_STATE.userA })
  test.skip(
    !hasUserA() || !hasUploadSeed(),
    'needs User A creds + seeded upload project (npm run e2e:seed)',
  )

  test('uploads a >4.5MB stems ZIP direct-to-storage with no 413', async ({ page }) => {
    test.setTimeout(300_000)
    const { uploadProjectId } = getSeedContext()!

    const over413: string[] = []
    const resumableHosts = new Set<string>()
    page.on('response', res => {
      const url = res.url()
      if (res.status() === 413) over413.push(url)
      if (url.includes('/storage/v1/upload/resumable')) {
        resumableHosts.add(new URL(url).host)
      }
    })

    await page.goto(`/vault/${uploadProjectId}/play`)

    // Hidden stems input (accepts .zip). Setting files triggers the tus upload.
    const stemsInput = page.locator('input[type="file"][accept*=".zip"]')
    await expect(stemsInput).toBeAttached()
    await stemsInput.setInputFiles(ensureStemsZip(STEMS_MB))

    // Success surfaces as the separate "Download stems" link after router.refresh().
    await expect(page.getByRole('link', { name: /download stems/i })).toBeVisible({
      timeout: 240_000,
    })

    expect(over413, 'no 413 FUNCTION_PAYLOAD_TOO_LARGE').toEqual([])
    expect(resumableHosts.size, 'upload used the resumable Storage endpoint').toBeGreaterThan(0)
    expect(
      [...resumableHosts].every(h => !h.endsWith('vercel.app')),
      'stems bytes bypassed the Vercel serverless route',
    ).toBeTruthy()
  })
})
