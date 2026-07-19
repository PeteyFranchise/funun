#!/usr/bin/env node
// ─── Provision (or promote) a test admin account ─────────────────────
// Admin capability is gated on auth `app_metadata.is_admin === true`
// (lib/admin/gate.ts). No UI can set that flag — only the service role.
// This script creates the user if absent (email pre-confirmed) or
// promotes an existing user, idempotently.
//
// Usage:
//   node scripts/provision-test-admin.mjs --email admin-test@example.com [--password <pw>] [--demote]
//
// Env (read from your shell or `.env.local` — NEVER hardcoded here):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   Tip: set -a; source .env.local; set +a; node scripts/provision-test-admin.mjs --email ...
//
// Safety: run this against a development/test project. Promoting real
// production users should go through whatever review your team uses.

import { randomBytes } from 'node:crypto'

const args = process.argv.slice(2)
function arg(name) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null
}
const email = arg('email')
const demote = args.includes('--demote')
let password = arg('password')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!email || !url || !serviceKey) {
  console.error(
    'Usage: node scripts/provision-test-admin.mjs --email <email> [--password <pw>] [--demote]\n' +
      'Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY\n' +
      '(e.g. `set -a; source .env.local; set +a` first)'
  )
  process.exit(1)
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
}

async function findUserByEmail(target) {
  // GoTrue admin list supports pagination; the email filter param varies by
  // version, so filter client-side across pages to stay version-proof.
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers })
    if (!res.ok) throw new Error(`List users failed: ${res.status} ${await res.text()}`)
    const body = await res.json()
    const users = body.users ?? body
    if (!Array.isArray(users) || users.length === 0) return null
    const hit = users.find(u => (u.email ?? '').toLowerCase() === target.toLowerCase())
    if (hit) return hit
    if (users.length < 200) return null
  }
  return null
}

const existing = await findUserByEmail(email)
const isAdmin = !demote

if (existing) {
  const res = await fetch(`${url}/auth/v1/admin/users/${existing.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      app_metadata: { ...existing.app_metadata, is_admin: isAdmin },
      ...(password ? { password } : {}),
    }),
  })
  if (!res.ok) throw new Error(`Update failed: ${res.status} ${await res.text()}`)
  console.log(
    `${isAdmin ? 'Promoted' : 'Demoted'} existing user ${email} (${existing.id}) — is_admin=${isAdmin}` +
      (password ? '; password updated' : '')
  )
} else {
  if (demote) {
    console.error(`No user found for ${email} — nothing to demote.`)
    process.exit(1)
  }
  password = password ?? `Uat-${randomBytes(9).toString('base64url')}`
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: { is_admin: true },
    }),
  })
  if (!res.ok) throw new Error(`Create failed: ${res.status} ${await res.text()}`)
  const user = await res.json()
  console.log(`Created admin test user ${email} (${user.id}) — is_admin=true`)
  console.log(`Password: ${password}`)
  console.log('Store it in your password manager; this is the only time it is printed.')
}

console.log('\nVerify: sign in at /signin, then /admin/green-room-placements should render (non-admins are redirected).')
