import fs from 'fs'
import path from 'path'

const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/154_song_passport_master_graduation.sql'), 'utf8')

describe('migration 154 — Song Passport masters and graduation', () => {
  it('preserves recording lineage and successor master history', () => {
    expect(sql).toContain('song_passport_recording_lineage')
    expect(sql).toContain('supersedes_designation_id')
    expect(sql).toMatch(/reject_song_passport_master_designations_mutation/)
  })

  it('binds a master to an exact work version and approval snapshot', () => {
    expect(sql).toContain('An approved Passport snapshot is required before master selection')
    expect(sql).toMatch(/work_version_id[\s\S]*approval_snapshot_id/)
    expect(sql).toContain("'source_work_version_id', v_version.id")
  })

  it('graduates without overwriting existing release facts', () => {
    expect(sql).toContain('graduate_song_passport_to_release')
    expect(sql).toMatch(/repeat calls return the existing link/i)
    expect(sql).toMatch(/RETURN QUERY SELECT v_project_id, v_track_id, FALSE/)
    expect(sql).not.toMatch(/UPDATE public\.vault_projects SET/)
  })

  it('reuses the immutable source path and records the mapping', () => {
    expect(sql).toContain('v_version.audio_path')
    expect(sql).toContain("'source_unchanged', TRUE")
    expect(sql).toContain('song_passport_release_links')
  })
})
