import { test, expect } from '@playwright/test'
import { STORAGE_STATE, hasUserB } from '../env'
import { getSeedContext, hasFullSeed } from '../helpers'

// Checkpoints 5 & 6 - cross-tenant isolation (ASVS V4). As User B, hitting User
// A's export / stems / instrumental routes must 404 - never a signed URL or the
// owner's data. The stems/instrumental paths use User B's OWN prefix so they
// clear the owner-prefix path check (400) and prove it's the ownership lookup
// returning 404, not path validation.
test.describe('checkpoints 5 & 6 - cross-tenant routes blocked', () => {
  test.use({ storageState: STORAGE_STATE.userB })
  test.skip(
    !hasUserB() || !hasFullSeed(),
    'needs User B creds + fully seeded project (npm run e2e:seed)',
  )

  test('5 - User B cannot export User A project', async ({ page }) => {
    const { fullProjectId } = getSeedContext()!
    const resp = await page.request.post(`/api/vault/${fullProjectId}/export`, {
      data: { mode: 'download' },
    })
    expect(resp.status()).toBe(404)
    const json = (await resp.json().catch(() => ({}))) as { data?: { url?: string } }
    expect(json.data?.url, 'never leaks a signed URL to a non-owner').toBeFalsy()
  })

  test('6 - User B cannot write stems or instrumental to User A track', async ({ page }) => {
    const { fullProjectId, fullTrackId, ownerBId } = getSeedContext()!

    const stems = await page.request.post(
      `/api/vault/${fullProjectId}/tracks/${fullTrackId}/stems`,
      { data: { path: `${ownerBId}/${fullProjectId}/x.stems.zip`, size: 1, name: 'x.zip' } },
    )
    expect(stems.status()).toBe(404)

    const instrumental = await page.request.post(
      `/api/vault/${fullProjectId}/tracks/${fullTrackId}/instrumental`,
      { data: { path: `${ownerBId}/${fullProjectId}/x.instrumental.wav`, size: 1, ext: 'wav' } },
    )
    expect(instrumental.status()).toBe(404)
  })
})
