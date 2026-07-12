import { test as setup, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { AUTH_DIR, STORAGE_STATE, CREDS, hasUserA, hasUserB } from './env'

// The setup project runs before everything else and saves a cookie storage
// state per account. Signing in through the real /signin form sets the exact
// @supabase/auth-helpers-nextjs cookies the server routes read - a raw bearer
// token wouldn't satisfy createRouteHandlerClient({ cookies }).
//
// When creds are absent we still write an EMPTY-but-valid storage state so the
// dependent specs' contexts can be created; those specs skip themselves.

const EMPTY_STATE = { cookies: [], origins: [] }

function ensureAuthDir() {
  mkdirSync(AUTH_DIR, { recursive: true })
}

async function signIn(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
) {
  await page.goto('/signin')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  // The form redirects to `next ?? '/vault'` on success.
  await page.waitForURL(/\/vault/, { timeout: 30_000 })
}

setup('authenticate as User A (owner)', async ({ page }) => {
  ensureAuthDir()
  if (!hasUserA()) {
    writeFileSync(STORAGE_STATE.userA, JSON.stringify(EMPTY_STATE))
    setup.skip(true, 'E2E_USER_A_EMAIL/PASSWORD not set')
    return
  }
  await signIn(page, CREDS.userA.email, CREDS.userA.password)
  await expect(page).toHaveURL(/\/vault/)
  await page.context().storageState({ path: STORAGE_STATE.userA })
})

setup('authenticate as User B (cross-tenant)', async ({ page }) => {
  ensureAuthDir()
  if (!hasUserB()) {
    writeFileSync(STORAGE_STATE.userB, JSON.stringify(EMPTY_STATE))
    setup.skip(true, 'E2E_USER_B_EMAIL/PASSWORD not set')
    return
  }
  await signIn(page, CREDS.userB.email, CREDS.userB.password)
  await expect(page).toHaveURL(/\/vault/)
  await page.context().storageState({ path: STORAGE_STATE.userB })
})
