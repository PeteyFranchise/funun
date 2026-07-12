// Central place that reads the test environment. Nothing here throws at import
// time so Playwright can still collect specs when creds are absent - specs call
// the `has*` guards and skip themselves when something they need is missing.
import { resolve } from 'node:path'

export const AUTH_DIR = resolve(__dirname, '.auth')
export const STORAGE_STATE = {
  userA: resolve(AUTH_DIR, 'userA.json'),
  userB: resolve(AUTH_DIR, 'userB.json'),
}
export const SEED_FILE = resolve(AUTH_DIR, 'seed.json')

export const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'

export const CREDS = {
  userA: {
    email: process.env.E2E_USER_A_EMAIL || '',
    password: process.env.E2E_USER_A_PASSWORD || '',
  },
  userB: {
    email: process.env.E2E_USER_B_EMAIL || '',
    password: process.env.E2E_USER_B_PASSWORD || '',
  },
}

export const SUPABASE = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
}

// A project intentionally seeded with a dangling stems path, for the WR-01
// mid-stream-failure check. Optional - the spec skips when it's unset.
export const WR01_PROJECT_ID = process.env.E2E_WR01_PROJECT_ID || ''

export const hasUserA = () => Boolean(CREDS.userA.email && CREDS.userA.password)
export const hasUserB = () => Boolean(CREDS.userB.email && CREDS.userB.password)
export const hasServiceRole = () => Boolean(SUPABASE.url && SUPABASE.serviceRoleKey)

export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var ${name} (set it in .env.test)`)
  return v
}
