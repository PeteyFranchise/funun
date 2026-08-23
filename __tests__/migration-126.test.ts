import { readFileSync } from 'fs'
import { join } from 'path'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/126_selects_reaction_cap_lock.sql'),
  'utf8'
).replace(/^\s*--.*$/gm, '')

describe('migration 126 — concurrent Selects reaction cap', () => {
  it('takes a transaction lock keyed by track before counting rows', () => {
    const lock = sql.indexOf('pg_advisory_xact_lock')
    const count = sql.indexOf('SELECT count(*)')

    expect(lock).toBeGreaterThan(-1)
    expect(count).toBeGreaterThan(lock)
    expect(sql).toContain('hashtextextended(NEW.selects_track_id::TEXT, 0)')
  })

  it('serializes concurrent inserts before enforcing the hard cap', () => {
    expect(sql).toMatch(/WHERE selects_track_id = NEW\.selects_track_id/i)
    expect(sql).toMatch(/IF v_count >= 500 THEN/i)
    expect(sql).toMatch(/ERRCODE = 'check_violation'/i)
    expect(sql).toMatch(/BEFORE INSERT|RETURNS TRIGGER/i)
  })

  it('does not expose the trigger function to application roles', () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.enforce_selects_reaction_cap\(\) FROM PUBLIC, anon, authenticated/i
    )
  })
})
