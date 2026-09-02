import fs from 'fs'
import path from 'path'

const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/155_song_passport_artifacts_custody.sql'), 'utf8')

describe('migration 155 — Song Passport artifacts and custody', () => {
  it('binds every artifact to a snapshot and hashes source/artifact identities', () => {
    expect(sql).toContain('song_passport_artifacts')
    expect(sql).toContain('snapshot_id')
    expect(sql).toMatch(/source_sha256[\s\S]*\^\[0-9a-f\]\{64\}\$/)
    expect(sql).toMatch(/artifact_sha256[\s\S]*\^\[0-9a-f\]\{64\}\$/)
  })

  it('preserves transfer and controller history without rewriting evidence', () => {
    expect(sql).toContain("'custody_transferred'")
    expect(sql).toContain('controller_before')
    expect(sql).toContain('controller_after')
    expect(sql).toContain('reject_song_passport_custody_events_mutation')
  })

  it('keeps deletion requests reviewable and legal-hold aware', () => {
    expect(sql).toContain('song_passport_retention_requests')
    expect(sql).toContain("'blocked_legal_hold'")
    expect(sql).toContain("'delete_personal_data', 'delete_passport'")
  })

  it('denies browser writes to custody ledgers', () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.song_passport_artifacts FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/REVOKE ALL ON public\.song_passport_custody_events FROM PUBLIC, anon, authenticated/)
  })
})
