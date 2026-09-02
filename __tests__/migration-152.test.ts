import fs from 'fs'
import path from 'path'

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/152_song_passport_discovery.sql'),
  'utf8'
)

describe('migration 152 — conservative Song Passport discovery', () => {
  it('makes source-based seeding idempotent', () => {
    expect(sql).toContain('source_fingerprint TEXT')
    expect(sql).toMatch(/UNIQUE INDEX idx_song_passport_values_source_fingerprint/)
    expect(sql).toMatch(/ON CONFLICT \(passport_id, source_fingerprint\)/)
  })

  it('never promotes discovered facts above inherited', () => {
    expect(sql).toMatch(/p_value_jsonb, 'inherited', p_visibility/)
    expect(sql).not.toMatch(/p_value_jsonb, 'confirmed'/)
    expect(sql).not.toMatch(/p_value_jsonb, 'locked'/)
  })

  it('keeps application writes server-only and owner-gated', () => {
    expect(sql).toMatch(/Only the work owner may apply legacy discovery/)
    expect(sql).toMatch(/REVOKE EXECUTE[\s\S]*FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE[\s\S]*TO service_role/)
    expect(sql).toMatch(/REVOKE ALL ON public\.song_passport_reconciliation_issues FROM PUBLIC, anon, authenticated/)
  })

  it('stores ambiguity for explicit reconciliation', () => {
    expect(sql).toContain('song_passport_reconciliation_issues')
    expect(sql).toContain("'conflicting_values', 'ambiguous_identity'")
    expect(sql).toContain("status IN ('open', 'resolved', 'dismissed')")
  })
})
