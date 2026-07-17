/**
 * Local readiness check for the E2E suite: env vars, demo mode, seed file,
 * dev server reachability, and (in --full) live Supabase reachability plus a
 * schema probe for migrations 054 and 057.
 *
 * Run with:  tsx tests/e2e/verify-setup.ts          (quick - no Supabase calls)
 *            tsx tests/e2e/verify-setup.ts --full    (adds the live checks)
 * Wired automatically via package.json's pree2e / pree2e:seed hooks - running
 * `npm run e2e` or `npm run e2e:seed` triggers this first and aborts the real
 * command on any failure, so a misconfigured run stops before it starts
 * instead of failing 40 seconds in with no clue why.
 *
 * Deliberately does NOT check migrations 055/056. Both are privilege/RLS-only
 * changes - no new column or table to probe - and the service-role key used
 * here bypasses both grants and RLS by construction, so there is no read-only
 * signal available. The only real test is attempting an authenticated
 * non-service INSERT and confirming it's rejected; specs/17-messaging-security
 * .spec.ts already does exactly that, safely, with cleanup. Duplicating it
 * here as a check that runs on every seed would be worse, not better - if 056
 * silently isn't applied, this probe's own INSERT would succeed and leave a
 * garbage row in real dm_messages.
 */
import { config as loadEnv } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

for (const f of ['.env.test', '.env.local']) {
  const p = resolve(__dirname, '..', '..', f)
  if (existsSync(p)) loadEnv({ path: p })
}

import { isDemoMode } from './env'
import { hasSeed } from './helpers'

// Deliberately NOT importing hasUserA/hasUserB/hasUserC/hasServiceRole from
// ./env or supabaseAdmin() from ./helpers - they close over CREDS/SUPABASE,
// consts frozen at env.ts's module-evaluation time from whatever process.env
// held at that instant. isDemoMode()/hasSeed() are safe because they read
// process.env (or the seed file) fresh inside the function body on every
// call, not through a frozen intermediate. Everything else below reads
// process.env directly, same as seed.ts's own req() helper - that sidesteps
// any dependency on import-vs-dotenv ordering entirely instead of relying on
// it.

const FULL = process.argv.includes('--full')
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'
const LETTERS = ['A', 'B', 'C'] as const

type CheckOutcome = { pass: boolean; skipped?: boolean; fix?: string }
type Check = { name: string; tier: 'quick' | 'full'; run: () => Promise<CheckOutcome> }

function present(name: string): boolean {
  return Boolean(process.env[name])
}

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// Shared across the reachability check and all three "email resolves" checks
// so a full run does one paginated listUsers() walk, not four.
let cachedEmailMap: Map<string, string> | null = null
async function emailToIdMap(admin: SupabaseClient): Promise<Map<string, string>> {
  if (cachedEmailMap) return cachedEmailMap
  const map = new Map<string, string>()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    for (const u of data.users) if (u.email) map.set(u.email.toLowerCase(), u.id)
    if (data.users.length < 200) break
  }
  cachedEmailMap = map
  return map
}

async function probeColumns(table: string, columns: string, migrationLabel: string): Promise<CheckOutcome> {
  const admin = adminClient()
  if (!admin) return { pass: false, skipped: true }
  const { error } = await admin.from(table).select(columns, { head: true, count: 'exact' })
  return error
    ? { pass: false, fix: `${migrationLabel} not applied on this project - run \`supabase db push\`` }
    : { pass: true }
}

