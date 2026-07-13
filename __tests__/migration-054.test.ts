// Migration-content assertion test for 054_dm_request_status_presence.sql
// Mirrors the pattern from connections.test.ts (readFileSync + toContain).
// Verifies the migration contains the exact structural contracts that
// Plans 03, 05, and 06 depend on — without running the SQL against a DB.

import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/054_dm_request_status_presence.sql'),
  'utf8'
)

describe('migration 054 — dm_threads.status', () => {
  it('adds status column with IF NOT EXISTS guard', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS status')
  })

  it('includes the three-value CHECK constraint', () => {
    expect(migration).toContain("CHECK (status IN ('direct', 'pending', 'declined'))")
  })

  it("defaults status to 'direct' to grandfather existing threads", () => {
    expect(migration).toContain("DEFAULT 'direct'")
  })
})

describe('migration 054 — dm_threads.requester_id', () => {
  it('adds requester_id column with IF NOT EXISTS guard', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS requester_id')
  })

  it('references auth.users for requester FK', () => {
    expect(migration).toContain('REFERENCES auth.users')
  })
})

describe('migration 054 — artist_profiles.last_seen_at', () => {
  it('adds last_seen_at column with IF NOT EXISTS guard', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS last_seen_at')
  })

  it('grants SELECT on last_seen_at to authenticated and anon', () => {
    expect(migration).toContain('GRANT SELECT (last_seen_at) ON artist_profiles TO authenticated, anon')
  })

  it('does NOT grant table-level SELECT on artist_profiles (column lockdown preserved)', () => {
    // A bare table-level GRANT SELECT would look like:
    //   GRANT SELECT ON artist_profiles TO
    // The column-scoped form includes a parenthesised column list before ON:
    //   GRANT SELECT (last_seen_at) ON artist_profiles TO
    // We detect the forbidden form by looking for "GRANT SELECT ON artist_profiles TO"
    // without any column list — the column-scoped form always has "(" between
    // "SELECT" and "ON", so the bare form will never appear if the migration
    // only contains column-scoped grants.
    expect(migration).not.toContain('GRANT SELECT ON artist_profiles TO')
  })
})

describe('migration 054 — RLS policy preservation', () => {
  it('does not drop or recreate dmt_insert_participant', () => {
    // The no_block()-augmented dmt_insert_participant policy from migration 038
    // must be left untouched. The connection gate lives in the API layer (Plan 03).
    // We check that no DROP POLICY or CREATE POLICY statement references this
    // policy name — a SQL comment mentioning it is fine, only DDL operations
    // on the policy would indicate it was modified.
    expect(migration).not.toMatch(/DROP POLICY.*dmt_insert_participant/i)
    expect(migration).not.toMatch(/CREATE POLICY.*dmt_insert_participant/i)
  })
})
