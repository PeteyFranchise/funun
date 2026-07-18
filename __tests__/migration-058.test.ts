import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/058_trust_safety_schema.sql'),
  'utf8'
)

describe('migration 058 — artist_profiles visibility + verification columns', () => {
  it('adds profile_visibility and open_to_visibility with IF NOT EXISTS guards', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS profile_visibility')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS open_to_visibility')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS verified_at')
  })

  it('constrains profile_visibility to public/connections_only', () => {
    expect(migration).toContain("CHECK (profile_visibility IN ('public', 'connections_only'))")
  })

  it('constrains open_to_visibility to public/connections/hidden', () => {
    expect(migration).toContain("CHECK (open_to_visibility IN ('public', 'connections', 'hidden'))")
  })

  it('grants SELECT on the two visibility columns to authenticated and anon', () => {
    expect(migration).toContain(
      'GRANT SELECT (profile_visibility, open_to_visibility)\n  ON artist_profiles TO authenticated, anon'
    )
  })

  it('does not grant table-level SELECT on artist_profiles (column lockdown preserved)', () => {
    expect(migration).not.toContain('GRANT SELECT ON artist_profiles TO')
  })

  it('does not grant UPDATE on verified_at, profile_visibility, or open_to_visibility to authenticated', () => {
    expect(migration).not.toMatch(/GRANT UPDATE\s*\([^)]*verified_at/)
    expect(migration).not.toMatch(/GRANT UPDATE\s*\([^)]*profile_visibility/)
    expect(migration).not.toMatch(/GRANT UPDATE\s*\([^)]*open_to_visibility/)
  })
})

describe('migration 058 — reports table (SAFETY-02)', () => {
  it('creates the reports table with IF NOT EXISTS', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS reports')
  })

  it('covers every reportable target type from 13-VALIDATION.md', () => {
    expect(migration).toContain("'profile'")
    expect(migration).toContain("'message'")
    expect(migration).toContain("'green_room_post'")
    expect(migration).toContain("'green_room_comment'")
    expect(migration).toContain("'green_room_repost'")
    expect(migration).toContain("'green_room_placement'")
  })

  it('enables RLS and scopes SELECT to the reporter only', () => {
    expect(migration).toMatch(/ALTER TABLE reports ENABLE ROW LEVEL SECURITY/)
    expect(migration).toMatch(
      /CREATE POLICY\s+"reports_select_own"[\s\S]*USING \(reporter_id = auth\.uid\(\)\)/
    )
  })

  it('does not scope any reports policy by target_id (no reported-user read path)', () => {
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]*?target_id\s*=\s*auth\.uid\(\)/)
  })

  it('drops the policy before recreating it (idempotent)', () => {
    expect(migration).toMatch(/DROP POLICY IF EXISTS "reports_select_own" ON reports;[\s\S]*?CREATE POLICY "reports_select_own"/)
  })

  it('column-locks reporter-visible fields to id/target_type/status/created_at', () => {
    expect(migration).toContain('REVOKE SELECT ON reports FROM authenticated, anon')
    expect(migration).toContain(
      'GRANT SELECT (id, target_type, status, created_at) ON reports TO authenticated'
    )
  })

  it('never grants column-level SELECT on admin_notes, reviewed_by, or reviewed_at', () => {
    expect(migration).not.toMatch(/GRANT SELECT\s*\([^)]*admin_notes/)
    expect(migration).not.toMatch(/GRANT SELECT\s*\([^)]*reviewed_by/)
    expect(migration).not.toMatch(/GRANT SELECT\s*\([^)]*reviewed_at/)
  })

  it('revokes all direct writes — reports are server-owned', () => {
    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON reports FROM authenticated, anon')
  })
})

describe('migration 058 — verification_audit_log (SAFETY-03)', () => {
  it('creates the audit log table with an admin action check constraint', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS verification_audit_log')
    expect(migration).toContain("CHECK (action IN ('grant', 'revoke'))")
  })

  it('enables RLS with zero policies and revokes all authenticated/anon grants', () => {
    const section = migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS verification_audit_log'))
    expect(section).toMatch(/ALTER TABLE verification_audit_log ENABLE ROW LEVEL SECURITY/)
    expect(section).not.toContain('CREATE POLICY')
    expect(section).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON verification_audit_log FROM authenticated, anon'
    )
  })
})

describe('migration 058 — no_block() scope note', () => {
  it('does not attempt to wire no_block() into new tables (out of scope for this plan)', () => {
    // Strip SQL line comments before checking — the migration's header
    // prose explains WHY no_block() isn't wired here, which legitimately
    // mentions the function name in a comment without calling it.
    const codeOnly = migration
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n')
    expect(codeOnly).not.toMatch(/no_block\(/)
  })
})
