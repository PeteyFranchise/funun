#!/usr/bin/env node
// ─── Post-push verification for migration 228 ────────────────────────────
//
// 228 adds identity provenance to split_sheet_parties and a mint snapshot
// to esign_envelopes, so the pre-mint drift gate can tell "the recipient
// asserted this" from "the inviter copied it".
//
// READ-ONLY. Run AFTER `supabase db push`.
//
// TWO PARTS, and the split matters:
//
//   PART A (service role) — schema and data. Columns exist, the backfill
//   says 'unknown' and not a plausible-but-wrong label, no row claims a
//   token-holder assertion that never happened.
//
//   PART B (ANON key + a real signed-in user) — the GRANT. Migration 115
//   REVOKEd table-wide SELECT on split_sheet_parties and re-GRANTs an
//   explicit column list; its own comment warns a later column "becomes
//   silently unreadable" without being added. If `authenticated` cannot
//   read the new columns the resolver 42501s and THE DRIFT GATE DEGRADES
//   TO ALWAYS-PASSING — the fix ships cosmetic and nothing tells you.
//
//   Part B CANNOT be done with the service-role key. It has BYPASSRLS and
//   owner privileges, so it reads the columns by design and passes even
//   when the GRANT is missing. Same trap verify-115 documents.
//
// Usage:
//   set -a; source .env.local; set +a
//   node scripts/verify-228-identity-provenance.mjs                      # Part A
//   node scripts/verify-228-identity-provenance.mjs --email <e> --password <pw>   # A + B
//
// The account for Part B must be able to see at least one split_sheet_parties
// row (i.e. the initiator of a sheet, or a party on one).

import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const arg = n => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i+1] && !args[i+1].startsWith('--') ? args[i+1] : null }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const email = arg('email'), password = arg('password')

if (!url || !svc) { console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(2) }

const NEW_PARTY_COLS = ['identity_source', 'identity_submitted_at', 'identity_digest_at_approval']
let failed = 0
const ok = m => console.log(`  PASS  ${m}`)
const bad = m => { failed++; console.log(`  FAIL  ${m}`) }

const admin = createClient(url, svc, { auth: { persistSession: false } })

console.log('\n── PART A · schema + data (service role) ─────────────────────')

// A1 — the three new columns exist and are readable at all
const { data: a1, error: e1 } = await admin.from('split_sheet_parties').select(NEW_PARTY_COLS.join(',')).limit(1)
if (e1) bad(`split_sheet_parties is missing a new column — ${e1.code}: ${e1.message}`)
else ok(`split_sheet_parties has ${NEW_PARTY_COLS.join(', ')}`)

// A2 — the backfill is 'unknown', never a populated-but-wrong label
const { data: a2, error: e2 } = await admin.from('split_sheet_parties').select('identity_source')
if (e2) bad(`could not read identity_source — ${e2.message}`)
else {
  const tally = a2.reduce((m, r) => (m[r.identity_source ?? 'NULL'] = (m[r.identity_source ?? 'NULL'] || 0) + 1, m), {})
  console.log(`        rows=${a2.length} tally=${JSON.stringify(tally)}`)
  if ((tally.inviter_supplied ?? 0) > 0) bad(`${tally.inviter_supplied} row(s) labelled 'inviter_supplied' — some already carry a historical correction, so that label is populated, plausible and wrong`)
  else ok(`no row is mislabelled 'inviter_supplied'`)
  if ((tally.token_holder_submitted ?? 0) > 0) bad(`${tally.token_holder_submitted} row(s) claim a token-holder assertion that predates the feature`)
  else ok(`no pre-existing row claims 'token_holder_submitted'`)
  if ((tally.NULL ?? 0) > 0) bad(`${tally.NULL} row(s) have NULL identity_source — backfill incomplete`)
  else ok(`every row has an identity_source`)
}

// A3 — the mint snapshot column exists and is nullable (pre-mint rows have none)
const { error: e3 } = await admin.from('esign_envelopes').select('party_identity_snapshot').limit(1)
if (e3) bad(`esign_envelopes.party_identity_snapshot missing — ${e3.code}: ${e3.message}`)
else ok('esign_envelopes.party_identity_snapshot exists')

console.log('\n── PART B · the GRANT (anon key + signed-in user) ────────────')
if (!email || !password) {
  console.log('  SKIPPED — no --email/--password given.')
  console.log('  THIS IS THE CHECK THAT DECIDES WHETHER THE FIX IS REAL.')
  console.log('  Without it you have not verified the drift gate can read what it gates on.')
  failed++
} else if (!anon) { bad('NEXT_PUBLIC_SUPABASE_ANON_KEY not set'); }
else {
  const user = createClient(url, anon, { auth: { persistSession: false } })
  const { error: signInErr } = await user.auth.signInWithPassword({ email, password })
  if (signInErr) bad(`could not sign in — ${signInErr.message}`)
  else {
    const { data: b1, error: eb } = await user.from('split_sheet_parties').select(NEW_PARTY_COLS.join(',')).limit(1)
    if (eb && eb.code === '42501') bad(`42501 — 'authenticated' CANNOT read the new columns. Migration 115's GRANT list was not extended. THE DRIFT GATE DEGRADES TO ALWAYS-PASSING.`)
    else if (eb) bad(`unexpected error reading as authenticated — ${eb.code}: ${eb.message}`)
    else if (!b1?.length) console.log(`  NOTE  signed in, but this account sees no split_sheet_parties rows — inconclusive; re-run as a sheet initiator`)
    else ok(`'authenticated' can read all three new columns — the GRANT took`)
    await user.auth.signOut()
  }
}

console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED OR SKIPPED`}\n`)
process.exit(failed === 0 ? 0 : 1)
