import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/091_funun_staff_revoke_all_hardening.sql'),
  'utf8'
)

// Executable DDL only — the header comment names 089/058/TRUNCATE to explain the gap,
// so structural assertions ignore comment lines.
const ddl = migration
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

describe('migration 091 — REVOKE ALL hardening for funun_staff + staff_audit_log (closes the 089 TRUNCATE gap)', () => {
  it('REVOKE ALL on funun_staff from PUBLIC, anon, authenticated', () => {
    expect(ddl).toMatch(/REVOKE ALL ON public\.funun_staff\s+FROM PUBLIC, anon, authenticated/)
  })

  it('REVOKE ALL on staff_audit_log from PUBLIC, anon, authenticated', () => {
    expect(ddl).toMatch(/REVOKE ALL ON public\.staff_audit_log\s+FROM PUBLIC, anon, authenticated/)
  })

  it('does NOT revoke from service_role (the service client must keep access)', () => {
    // service_role should never appear in a REVOKE target list
    const revokeLines = ddl.split('\n').filter((l) => /REVOKE/i.test(l))
    revokeLines.forEach((l) => expect(l).not.toMatch(/service_role/))
  })

  it('is REVOKE-only — no policy/table/function DDL, does not edit 089 objects it should leave alone', () => {
    expect(ddl).not.toContain('CREATE POLICY')
    expect(ddl).not.toContain('CREATE TABLE')
    expect(ddl).not.toContain('DROP')
    expect(ddl).not.toContain('ALTER TABLE')
    expect(ddl).not.toMatch(/\bGRANT\b/)
  })

  it('is human-gated and leaves migration 089 untouched', () => {
    expect(migration).toMatch(/human-gated/i)
    expect(migration).toMatch(/supabase db push/i)
    // phrase may wrap across a comment line break ("Do NOT edit\n-- migration 089")
    expect(migration).toMatch(/Do NOT edit[\s\S]{0,12}migration 089/i)
  })
})
