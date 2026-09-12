import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const harnessDir = path.join(
  root,
  '.planning/quick/260912-beta-security-migration-harness'
)
const candidates = [
  {
    version: '214',
    file: '214_verified_invite_claim_hardening.sql',
    definers: 2,
    browserRevokes: 2,
    serviceGrants: 1,
  },
  {
    version: '215',
    file: '215_atomic_checkout_creation.sql',
    definers: 4,
    browserRevokes: 4,
    serviceGrants: 4,
  },
  {
    version: '216',
    file: '216_atomic_esign_mint_claims.sql',
    definers: 4,
    browserRevokes: 4,
    serviceGrants: 4,
  },
  {
    version: '217',
    file: '217_atomic_playbook_operations.sql',
    definers: 3,
    browserRevokes: 3,
    serviceGrants: 3,
  },
]
const probes = [
  'PRE-APPLY-GATE.sql',
  'POST-APPLY-VERIFY.sql',
  'FAILED-APPLY-CHECK.sql',
]

function fail(message) {
  throw new Error(message)
}

function count(text, pattern) {
  return [...text.matchAll(pattern)].length
}

function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, '')
}

function stripStrings(sql) {
  return sql.replace(/'(?:''|[^'])*'/g, "''")
}

const migrationFiles = readdirSync(path.join(root, 'supabase/migrations'))
for (const candidate of candidates) {
  const duplicates = migrationFiles.filter(file => file.startsWith(`${candidate.version}_`))
  if (duplicates.length !== 1 || duplicates[0] !== candidate.file) {
    fail(`Migration ${candidate.version} must resolve only to ${candidate.file}`)
  }
}

const runbook = readFileSync(path.join(harnessDir, 'APPLY-SEQUENCE.md'), 'utf8')
const probeSql = Object.fromEntries(
  probes.map(file => [file, readFileSync(path.join(harnessDir, file), 'utf8')])
)

for (const candidate of candidates) {
  const fullPath = path.join(root, 'supabase/migrations', candidate.file)
  const sql = readFileSync(fullPath, 'utf8')
  const executable = stripComments(sql).trim()
  const digest = createHash('sha256').update(sql).digest('hex')

  if (!sql.includes('HUMAN-GATED')) fail(`${candidate.file} lost its HUMAN-GATED marker`)
  if (!executable.startsWith('BEGIN;')) fail(`${candidate.file} must begin an explicit transaction`)
  if (!executable.endsWith('COMMIT;')) fail(`${candidate.file} must commit its explicit transaction`)
  if (/CREATE\s+(?:TABLE|UNIQUE\s+INDEX)\s+IF\s+NOT\s+EXISTS/i.test(executable)) {
    fail(`${candidate.file} silently accepts a target table/index collision`)
  }
  if (/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i.test(executable)) {
    fail(`${candidate.file} silently accepts a target column collision`)
  }
  if (count(executable, /SECURITY DEFINER/g) !== candidate.definers) {
    fail(`${candidate.file} has an unexpected SECURITY DEFINER inventory`)
  }
  if (count(executable, /SET search_path = ''/g) !== candidate.definers) {
    fail(`${candidate.file} has a definer without an empty search_path`)
  }
  if (
    count(
      executable,
      /REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC, anon, authenticated(?:, service_role)?;/g
    ) !== candidate.browserRevokes
  ) {
    fail(`${candidate.file} does not explicitly revoke every definer from browser roles`)
  }
  if (
    count(executable, /GRANT EXECUTE ON FUNCTION[\s\S]*?TO service_role;/g) !==
    candidate.serviceGrants
  ) {
    fail(`${candidate.file} has an unexpected service-role grant inventory`)
  }
  if (!runbook.includes(`| \`${candidate.version}\` | \`supabase/migrations/${candidate.file}\` | \`${digest}\` |`)) {
    fail(`${candidate.file} digest is missing or stale in APPLY-SEQUENCE.md`)
  }
}

for (const [file, sql] of Object.entries(probeSql)) {
  const executable = stripComments(sql).trim()
  const structure = stripStrings(executable)
  if (!executable.startsWith('WITH')) fail(`${file} must remain one read-only CTE query`)
  if (count(executable, /;/g) !== 1 || !executable.endsWith(';')) {
    fail(`${file} must contain exactly one statement`)
  }
  if (/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE|CALL|DO)\b/i.test(structure)) {
    fail(`${file} contains a write-capable SQL operation`)
  }
  for (const candidate of candidates) {
    if (!sql.includes(`'${candidate.version}'`)) {
      fail(`${file} does not account for migration ${candidate.version}`)
    }
  }
}

if (!probeSql['PRE-APPLY-GATE.sql'].includes('GROUP BY split_sheet_id HAVING count(*) > 1')) {
  fail('Preflight no longer checks duplicate active e-sign envelopes')
}
if (!probeSql['PRE-APPLY-GATE.sql'].includes('GROUP BY user_id HAVING count(*) > 1')) {
  fail('Preflight no longer checks duplicate blanket agreements')
}
if (!probeSql['POST-APPLY-VERIFY.sql'].includes("a.grantee = 0 OR r.rolname IN ('anon', 'authenticated')")) {
  fail('Post-apply verifier no longer inspects PUBLIC/anon/authenticated function ACLs')
}
if (!probeSql['POST-APPLY-VERIFY.sql'].includes("ARRAY['search_path=']::text[]")) {
  fail('Post-apply verifier no longer proves empty definer search paths')
}
if (!probeSql['FAILED-APPLY-CHECK.sql'].includes('PARTIAL_OR_LEDGER_MISMATCH')) {
  fail('Failed-apply probe no longer exposes partial schema residue')
}
if (!probeSql['FAILED-APPLY-CHECK.sql'].includes('APPLIED_UNREGISTERED')) {
  fail('Failed-apply probe no longer distinguishes a complete unregistered apply')
}

console.log('PASS: migrations 214–217 are ordered, transactional, collision-sensitive, checksum-pinned, and covered by read-only probes.')
