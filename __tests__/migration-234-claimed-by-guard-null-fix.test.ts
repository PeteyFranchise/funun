import fs from 'fs'
import path from 'path'
import { readdirSync } from 'fs'

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase/migrations/234_claimed_by_guard_null_fix.sql'
)
const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')

/**
 * Strips `--` line comments, respecting single-quoted string literals.
 * Same helper as migration 231's and 233's tests, for the same reason: the
 * assertions below must check executable SQL, not this migration's own
 * header prose, which quotes the defective expression in order to explain
 * it and would otherwise match every "do not do this" assertion.
 */
function stripLineComments(fileSql: string): string {
  return fileSql
    .split('\n')
    .map((line) => {
      let inString = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === "'") {
          inString = !inString
          continue
        }
        if (!inString && ch === '-' && line[i + 1] === '-') {
          return line.slice(0, i)
        }
      }
      return line
    })
    .join('\n')
}

const code = stripLineComments(sql)

// ─── WHY THIS FILE EXISTS ─────────────────────────────────────────────────
//
// Migration 233's guard never raised. Its IF condition read
//
//   IF v_changing AND NOT v_privileged AND NOT v_verified_claim THEN
//
// with v_verified_claim assigned by `v_write_mode = 'verified_claim'`. For
// every caller other than the two legitimate writer functions the GUC is
// unset, so v_write_mode is NULL, so that comparison is NULL -- not FALSE.
// NOT NULL is NULL, TRUE AND TRUE AND NULL is NULL, and PL/pgSQL does not
// take the THEN branch on a NULL condition. The guard was inert in
// production from the moment it was applied.
//
// 233's own test asserted the defective expression verbatim:
//
//   expect(sql).toMatch(/v_verified_claim[\s\S]{0,40}v_write_mode = 'verified_claim'/)
//
// so the text-lock did not merely fail to catch the bug -- it pinned it in
// place. That is the thing worth guarding against here, and it is the same
// failure shape as migration 230's REVOKE: a green check that asserted the
// statement's SHAPE while the statement did nothing.
//
// What this file can and cannot do is unchanged from 233's framing: a text
// assertion cannot prove Postgres enforces anything. The proof for 234 is
// the five owner-run behavioural probes executed against production on
// 2026-10-05 (forged UPDATE refused 42501, forged INSERT refused 42501,
// migration 179 auto-link still sets claimed_by, service_role still writes,
// authenticated + verified-claim GUC still writes). These assertions only
// stop the fix from being silently undone.

describe('migration 234 — claimed_by guard NULL-logic fix', () => {
  it('redefines the guard function and nothing else', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.collaborators_guard_claimed_by_write\(\)\s*\nRETURNS TRIGGER/
    )
    const definitions = code.match(/CREATE OR REPLACE FUNCTION/g) ?? []
    expect(definitions).toHaveLength(1)
  })

  it('assigns v_verified_claim with a null-safe comparison, never a bare `=`', () => {
    expect(code).toMatch(
      /v_verified_claim BOOLEAN := v_write_mode IS NOT DISTINCT FROM 'verified_claim'/
    )
    // The precise defect: a bare equality against the nullable GUC yields
    // NULL for every unset caller, which makes the whole IF condition NULL.
    expect(code).not.toMatch(/v_verified_claim[^\n]*v_write_mode\s*=\s*'verified_claim'/)
  })

  it('keeps the two non-nullable terms of the IF condition exactly as migration 231 proved sound', () => {
    expect(code).toMatch(/v_privileged BOOLEAN := v_role IS NULL OR v_role = 'service_role'/)
    expect(code).toContain("TG_OP = 'INSERT' AND NEW.claimed_by IS NOT NULL")
    expect(code).toContain("TG_OP = 'UPDATE' AND NEW.claimed_by IS DISTINCT FROM OLD.claimed_by")
    expect(code).toMatch(/IF v_changing AND NOT v_privileged AND NOT v_verified_claim THEN/)
  })

  it('still raises 42501, still SECURITY INVOKER, still trigger-internal only', () => {
    expect(code).toMatch(/RAISE EXCEPTION[\s\S]{0,300}USING ERRCODE = '42501'/)
    expect(code).toMatch(/SECURITY INVOKER/)
    expect(code).not.toMatch(/SECURITY DEFINER/)
    expect(code).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.collaborators_guard_claimed_by_write\(\) FROM PUBLIC, anon, authenticated/
    )
  })

  it('does not touch the trigger, the two legitimate writer functions, or any table grant', () => {
    // 233's trigger is already attached to this function name; replacing the
    // function body is sufficient and a DROP/CREATE would needlessly widen
    // the blast radius of a hotfix.
    expect(code).not.toMatch(/DROP TRIGGER/)
    expect(code).not.toMatch(/CREATE TRIGGER/)
    expect(code).not.toMatch(/CREATE OR REPLACE FUNCTION public\.claim_collaborators\(/)
    expect(code).not.toMatch(/CREATE OR REPLACE FUNCTION public\.link_existing_member_collaborator\(/)
    expect(code).not.toMatch(/\b(GRANT|REVOKE)\b(?:(?!ON FUNCTION)[\s\S]){0,120}\bON\s+(public\.)?collaborators\b(?!_)/i)
  })
})

// ─── Standing corpus invariant ─────────────────────────────────────────────
//
// The assertion that actually protects this fix over time. 233's test still
// asserts 233's defective text, correctly -- a shipped migration file is
// immutable history and must keep describing what it did. So nothing in
// 233's test can speak for the CURRENT state of the function. This does:
// whichever migration most recently defines the guard, that definition must
// use the null-safe comparison.

describe('migration 234 — standing corpus invariant', () => {
  it('the latest definition of collaborators_guard_claimed_by_write() is null-safe', () => {
    const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations')
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    let latestFile: string | null = null
    let latestBody = ''

    for (const file of files) {
      const stripped = stripLineComments(
        fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      )
      const match = stripped.match(
        /CREATE OR REPLACE FUNCTION public\.collaborators_guard_claimed_by_write\(\)[\s\S]*?\n\$\$;/
      )
      if (match) {
        latestFile = file
        latestBody = match[0]
      }
    }

    expect(latestFile).not.toBeNull()
    expect(latestBody).toMatch(/IS NOT DISTINCT FROM 'verified_claim'/)
    expect(latestBody).not.toMatch(/v_write_mode\s*=\s*'verified_claim'/)
  })
})
