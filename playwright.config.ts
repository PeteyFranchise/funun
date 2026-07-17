import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Test config lives in .env.test (gitignored). Fall back to .env.local so a
// developer who already has the app env set up locally doesn't have to
// duplicate the Supabase keys.
for (const file of ['.env.test', '.env.local']) {
  const p = resolve(__dirname, file)
  if (existsSync(p)) loadEnv({ path: p })
}

// E2E_BASE_URL points the whole suite at a target. There is no webServer block:
// `next dev` must already be running against it.
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'

// The docked widget is `hidden lg:block` and /messages only goes two-pane at
// lg, so every spec assumes a viewport above that breakpoint.
const VIEWPORT = { width: 1440, height: 900 }

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // Specs mutate one shared set of seeded threads - keep them serial.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    viewport: VIEWPORT,
  },

  projects: [
    // Signs in all three personas once, saving the cookie storage states the
    // specs reuse.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORT },
      dependencies: ['setup'],
    },
  ],
})
