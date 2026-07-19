/**
 * Deterministic seed for the Phase 11/12 messaging, presence and Green Room
 * suite. Run with:  npm run e2e:seed
 *
 * Wires the three relationships the DM send-gate branches on:
 *   A - the viewer most specs act as, forced `verified: false` so
 *       BASELINE_REQUEST_LIMIT (10) is the limit under test
 *   B - an accepted CONNECTION of A, so A->B sends take the 'direct' path
 *   C - a STRANGER to A, so A->C sends open a cold message request
 *
 * Plus eleven synthetic filler accounts: nine carry a pending cold request from
 * A (putting A at 9 of 10), and two spares carry none - the 10th request should
 * succeed and the 11th should hit the wall. Seeding A to the edge of the limit
 * means one UI action proves it, instead of driving ten requests through a
 * browser.
 *
 * Reset, not teardown - matching the existing suite's contract. Every run wipes
 * the personas' threads/messages/reads/blocks/posts before re-inserting, so a
 * run always starts from the same place. `blocks` especially: one leftover row
 * from a failed run silently turns every later send into a generic 403, which
 * is indistinguishable from a real bug.
 *
 * All writes use the service-role client. Migration 056 revoked authenticated
 * INSERT/UPDATE on dm_threads and dm_messages, so this is the only way in.
 *
 * Needs (in .env.test): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * E2E_USER_{A,B,C}_EMAIL.
 */
import { config as loadEnv } from 'dotenv'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

for (const f of ['.env.test', '.env.local']) {
  const p = resolve(__dirname, '..', '..', f)
  if (existsSync(p)) loadEnv({ path: p })
}

import { AUTH_DIR, SEED_FILE } from './env'

// Eleven request fillers: 9 get a pending request (putting A at 9/10), 2 spares
// stay clean so a spec has an allowed 10th target and a rejected 11th.
const FILLER_COUNT = 11
const SEEDED_PENDING_COUNT = 9
const FILLER_EMAIL = (i: number) => `e2e-filler-${i}@funun-e2e.invalid`

// A separate pool for the "badge caps at 9+" check, which needs ten distinct
// senders (the badge counts unread THREADS, not messages). Kept apart from the
// request fillers so the two fixtures can't corrupt each other - reusing those
// would turn A's pending requests into direct threads and silently defuse the
// rate-limit spec.
const UNREAD_FILLER_COUNT = 10
const UNREAD_FILLER_EMAIL = (i: number) => `e2e-unread-filler-${i}@funun-e2e.invalid`

const FILLER_PASSWORD = 'e2e-Filler-Pass-0!'

const PERSONAS = {
  A: { handle: 'e2e-viewer-a', name: 'E2E Viewer A' },
  B: { handle: 'e2e-connected-b', name: 'E2E Connected B' },
  C: { handle: 'e2e-stranger-c', name: 'E2E Stranger C' },
}

