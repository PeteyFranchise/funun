#!/usr/bin/env node
// ─── Adversarial re-check for migration 115 (split_sheet_parties token) ──
//
// Before 115, split_sheet_parties relied on the default table-wide SELECT
// grant filtered only by RLS. RLS is ROW-level, not COLUMN-level, so the
// "Initiator sees all parties" policy returned every co-party row INCLUDING
// the plaintext approval_token — which /approve/[token] treats as authz.
// Migration 115 REVOKEs the table-wide SELECT and re-GRANTs every column
// EXCEPT approval_token, so an authenticated client can no longer read the
// token while row-level visibility is unchanged.
//
// Run this AFTER pushing 115 to confirm the fix landed and did not break
// legitimate reads. It is READ-ONLY.
//
// Usage:
//   node scripts/verify-115-split-sheet-token-privacy.mjs \
//     --email initiator@example.com --password <pw>
//
// The account you pass MUST be the INITIATOR of at least one split sheet that
// has co-parties (so there is a token that must NOT leak). This is the exact
// role the disclosure affected.
//
// Env (from your shell or `.env.local` — NEVER hardcoded):
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
//   Tip: set -a; source .env.local; set +a; node scripts/verify-115-... --email ...
//
// IMPORTANT: uses the ANON key + a real signed-in user JWT (role
// `authenticated`) — the exact surface the bug affected. Do NOT use the
// service-role key: it has BYPASSRLS + owner privileges and reads the token
// by design, so it passes even when the bug is fully present.

const args = process.argv.slice(2)
function arg(name) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const email = arg('email')
const password = arg('password')

if (!url || !anonKey || !email || !password) {
  console.error(
    'Usage: node scripts/verify-115-split-sheet-token-privacy.mjs --email <email> --password <pw>\n' +
      'Requires env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY\n' +
      '(e.g. `set -a; source .env.local; set +a` first)\n\n' +
      'The account MUST be the initiator of a split sheet that has co-parties.'
  )
  process.exit(1)
}

const signIn = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: anonKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
if (!signIn.ok) {
  console.error(`Sign-in failed (${signIn.status}): ${await signIn.text()}`)
  process.exit(1)
}
const { access_token: jwt } = await signIn.json()

const H = { apikey: anonKey, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }

async function probe(pathAndQuery) {
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, { method: 'GET', headers: H })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* non-JSON */
  }
  return { status: res.status, code: json?.code ?? null, message: json?.message ?? text, json }
}

let failures = 0
function report(label, pass, detail) {
  if (!pass) failures++
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}\n        ${detail}`)
}

// A response "leaks" if it is an array whose rows carry a non-null
// approval_token — the exact disclosure 115 closes.
function leaksToken(json) {
  return Array.isArray(json) && json.some(r => r && r.approval_token != null)
}

console.log('\nToken-disclosure probes as the INITIATOR (must NOT return any approval_token):')

// 1. Explicitly request the token column — expect 42501 (no column grant).
{
  const r = await probe('split_sheet_parties?select=id,approval_token')
  if (r.code === '42501') {
    report('GET split_sheet_parties?select=approval_token', true, '42501 permission denied — token column is not granted')
  } else if (leaksToken(r.json)) {
    report('GET split_sheet_parties?select=approval_token', false, `LEAKED token(s) — CRITICAL: migration 115 did not land`)
  } else if (Array.isArray(r.json)) {
    report('GET split_sheet_parties?select=approval_token', true, 'no approval_token present in the response')
  } else {
    report('GET split_sheet_parties?select=approval_token', false, `unexpected HTTP ${r.status} code=${r.code}: ${r.message}`)
  }
}

// 2. select=* — the wildcard must not smuggle the token out either.
{
  const r = await probe('split_sheet_parties?select=*')
  if (r.code === '42501') {
    report('GET split_sheet_parties?select=*', true, '42501 — wildcard expansion hits the ungranted token column')
  } else if (leaksToken(r.json)) {
    report('GET split_sheet_parties?select=*', false, `LEAKED token(s) via select=* — CRITICAL`)
  } else if (Array.isArray(r.json)) {
    report('GET split_sheet_parties?select=*', true, 'wildcard returned rows without approval_token')
  } else {
    report('GET split_sheet_parties?select=*', false, `unexpected HTTP ${r.status} code=${r.code}: ${r.message}`)
  }
}

// 3. Safe columns — row visibility must be INTACT (the fix must not blind the app).
console.log('\nLegitimate read (safe columns) — must still work:')
{
  const r = await probe('split_sheet_parties?select=id,name,split_percentage,approval_status')
  if (Array.isArray(r.json) && r.json.length > 0) {
    report('GET split_sheet_parties?select=<safe cols>', true, `${r.json.length} own party row(s) still readable`)
  } else if (Array.isArray(r.json)) {
    report(
      'GET split_sheet_parties?select=<safe cols>',
      true,
      '[] — no rows. If this account really initiates a sheet with parties, investigate; otherwise pass a proper initiator account.'
    )
  } else {
    report('GET split_sheet_parties?select=<safe cols>', false, `BROKE legitimate read — HTTP ${r.status} code=${r.code}: ${r.message}`)
  }
}

console.log(failures === 0 ? '\nAll checks passed — token is service-role-only, safe reads intact.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