const checks: Check[] = [
  {
    name: '.env.test or .env.local exists',
    tier: 'quick',
    run: async () => {
      const pass = ['.env.test', '.env.local'].some(f => existsSync(resolve(__dirname, '..', '..', f)))
      return { pass, fix: pass ? undefined : 'cp .env.test.example .env.test, then fill it in' }
    },
  },
  {
    name: 'NEXT_PUBLIC_VAULT_DEMO is not "true"',
    tier: 'quick',
    run: async () => {
      const pass = !isDemoMode()
      return {
        pass,
        fix: pass
          ? undefined
          : 'unset NEXT_PUBLIC_VAULT_DEMO and restart `npm run dev` - every DM/presence/Green Room route returns canned success in demo mode, so the suite passes without testing anything',
      }
    },
  },
  ...LETTERS.map(
    (letter): Check => ({
      name: `E2E_USER_${letter} email + password set`,
      tier: 'quick',
      run: async () => {
        const pass = present(`E2E_USER_${letter}_EMAIL`) && present(`E2E_USER_${letter}_PASSWORD`)
        return { pass, fix: pass ? undefined : `set E2E_USER_${letter}_EMAIL and E2E_USER_${letter}_PASSWORD in .env.test` }
      },
    }),
  ),
  {
    name: 'Supabase URL + service role key set',
    tier: 'quick',
    run: async () => {
      const pass = present('NEXT_PUBLIC_SUPABASE_URL') && present('SUPABASE_SERVICE_ROLE_KEY')
      return { pass, fix: pass ? undefined : 'set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.test' }
    },
  },
  {
    name: 'Supabase anon key set',
    tier: 'quick',
    run: async () => {
      const pass = present('NEXT_PUBLIC_SUPABASE_ANON_KEY')
      return {
        pass,
        fix: pass
          ? undefined
          : "set NEXT_PUBLIC_SUPABASE_ANON_KEY - it's usually already in .env.local for `next dev`. Without it, specs/17-messaging-security.spec.ts silently skips itself entirely, which is the one file PR #37 asks reviewers to focus on",
      }
    },
  },
  {
    name: 'Seed file present (tests/e2e/.auth/seed.json)',
    tier: 'quick',
    run: async () => {
      const pass = hasSeed()
      return { pass, fix: pass ? undefined : 'run `npm run e2e:seed`' }
    },
  },
  {
    name: `${BASE_URL} is reachable`,
    tier: 'quick',
    run: async () => {
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 5000)
        await fetch(BASE_URL, { signal: ctrl.signal })
        clearTimeout(timer)
        return { pass: true }
      } catch {
        return {
          pass: false,
          fix: 'run `npm run dev` in another terminal - or it may just be cold-compiling; wait a few seconds and retry before assuming it is broken',
        }
      }
    },
  },
  {
    name: 'Supabase reachable with the service role key',
    tier: 'full',
    run: async () => {
      const admin = adminClient()
      if (!admin) return { pass: false, skipped: true }
      try {
        await emailToIdMap(admin)
        return { pass: true }
      } catch (e) {
        return { pass: false, fix: `Supabase rejected the request: ${e instanceof Error ? e.message : String(e)}` }
      }
    },
  },
  ...LETTERS.map(
    (letter): Check => ({
      name: `E2E_USER_${letter}_EMAIL resolves to a real account`,
      tier: 'full',
      run: async () => {
        const admin = adminClient()
        if (!admin) return { pass: false, skipped: true }
        const email = process.env[`E2E_USER_${letter}_EMAIL`]
        if (!email) return { pass: false, skipped: true }
        try {
          const map = await emailToIdMap(admin)
          return map.has(email.toLowerCase())
            ? { pass: true }
            : { pass: false, fix: `no auth user found for ${email} - check for typos, or create the account` }
        } catch (e) {
          return { pass: false, fix: `Supabase rejected the request: ${e instanceof Error ? e.message : String(e)}` }
        }
      },
    }),
  ),
  {
    name: 'migration 054: dm_threads.status / requester_id',
    tier: 'full',
    run: async () => probeColumns('dm_threads', 'status,requester_id', 'migration 054'),
  },
  {
    name: 'migration 054: artist_profiles.last_seen_at',
    tier: 'full',
    run: async () => probeColumns('artist_profiles', 'last_seen_at', 'migration 054'),
  },
  {
    name: 'migration 057: green_room_posts exists',
    tier: 'full',
    run: async () => probeColumns('green_room_posts', 'id', 'migration 057'),
  },
]

async function main() {
  const active = checks.filter(c => c.tier === 'quick' || FULL)
  console.log(`Checking E2E setup (${FULL ? 'full' : 'quick'})...\n`)

  let failed = 0
  for (const check of active) {
    const result = await check.run()
    if (result.skipped) {
      console.log(`SKIP  ${check.name}  (blocked by missing credentials)`)
    } else if (result.pass) {
      console.log(`PASS  ${check.name}`)
    } else {
      failed++
      console.log(`FAIL  ${check.name}`)
      if (result.fix) console.log(`      -> ${result.fix}`)
    }
  }

  console.log()
  if (failed) {
    console.log(`${failed} check${failed === 1 ? '' : 's'} failed.`)
    process.exit(1)
  }
  console.log(FULL ? 'All checks passed - ready to seed and run.' : 'All checks passed.')
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
