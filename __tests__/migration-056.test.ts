import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/056_harden_dm_write_privileges.sql'),
  'utf8'
)

describe('migration 056 — DM write privilege hardening', () => {
  it('revokes direct authenticated INSERT and UPDATE on dm_threads', () => {
    expect(migration).toContain('REVOKE INSERT, UPDATE ON dm_threads FROM authenticated')
  })

  it('revokes direct authenticated INSERT and UPDATE on dm_messages', () => {
    expect(migration).toContain('REVOKE INSERT, UPDATE ON dm_messages FROM authenticated')
  })

  it('documents API-owned thread state transitions', () => {
    expect(migration).toContain('server API routes own creation and request-state transitions')
  })

  it('documents API-owned message insertion after gate checks', () => {
    expect(migration).toContain('/api/dm/send owns message insertion after gate/rate/block checks')
  })
})
