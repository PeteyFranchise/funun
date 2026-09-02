import fs from 'fs'
import path from 'path'

const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/156_song_passport_pilot_operations.sql'), 'utf8')

describe('migration 156 — Song Passport pilot operations', () => {
  it('supports account and work cohorts without browser access', () => {
    expect(sql).toContain('song_passport_cohorts')
    expect(sql).toContain('account_user_id')
    expect(sql).toContain('work_id')
    expect(sql).toMatch(/REVOKE ALL ON public\.song_passport_cohorts FROM authenticated, anon/)
  })

  it('captures value-free success telemetry from material ledgers', () => {
    expect(sql).toContain('capture_song_passport_operation')
    expect(sql).toContain('Never store lyrics, names, identifiers, shares')
    expect(sql).toContain("'artifact_generated'")
    expect(sql).not.toMatch(/INSERT INTO public\.song_passport_operation_events[\s\S]*value_jsonb/)
  })

  it('defines incident categories for phase stop conditions', () => {
    expect(sql).toContain("'authorization', 'privacy', 'source_mutation', 'silent_overwrite'")
    expect(sql).toContain("severity IN ('low', 'medium', 'high', 'critical')")
  })

  it('publishes the support and claims SOP in The Playbook', () => {
    expect(sql).toContain('Song Passport Pilot Operations v1.1 — Support, Rollout and Claims')
    expect(sql).toContain('a generation receipt does not mean')
    expect(sql).toContain('automatic DDEX identity embedded in audio')
  })
})
