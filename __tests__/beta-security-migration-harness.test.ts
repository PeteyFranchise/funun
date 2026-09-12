import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const harness = '.planning/quick/260912-beta-security-migration-harness'
const migrations = [
  '214_verified_invite_claim_hardening.sql',
  '215_atomic_checkout_creation.sql',
  '216_atomic_esign_mint_claims.sql',
  '217_atomic_playbook_operations.sql',
]
const probes = [
  'PRE-APPLY-GATE.sql',
  'POST-APPLY-VERIFY.sql',
  'FAILED-APPLY-CHECK.sql',
]

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), 'utf8')
}

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '')
}

function stripStrings(sql: string): string {
  return sql.replace(/'(?:''|[^'])*'/g, "''")
}

describe('beta security migration 214–217 harness', () => {
  it('keeps every candidate explicitly transactional and collision-sensitive', () => {
    for (const file of migrations) {
      const sql = read(`supabase/migrations/${file}`)
      const executable = stripComments(sql).trim()
      expect(sql).toContain('HUMAN-GATED')
      expect(executable.startsWith('BEGIN;')).toBe(true)
      expect(executable.endsWith('COMMIT;')).toBe(true)
      expect(executable).not.toMatch(/CREATE\s+(?:TABLE|UNIQUE\s+INDEX)\s+IF\s+NOT\s+EXISTS/i)
      expect(executable).not.toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i)
    }
  })

  it('pins the exact ordered migration bytes in the owner runbook', () => {
    const runbook = read(`${harness}/APPLY-SEQUENCE.md`)
    migrations.forEach((file, index) => {
      const sql = read(`supabase/migrations/${file}`)
      const digest = createHash('sha256').update(sql).digest('hex')
      const version = String(214 + index)
      expect(runbook).toContain(
        `| \`${version}\` | \`supabase/migrations/${file}\` | \`${digest}\` |`
      )
    })
  })

  it('keeps every production probe read-only and aware of all four migrations', () => {
    for (const file of probes) {
      const sql = stripComments(read(`${harness}/${file}`)).trim()
      const structure = stripStrings(sql)
      expect(sql.startsWith('WITH')).toBe(true)
      expect(sql.match(/;/g)).toHaveLength(1)
      expect(sql.endsWith(';')).toBe(true)
      expect(structure).not.toMatch(
        /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE|CALL|DO)\b/i
      )
      for (const version of ['214', '215', '216', '217']) {
        expect(sql).toContain(`'${version}'`)
      }
    }
  })

  it('checks blockers before apply and hardened objects after apply', () => {
    const preflight = read(`${harness}/PRE-APPLY-GATE.sql`)
    const postApply = read(`${harness}/POST-APPLY-VERIFY.sql`)
    const failedApply = read(`${harness}/FAILED-APPLY-CHECK.sql`)

    expect(preflight).toContain('Required relations exist')
    expect(preflight).toContain('Required columns exist')
    expect(preflight).toContain('Target functions are free')
    expect(preflight).toContain('GROUP BY split_sheet_id HAVING count(*) > 1')
    expect(preflight).toContain('GROUP BY user_id HAVING count(*) > 1')
    expect(postApply).toContain('Every target function is a hardened definer')
    expect(postApply).toContain("ARRAY['search_path=']::text[]")
    expect(postApply).toContain("a.grantee = 0 OR r.rolname IN ('anon', 'authenticated')")
    expect(postApply).toContain('Service role can execute every target function')
    expect(read('supabase/migrations/214_verified_invite_claim_hardening.sql')).toContain(
      'REVOKE ALL ON FUNCTION public.handle_new_user()'
    )
    expect(failedApply).toContain('APPLIED_UNREGISTERED')
    expect(failedApply).toContain('PARTIAL_OR_LEDGER_MISMATCH')
  })

  it('runs the migration guard as an early, fail-closed CI check', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>
    }
    const workflow = read('.github/workflows/quality.yml')
    const installStep = workflow.indexOf('- run: npm ci')
    const migrationStep = workflow.indexOf('run: npm run security:migrations:verify')
    const typecheckStep = workflow.indexOf('- run: npm run typecheck:strict')

    expect(packageJson.scripts?.['security:migrations:verify']).toBe(
      'node scripts/verify-beta-security-migrations.mjs'
    )
    expect(installStep).toBeGreaterThanOrEqual(0)
    expect(migrationStep).toBeGreaterThan(installStep)
    expect(typecheckStep).toBeGreaterThan(migrationStep)
    expect(workflow).not.toMatch(
      /name: Verify security migration package[\s\S]{0,160}continue-on-error:\s*true/
    )
  })
})
