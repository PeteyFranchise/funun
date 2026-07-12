import { test, expect, type APIResponse } from '@playwright/test'
import AdmZip from 'adm-zip'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import { STORAGE_STATE, hasUserA } from '../env'
import { getSeedContext, hasFullSeed, WR01_PROJECT } from '../helpers'

// Export Pack: the @live sub-10s assembly (checkpoint 3), the PDF real-data
// check (checkpoint 8), and the clean-failure check (WR-01).
test.describe('Export Pack', () => {
  test.use({ storageState: STORAGE_STATE.userA })
  test.skip(
    !hasUserA() || !hasFullSeed(),
    'needs User A creds + fully seeded project (npm run e2e:seed)',
  )

  async function zipEntryNames(resp: APIResponse): Promise<string[]> {
    const buf = Buffer.from(await resp.body())
    return new AdmZip(buf).getEntries().map(e => e.entryName)
  }

  // Checkpoint 3 (@live) - HOBBY-2. The export function has a 10s hard ceiling on
  // Vercel Hobby; it must finish under it and never stream bytes as the body.
  test('@live checkpoint 3 - Download ZIP now completes under 10s with real contents', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    const { fullProjectId } = getSeedContext()!
    await page.goto(`/vault/${fullProjectId}/play`)

    await page.getByRole('button', { name: 'Export pack' }).click()

    const start = Date.now()
    const respPromise = page.waitForResponse(
      r => r.url().includes(`/api/vault/${fullProjectId}/export`) && r.request().method() === 'POST',
      { timeout: 15_000 },
    )
    await page.getByRole('button', { name: 'Download ZIP now' }).first().click()
    const resp = await respPromise
    const elapsedMs = Date.now() - start

    expect(resp.status(), 'export POST did not time out (would be 504)').toBe(200)
    expect(elapsedMs, 'assembled within the Hobby 10s ceiling').toBeLessThan(10_000)

    const json = (await resp.json()) as { data?: { url?: string } }
    expect(json.data?.url, 'export returned a signed URL, not bytes').toBeTruthy()

    const zip = await zipEntryNames(await page.request.get(json.data!.url!))
    expect(zip.some(n => /\.(wav|mp3|flac|zip)$/i.test(n)), 'ZIP has at least one audio file').toBeTruthy()
    expect(zip).toContain('credits-and-splits.pdf')
    expect(zip).toContain('metadata.pdf')
  })

  // Checkpoint 8 - the two generated PDFs carry real credit + metadata values,
  // not blank placeholders. Runs locally (no 10s ceiling on `next dev`).
  test('checkpoint 8 - generated PDFs contain real data', async ({ page }) => {
    test.setTimeout(60_000)
    const { fullProjectId } = getSeedContext()!

    const resp = await page.request.post(`/api/vault/${fullProjectId}/export`, {
      data: { mode: 'download' },
    })
    expect(resp.status()).toBe(200)
    const url = ((await resp.json()) as { data: { url: string } }).data.url

    const zip = new AdmZip(Buffer.from(await (await page.request.get(url)).body()))
    const read = (name: string) => zip.getEntry(name)?.getData()
    const creditsBuf = read('credits-and-splits.pdf')
    const metaBuf = read('metadata.pdf')
    expect(creditsBuf, 'credits-and-splits.pdf present').toBeTruthy()
    expect(metaBuf, 'metadata.pdf present').toBeTruthy()

    const credits = (await pdfParse(creditsBuf!)).text
    // Seeded writer credits (see tests/e2e/seed.ts).
    expect(credits).toContain('Maya Reyes')
    expect(credits).toMatch(/ASCAP/)
    expect(credits).toContain('00000000391')
    expect(credits).toMatch(/60/)

    const meta = (await pdfParse(metaBuf!)).text
    expect(meta).toContain('US-S1Z-26-00001') // ISRC
    expect(meta).toContain('T-000.000.001-0') // ISWC
    expect(meta).toMatch(/92/) // BPM
    expect(meta).toContain('F# minor') // key
    expect(meta).toContain('English') // language
  })

  // WR-01 - if a manifest file is missing from Storage, the route returns a JSON
  // error (502) rather than hanging to the 10s kill. Needs a project owned by
  // User A whose stems/master path points at a deleted object; set
  // E2E_WR01_PROJECT_ID to enable.
  test('WR-01 - export fails cleanly when a source object is missing', async ({ page }) => {
    test.skip(!WR01_PROJECT, 'set E2E_WR01_PROJECT_ID to a project with a dangling storage path')
    const resp = await page.request.post(`/api/vault/${WR01_PROJECT}/export`, {
      data: { mode: 'download' },
    })
    expect([500, 502]).toContain(resp.status())
    const json = (await resp.json()) as { error?: string }
    expect(json.error, 'returns a structured JSON error, not a hang').toMatch(/could not (read|assemble|save)/i)
  })
})
