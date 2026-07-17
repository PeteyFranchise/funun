import { test, expect } from '@playwright/test'
import { STORAGE_STATE, hasUserA, hasUserB } from '../env'
import { hasSeed, seed } from '../helpers'
import { findThreadId } from '../messaging-helpers'

// PR #37 UAT 4: "Docked widget persists across navigation."
//
// The dock lives in ArtistLayoutClient, which holds dockedThreadId in state and
// never unmounts across a client-side route change. Unit tests can't see that -
// it's a property of the layout's position in the tree, not of any function. So
// this drives real SPA navigation and watches the dock survive it.
//
// The dock is wrapped in `hidden lg:block`, hence the 1440x900 viewport in
// playwright.config.ts. Below lg it renders but is invisible, which would make
// a naive toBeVisible() fail for reasons that have nothing to do with state.

test.describe('docked message widget', () => {
  test.use({ storageState: STORAGE_STATE.userA })

  test.skip(
    !hasUserA() || !hasUserB() || !hasSeed(),
    'needs User A + User B creds and a seeded fixture (npm run e2e:seed)',
  )

  test('UAT 4 - the dock survives navigation between sections', async ({ page }) => {
    const { userAId, userBId, nameB } = seed()

    await page.goto(`/messages?with=${userBId}`)

    // The pop-out affordance only renders once a thread actually exists, so a
    // first message may be needed to bring it into being.
    const collapse = page.getByRole('button', { name: 'Collapse conversation' })
    if (!(await collapse.isVisible().catch(() => false))) {
      await page.getByPlaceholder('Write a message…').fill('e2e dock bootstrap')
      await page.getByRole('button', { name: 'Send' }).click()
      await expect(collapse).toBeVisible({ timeout: 30_000 })
    }

    const threadId = await findThreadId(userAId, userBId)
    expect(threadId, 'a thread should exist before docking').not.toBeNull()

    await collapse.click()

    const dock = page.getByTestId('docked-widget')
    await expect(dock).toBeVisible()
    await expect(dock).toHaveAttribute('data-thread-id', threadId!)
    await expect(dock).toContainText(nameB)

    // Navigate by clicking real nav links, not page.goto - a full page load
    // would remount the layout and reset the state, which is precisely the
    // thing under test. This has to be a client-side transition to mean
    // anything.
    await page.getByRole('link', { name: 'The Green Room' }).click()
    await page.waitForURL(/\/green-room/)
    await expect(dock, 'the dock must survive an SPA nav to Green Room').toBeVisible()
    await expect(dock).toHaveAttribute('data-thread-id', threadId!)

    await page.getByRole('link', { name: /vault/i }).first().click()
    await page.waitForURL(/\/vault/)
    await expect(dock, 'and survive a second nav to the vault').toBeVisible()
    await expect(dock).toHaveAttribute('data-thread-id', threadId!)
  })

  test('a full page load drops the dock - it is session state, not persisted', async ({ page }) => {
    const { userBId } = seed()

    await page.goto(`/messages?with=${userBId}`)
    const collapse = page.getByRole('button', { name: 'Collapse conversation' })
    if (!(await collapse.isVisible().catch(() => false))) {
      await page.getByPlaceholder('Write a message…').fill('e2e dock bootstrap')
      await page.getByRole('button', { name: 'Send' }).click()
      await expect(collapse).toBeVisible({ timeout: 30_000 })
    }
    await collapse.click()
    await expect(page.getByTestId('docked-widget')).toBeVisible()

    // Documents the actual contract. Without this, "persists across navigation"
    // could be read as "persists forever", and a future change that pushed the
    // dock into localStorage would look like an improvement rather than a
    // behaviour change nobody agreed to.
    await page.reload()
    await expect(page.getByTestId('docked-widget')).toBeHidden()
  })
})
