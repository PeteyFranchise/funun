// Migration-content assertion test for 055_dm_threads_update_policy.sql
// Mirrors the pattern from migration-054.test.ts (readFileSync + toContain).
// Verifies the participant-scoped UPDATE policy that Plan 03's accept/
// decline/block routes depend on — without running the SQL against a DB.

import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/055_dm_threads_update_policy.sql'),
  'utf8'
)

describe('migration 055 — dm_threads UPDATE policy', () => {
  it('creates the dmt_update_participant policy for UPDATE', () => {
    expect(migration).toMatch(/CREATE POLICY\s+"dmt_update_participant"\s+ON dm_threads FOR UPDATE/i)
  })

  it('is idempotent via DROP POLICY IF EXISTS', () => {
    expect(migration).toMatch(/DROP POLICY IF EXISTS\s+"dmt_update_participant"\s+ON dm_threads/i)
  })

  it('scopes UPDATE to thread participants in the USING clause', () => {
    expect(migration).toMatch(/USING\s*\(a_id = auth\.uid\(\) OR b_id = auth\.uid\(\)\)/i)
  })

  it('scopes the post-update row to participants in the WITH CHECK clause', () => {
    expect(migration).toMatch(/WITH CHECK\s*\(a_id = auth\.uid\(\) OR b_id = auth\.uid\(\)\)/i)
  })

  it('grants the policy to the authenticated role', () => {
    expect(migration).toContain('TO authenticated')
  })
})

describe('migration 055 — scope preservation', () => {
  it('does not touch the SELECT or INSERT participant policies', () => {
    expect(migration).not.toMatch(/CREATE POLICY.*dmt_select_participant/i)
    expect(migration).not.toMatch(/CREATE POLICY.*dmt_insert_participant/i)
  })

  it('does not alter artist_profiles or its column grants', () => {
    expect(migration).not.toContain('artist_profiles')
  })
})
