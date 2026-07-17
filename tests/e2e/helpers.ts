import { existsSync, readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SEED_FILE, SUPABASE } from './env'

// The seed context ties every spec to known personas and threads. It comes from
// tests/e2e/.auth/seed.json, written by `npm run e2e:seed`.
export type SeedContext = {
  userAId: string
  userBId: string
  userCId: string
  handleA: string
  handleB: string
  handleC: string
  nameA: string
  nameB: string
  nameC: string
  // Nine pending cold-request threads with A as requester, seeded so A sits at
  // 9 of BASELINE_REQUEST_LIMIT (10). One UI action then proves the wall,
  // instead of driving ten cold requests through the browser.
  pendingRequestThreadIds: string[]
  // The synthetic recipients those threads point at, plus two spares at the end
  // that have NO thread yet - the 10th (allowed) and 11th (walled) targets.
  fillerUserIds: string[]
  // A separate pool of ten senders for the "badge caps at 9+" check. Distinct
  // from fillerUserIds on purpose: that check needs direct threads, and reusing
  // the request fillers would overwrite A's pending requests and silently
  // defuse the rate-limit spec.
  unreadFillerUserIds: string[]
}

export function readSeedFile(): Partial<SeedContext> | null {
  if (!existsSync(SEED_FILE)) return null
  try {
    return JSON.parse(readFileSync(SEED_FILE, 'utf8')) as Partial<SeedContext>
  } catch {
    return null
  }
}

export function getSeedContext(): SeedContext | null {
  const f = readSeedFile()
  if (!f) return null
  if (
    f.userAId &&
    f.userBId &&
    f.userCId &&
    f.handleA &&
    Array.isArray(f.pendingRequestThreadIds) &&
    Array.isArray(f.fillerUserIds) &&
    Array.isArray(f.unreadFillerUserIds)
  ) {
    return f as SeedContext
  }
  return null
}

export function hasSeed(): boolean {
  return Boolean(getSeedContext())
}

/** Throws rather than returning null - for use inside an already-guarded describe. */
export function seed(): SeedContext {
  const c = getSeedContext()
  if (!c) throw new Error('No seed context. Run `npm run e2e:seed`.')
  return c
}

export function supabaseAdmin(): SupabaseClient {
  return createClient(SUPABASE.url, SUPABASE.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
