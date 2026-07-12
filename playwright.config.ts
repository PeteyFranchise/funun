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

// E2E_BASE_URL points the whole suite at a target:
//   local dev  -> http://localhost:3000 (default)
//   PR preview -> the Vercel preview URL (needed for the @live specs)
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: './tests/e2e',
  // Uploads and export assembly are slow; give tests room. @live specs raise
  // this further in-file.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // specs mutate one shared seeded project - keep them serial
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
  },

  projects: [
    // Signs in User A and User B once, saving cookie storage states the specs reuse.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Let <audio> start without a gesture so the "audio actually plays"
        // checks (7, 9) can observe currentTime advancing in headless Chromium.
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      },
      dependencies: ['setup'],
    },
  ],
})
