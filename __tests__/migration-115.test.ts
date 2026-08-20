import { readFileSync } from 'fs'
import path from 'path'

// Structural assertions on migration 115 (audit #1). The header prose discusses
// approval_token extensively, so the "token is not granted" check must run
// against the executable SQL with `--` comment lines stripped (mirrors
// migration-064.test.ts). A live PostgREST integration check (initiator cannot
// SELECT a co-party's approval_token) runs post-push against the remote DB.

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/115_split_sheet_parties_token_column_privacy.sql'),
  'utf8'
)

const sql = migration
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')

// Every column of split_sheet_parties EXCEPT approval_token (018 + 062 + 063).
const SAFE_COLUMNS = [
  'split_sheet_id',
  'collaborator_id',
  'user_id',
  'name',
  'email',
  'pro',
  'ipi',
  'split_percentage',
  'approval_status',
  'counter_proposal',
  'token_expires_at',
  'approved_at',
  'created_at',
  'first_viewed_at',
  'legal_name',
  'publishing_designee',
  'administrator',
]

describe('migration 115 — split_sheet_parties approval_token column privacy', () => {
  it('revokes the table-wide SELECT from authenticated and anon', () => {
    expect(sql).toMatch(/REVOKE\s+SELECT\s+ON\s+split_sheet_parties\s+FROM\s+authenticated,\s*anon/)
  })

  it('re-grants column-scoped SELECT to authenticated', () => {
    expect(sql).toMatch(/GRANT\s+SELECT\s*\(/)
    expect(sql).toContain('ON split_sheet_parties TO authenticated')
  })

  it('does NOT grant approval_token — the disclosure the fix closes', () => {
    const grantedCols = sql.slice(
      sql.indexOf('GRANT SELECT'),
      sql.indexOf('ON split_sheet_parties TO authenticated')
    )
    expect(grantedCols).not.toContain('approval_token')
  })

  it('grants every non-token column, so authenticated split-sheet reads are not broken', () => {
    const grantedCols = sql.slice(
      sql.indexOf('GRANT SELECT'),
      sql.indexOf('ON split_sheet_parties TO authenticated')
    )
    for (const col of SAFE_COLUMNS) {
      expect(grantedCols).toContain(col)
    }
  })

  it('grants nothing to anon (public token reads go through the service client only)', () => {
    expect(sql).not.toMatch(/GRANT[^;]*TO[^;]*anon/)
  })
})
