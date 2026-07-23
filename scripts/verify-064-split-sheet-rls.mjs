#!/usr/bin/env node
// ─── Adversarial re-check for migration 064 (split-sheet RLS recursion) ──
//
// Migration 018 left a mutually recursive RLS policy pair between
// split_sheets and split_sheet_parties. Every authenticated request whose
// query rewrite touched either table's SELECT policies failed with
// SQLSTATE 42P17 `infinite recursion detected in policy for relation ...`,
// which also MASKED the 42501 that migration 062's REVOKE should have
// produced on esign_* writes. Migration 064 cuts the cycle with two
// SECURITY DEFINER helpers (public.no_block() precedent, migration 035).
//
// Run this AFTER pushing 064 to confirm the fix landed and that security
// did not regress. Read-only against your data except for the six write
// probes, which are all EXPECTED TO BE REJECTED — if any of them succeeds,
// that is a critical finding, not a pass.
//
// Usage:
//   node scripts/verify-064-split-sheet-rls.mjs \
//     --email non-party@example.com --password <pw>
//
// The account you pass MUST NOT be the initiator of, or a named party on,
// any split sheet. It is the "outsider" in the checks below.
//
// Env (read from your shell or `.env.local` — NEVER hardcoded here):
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
//   Tip: set -a; source .env.local; set +a; node scripts/verify-064-... --email ...
//
// IMPORTANT: this uses the ANON key plus a real signed-in user JWT — i.e.
// the exact role (`authenticated`) the bug affected. Do NOT substitute the
// service-role key: service_role has BYPASSRLS, never expands policies, and
// therefore passes every check below even when the bug is fully present.

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
    'Usage: node scripts/verify-064-split-sheet-rls.mjs --email <email> --password <pw>\n' +
      'Requires env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY\n' +
      '(e.g. `set -a; source .env.local; set +a` first)\n\n' +
      'The account must NOT be an initiator or named party on any split sheet.'
  )
  process.exit(1)
}

// ─── Sign in to get a real `authenticated` JWT ───────────────────────────
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

const H = {
  apikey: anonKey,
  Authorization: `Bearer ${jwt}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

// A syntactically valid but non-existent UUID. The write probes must be
// rejected on PRIVILEGE, before row matching ever matters — so referencing
// a row that does not exist is fine and keeps the probes non-destructive.
const NIL = '00000000-0000-0000-0000-000000000000'

async function probe(method, pathAndQuery, body) {
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    method,
    headers: H,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, code: json?.code ?? null, message: json?.message ?? text, json }
}

let failures = 0
function report(label, pass, detail) {
  if (!pass) failures++
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}\n        ${detail}`)
}

// ─── Six write probes — every one MUST be rejected with 42501 ────────────
// 062 revoked INSERT/UPDATE/DELETE/TRUNCATE on both tables from
// authenticated+anon. Before 064 these returned 42P17 (the recursion error
// preempted the privilege check at rewrite time). After 064 they must
// return 42501 insufficient_privilege.
console.log('\nSix write probes on the server-owned e-sign tables (expect 42501):')

const writeProbes = [
  ['POST   esign_envelopes', () => probe('POST', 'esign_envelopes', { split_sheet_id: NIL })],
  ['PATCH  esign_envelopes', () => probe('PATCH', `esign_envelopes?id=eq.${NIL}`, { status: 'voided' })],
  ['DELETE esign_envelopes', () => probe('DELETE', `esign_envelopes?id=eq.${NIL}`)],
  [
    'POST   esign_envelope_signers',
    () => probe('POST', 'esign_envelope_signers', { envelope_id: NIL, split_sheet_party_id: NIL }),
  ],
  [
    'PATCH  esign_envelope_signers',
    () => probe('PATCH', `esign_envelope_signers?id=eq.${NIL}`, { status: 'completed' }),
  ],
  ['DELETE esign_envelope_signers', () => probe('DELETE', `esign_envelope_signers?id=eq.${NIL}`)],
]

for (const [label, run] of writeProbes) {
  const r = await run()
  if (r.code === '42P17') {
    report(label, false, `STILL RECURSING — 42P17: ${r.message}  → 064 did not land`)
  } else if (r.code === '42501') {
    report(label, true, `42501 insufficient_privilege (062's REVOKE now surfacing correctly)`)
  } else if (r.status >= 200 && r.status < 300) {
    report(label, false, `WRITE SUCCEEDED (HTTP ${r.status}) — CRITICAL: client writes are not revoked`)
  } else {
    report(label, false, `unexpected HTTP ${r.status} code=${r.code}: ${r.message}`)
  }
}

// ─── One non-party SELECT — MUST return [] , not an error, not rows ──────
console.log('\nNon-party SELECT (expect [] — empty array, no error, no rows):')
{
  const r = await probe('GET', 'esign_envelopes?select=*')
  if (r.code === '42P17') {
    report('GET esign_envelopes', false, `STILL RECURSING — 42P17: ${r.message}  → 064 did not land`)
  } else if (Array.isArray(r.json) && r.json.length === 0) {
    report('GET esign_envelopes', true, '[] — recursion gone, and this outsider sees nothing')
  } else if (Array.isArray(r.json)) {
    report(
      'GET esign_envelopes',
      false,
      `LEAKED ${r.json.length} row(s) — CRITICAL: RLS widened. Confirm this account is truly a non-party first.`
    )
  } else {
    report('GET esign_envelopes', false, `unexpected HTTP ${r.status} code=${r.code}: ${r.message}`)
  }
}

// ─── Extra canaries — the blast radius was never limited to e-sign ───────
// The same 018 cycle is reachable directly (any authenticated read of either
// base table) and via the readiness trigger, because migration 062 taught
// the SECURITY INVOKER calculate_vault_readiness() to read split_sheets and
// migration 001 fires it on tracks/vault_documents/vault_assets/tool_outputs.
console.log('\nBlast-radius canaries (the same cycle, reached by other routes):')
for (const [label, q] of [
  ['GET split_sheets', 'split_sheets?select=id'],
  ['GET split_sheet_parties', 'split_sheet_parties?select=id'],
]) {
  const r = await probe('GET', q)
  if (r.code === '42P17') {
    report(label, false, `STILL RECURSING — 42P17: ${r.message}`)
  } else if (Array.isArray(r.json)) {
    report(label, true, `[] / ${r.json.length} own row(s) — no recursion`)
  } else {
    report(label, false, `unexpected HTTP ${r.status} code=${r.code}: ${r.message}`)
  }
}

console.log(
  '\n  NOTE  The readiness-trigger path cannot be probed read-only. To check it,\n' +
    '        create a track on one of this account\'s own vault projects through the\n' +
    '        app UI and confirm it saves without a 500. Before 064 that INSERT\n' +
    '        returned 42P17 for relation "split_sheets".\n'
)

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