function req(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing ${name} - set it in .env.test`)
  return v
}

async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string> {
  const target = email.toLowerCase()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find(u => (u.email ?? '').toLowerCase() === target)
    if (hit) return hit.id
    if (data.users.length < 200) break
  }
  throw new Error(`No auth user found for ${email}. Create the account first.`)
}

/** Create the synthetic account if absent, else reuse it. Idempotent across runs. */
async function ensureSyntheticUser(admin: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: FILLER_PASSWORD,
    email_confirm: true,
  })
  if (!error && data.user) return data.user.id
  // Already exists (422 email_exists) - look it up instead.
  return findUserIdByEmail(admin, email)
}

async function upsertProfile(
  admin: SupabaseClient,
  id: string,
  fields: { artist_name: string; handle: string; verified?: boolean },
) {
  const { error } = await admin
    .from('artist_profiles')
    .upsert({ id, ...fields }, { onConflict: 'id' })
  if (error) throw new Error(`Profile upsert for ${id} failed: ${error.message}`)
}

/** dm_threads has CHECK (a_id < b_id) - a pair must always map to one row. */
function canonicalPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x]
}

async function insertThread(
  admin: SupabaseClient,
  x: string,
  y: string,
  status: 'direct' | 'pending' | 'declined',
  requesterId: string | null,
): Promise<string> {
  const [a_id, b_id] = canonicalPair(x, y)
  const { data, error } = await admin
    .from('dm_threads')
    .insert({ a_id, b_id, status, requester_id: requesterId })
    .select('id')
    .single()
  if (error) throw new Error(`Thread insert failed: ${error.message}`)
  return (data as { id: string }).id
}

/**
 * Wipe every row these users participate in. Order matters: dm_messages and
 * dm_thread_reads reference dm_threads, so they go first.
 */
async function resetFor(admin: SupabaseClient, userIds: string[]) {
  const list = `(${userIds.join(',')})`

  const { data: threads } = await admin
    .from('dm_threads')
    .select('id')
    .or(`a_id.in.${list},b_id.in.${list}`)
  const threadIds = ((threads ?? []) as { id: string }[]).map(t => t.id)

  if (threadIds.length) {
    await admin.from('dm_messages').delete().in('thread_id', threadIds)
    await admin.from('dm_thread_reads').delete().in('thread_id', threadIds)
    await admin.from('dm_threads').delete().in('id', threadIds)
  }

  // A leftover block row poisons every later send with a generic 403 that
  // looks exactly like a real delivery failure. Always clear both directions.
  await admin.from('blocks').delete().or(`blocker_id.in.${list},blocked_id.in.${list}`)
  await admin.from('connections').delete().or(`requester_id.in.${list},addressee_id.in.${list}`)
  await admin.from('green_room_posts').delete().in('author_id', userIds)
}

async function main() {
  const url = req('NEXT_PUBLIC_SUPABASE_URL')
  const key = req('SUPABASE_SERVICE_ROLE_KEY')
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const userAId = await findUserIdByEmail(admin, req('E2E_USER_A_EMAIL'))
  const userBId = await findUserIdByEmail(admin, req('E2E_USER_B_EMAIL'))
  const userCId = await findUserIdByEmail(admin, req('E2E_USER_C_EMAIL'))

  const fillerUserIds: string[] = []
  for (let i = 0; i < FILLER_COUNT; i++) {
    fillerUserIds.push(await ensureSyntheticUser(admin, FILLER_EMAIL(i)))
  }

  const unreadFillerUserIds: string[] = []
  for (let i = 0; i < UNREAD_FILLER_COUNT; i++) {
    unreadFillerUserIds.push(await ensureSyntheticUser(admin, UNREAD_FILLER_EMAIL(i)))
  }

  await resetFor(admin, [userAId, userBId, userCId, ...fillerUserIds, ...unreadFillerUserIds])

  // A must be unverified or the limit under test becomes VERIFIED_REQUEST_LIMIT
  // (30) and the wall spec silently stops testing the wall.
  await upsertProfile(admin, userAId, {
    artist_name: PERSONAS.A.name,
    handle: PERSONAS.A.handle,
    verified: false,
  })
  await upsertProfile(admin, userBId, { artist_name: PERSONAS.B.name, handle: PERSONAS.B.handle })
  await upsertProfile(admin, userCId, { artist_name: PERSONAS.C.name, handle: PERSONAS.C.handle })
  for (let i = 0; i < FILLER_COUNT; i++) {
    await upsertProfile(admin, fillerUserIds[i], {
      artist_name: `E2E Filler ${i}`,
      handle: `e2e-filler-${i}`,
    })
  }
  for (let i = 0; i < UNREAD_FILLER_COUNT; i++) {
    await upsertProfile(admin, unreadFillerUserIds[i], {
      artist_name: `E2E Unread Filler ${i}`,
      handle: `e2e-unread-filler-${i}`,
    })
  }

  // A <-> B accepted: the only connection. Everything else stays a stranger so
  // the cold-request path is the default.
  const { error: connErr } = await admin
    .from('connections')
    .insert({ requester_id: userAId, addressee_id: userBId, status: 'accepted' })
  if (connErr) throw new Error(`Connection insert failed: ${connErr.message}`)

  // Nine pending cold requests from A. countRecentRequests() counts pending
  // threads where requester_id = A within a rolling 7 days, so freshly-inserted
  // rows all land inside the window.
  const pendingRequestThreadIds: string[] = []
  for (let i = 0; i < SEEDED_PENDING_COUNT; i++) {
    pendingRequestThreadIds.push(
      await insertThread(admin, userAId, fillerUserIds[i], 'pending', userAId),
    )
  }

  mkdirSync(AUTH_DIR, { recursive: true })
  writeFileSync(
    SEED_FILE,
    JSON.stringify(
      {
        userAId,
        userBId,
        userCId,
        handleA: PERSONAS.A.handle,
        handleB: PERSONAS.B.handle,
        handleC: PERSONAS.C.handle,
        nameA: PERSONAS.A.name,
        nameB: PERSONAS.B.name,
        nameC: PERSONAS.C.name,
        pendingRequestThreadIds,
        fillerUserIds,
        unreadFillerUserIds,
      },
      null,
      2,
    ),
  )

  console.log(`Seeded: A=${userAId} B=${userBId} C=${userCId}`)
  console.log(`  A<->B connection: accepted`)
  console.log(`  A pending cold requests: ${pendingRequestThreadIds.length} of 10 (BASELINE_REQUEST_LIMIT)`)
  console.log(`  spare request targets: ${FILLER_COUNT - SEEDED_PENDING_COUNT}`)
  console.log(`Wrote ${SEED_FILE}`)
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
