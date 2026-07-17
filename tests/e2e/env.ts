// Central place that reads the test environment. Nothing here throws at import
// time so Playwright can still collect specs when creds are absent - specs call
// the `has*` guards and skip themselves when something they need is missing.
import { resolve } from 'node:path'

export const AUTH_DIR = resolve(__dirname, '.auth')
export const STORAGE_STATE = {
  userA: resolve(AUTH_DIR, 'userA.json'),
  userB: resolve(AUTH_DIR, 'userB.json'),
  userC: resolve(AUTH_DIR, 'userC.json'),
}
export const SEED_FILE = resolve(AUTH_DIR, 'seed.json')

export const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'

// Three personas, because the DM send-gate has three distinct paths and each
// needs a different relationship to User A:
//   A - the viewer most specs act as
//   B - CONNECTED to A, so A->B sends take the 'direct' path
//   C - a STRANGER to A, so A->C sends take the cold 'request' path
export const CREDS = {
  userA: {
    email: process.env.E2E_USER_A_EMAIL || '',
    password: process.env.E2E_USER_A_PASSWORD || '',
  },
  userB: {
    email: process.env.E2E_USER_B_EMAIL || '',
    password: process.env.E2E_USER_B_PASSWORD || '',
  },
  userC: {
    email: process.env.E2E_USER_C_EMAIL || '',
    password: process.env.E2E_USER_C_PASSWORD || '',
  },
}

export const SUPABASE = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
}

export const hasUserA = () => Boolean(CREDS.userA.email && CREDS.userA.password)
export const hasUserB = () => Boolean(CREDS.userB.email && CREDS.userB.password)
export const hasUserC = () => Boolean(CREDS.userC.email && CREDS.userC.password)
export const hasServiceRole = () => Boolean(SUPABASE.url && SUPABASE.serviceRoleKey)

// Every DM / presence / Green Room route short-circuits to a canned success
// payload when this is on. A suite that runs against demo mode passes without
// touching a single real code path - the worst possible outcome, because it
// looks exactly like a real green run. Setup fails loudly rather than skipping.
export const isDemoMode = () => process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var ${name} (set it in .env.test)`)
  return v
}
