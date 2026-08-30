import { readFileSync } from 'fs'
import path from 'path'

// ─── migration 139 — pin user_id on works + vault_projects, nothing else ─────
// Text-lock + structural test, in the established style of
// __tests__/migration-137.test.ts. This migration is human-gated: an agent
// never pushes it, so this file IS the pre-push review evidence.
//
// The change is one guard function and two BEFORE UPDATE triggers. Most of
// these assertions are assertions of RESTRAINT: the fix must NOT rewrite the
// RLS policies (a policy cannot reference OLD, which is the whole reason a
// trigger is needed), must NOT hand out or revoke table-level UPDATE, and must
// NOT alter either table's shape. If it ever grows beyond the guard, this
// suite fails.

const migration139 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/139_owner_immutable_guard.sql'),
  'utf8'
)

// Executable SQL with every `--` comment line stripped, so "does not do X"
// assertions cannot be defeated by prose — the header deliberately DISCUSSES
// policies and column grants in order to explain why it leaves them alone.
const sqlOnly = migration139
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

// COMMENT ON bodies removed too: a comment that documents a non-change must
// not read as the change.
const sqlNoDocs = sqlOnly.replace(/COMMENT ON [\s\S]*?';\n/g, '')

describe('migration 139 — the guard exists and is shaped correctly', () => {
  it('defines the guard function with a hardened search_path', () => {
    expect(sqlOnly).toMatch(
      /CREATE OR REPLACE FUNCTION public\.guard_owner_immutable\(\)/
    )
    expect(sqlOnly).toMatch(/SET search_path = ''/)
  })

  it('rejects any change to user_id (null-safe) and raises a privilege error', () => {
    expect(sqlOnly).toMatch(/NEW\.user_id\s+IS DISTINCT FROM\s+OLD\.user_id/)
    expect(sqlOnly).toMatch(/RAISE EXCEPTION/)
    expect(sqlOnly).toMatch(/ERRCODE = 'insufficient_privilege'/)
  })

  it('attaches a BEFORE UPDATE FOR EACH ROW trigger to works', () => {
    expect(sqlOnly).toMatch(
      /CREATE TRIGGER guard_owner_immutable\s+BEFORE UPDATE ON public\.works\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.guard_owner_immutable\(\)/
    )
  })

  it('attaches a BEFORE UPDATE FOR EACH ROW trigger to vault_projects', () => {
    expect(sqlOnly).toMatch(
      /CREATE TRIGGER guard_owner_immutable\s+BEFORE UPDATE ON public\.vault_projects\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.guard_owner_immutable\(\)/
    )
  })

  it('is idempotent — drops each trigger before recreating it', () => {
    expect(sqlOnly).toMatch(/DROP TRIGGER IF EXISTS guard_owner_immutable ON public\.works/)
    expect(sqlOnly).toMatch(
      /DROP TRIGGER IF EXISTS guard_owner_immutable ON public\.vault_projects/
    )
  })

  it('withholds the function grant from clients (trigger-internal only)', () => {
    expect(sqlOnly).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.guard_owner_immutable\(\) FROM PUBLIC, anon, authenticated/
    )
  })

  it('reloads the PostgREST schema cache last', () => {
    expect(sqlOnly.trimEnd().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})

describe('migration 139 — restraint', () => {
  it('does not touch any RLS policy', () => {
    expect(sqlNoDocs).not.toMatch(/CREATE POLICY/i)
    expect(sqlNoDocs).not.toMatch(/DROP POLICY/i)
    expect(sqlNoDocs).not.toMatch(/ALTER POLICY/i)
  })

  it('does not grant or revoke table-level UPDATE (the column-grant path it rejected)', () => {
    // [^;]* keeps each match inside a single statement, so the function's
    // REVOKE EXECUTE and a trigger's "BEFORE UPDATE ON public.works" cannot be
    // bridged into a false positive.
    expect(sqlNoDocs).not.toMatch(
      /(?:GRANT|REVOKE)[^;]*\bUPDATE\b[^;]*\bON\s+public\.(?:works|vault_projects)\b/i
    )
  })

  it('does not alter the shape of either table', () => {
    expect(sqlNoDocs).not.toMatch(/ALTER TABLE/i)
  })
})
