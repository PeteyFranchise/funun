import fs from 'fs'
import path from 'path'

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/153_song_passport_trust_workflows.sql'),
  'utf8'
)

describe('migration 153 — Song Passport trust workflows', () => {
  it('uses expected-head locking to prevent silent overwrite', () => {
    expect(sql).toMatch(/FOR UPDATE/)
    expect(sql).toMatch(/p_expected_value_id IS DISTINCT FROM v_current_id/)
    expect(sql).toMatch(/ERRCODE = '40001'/)
  })

  it('preserves revisions and advances only the head pointer', () => {
    expect(sql).toContain('supersedes_value_id')
    expect(sql).toMatch(/INSERT INTO public\.song_passport_values/)
    expect(sql).toMatch(/ON CONFLICT \(passport_id, layer, field_key, target_key\)[\s\S]*DO UPDATE SET current_value_id/)
  })

  it('limits self-confirmation to the identity subject', () => {
    expect(sql).toContain('People may confirm only their own identity facts')
    expect(sql).toMatch(/collaborator\.claimed_by = p_actor_user_id/)
  })

  it('creates approval snapshot and action atomically behind authority', () => {
    expect(sql).toContain('create_song_passport_approval_snapshot')
    expect(sql).toContain('Explicit approval authority is required')
    expect(sql).toMatch(/INSERT INTO public\.song_passport_snapshots[\s\S]*INSERT INTO public\.song_passport_actions/)
    expect(sql).toContain('Legal-review visibility is required for this approval snapshot')
  })

  it('issues explicit grants through an owner-gated transaction', () => {
    expect(sql).toContain('grant_song_passport_permission')
    expect(sql).toContain('Only the song owner may issue Passport authority grants')
    expect(sql).toMatch(/FOR UPDATE[\s\S]*IF v_grant_id IS NULL/)
  })
})
