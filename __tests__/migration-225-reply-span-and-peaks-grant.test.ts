import { readFileSync, readdirSync } from 'fs'
import path from 'path'

const migrationsDir = path.join(process.cwd(), 'supabase/migrations')
const matches = readdirSync(migrationsDir).filter(name =>
  name.endsWith('_reply_span_and_peaks_grant.sql')
)

if (matches.length !== 1) {
  throw new Error(
    `expected exactly one reply-span/peaks-grant migration, found ${matches.length}: ${matches.join(', ')}`
  )
}

const sql = readFileSync(path.join(migrationsDir, matches[0]), 'utf8')

describe('migration 225 reply span and peaks grant', () => {
  // WR-03. The invariant was stated in the client and enforced nowhere below
  // it. Phase 40 exports spans as DAW markers, so a spanned reply would export
  // as a marker for a moment nobody marked.
  describe('a reply never carries a span', () => {
    it('adds a CHECK binding parent_comment_id and end_timestamp_ms', () => {
      expect(sql).toContain('work_version_comments_reply_has_no_span')
      expect(sql).toContain('CHECK (parent_comment_id IS NULL OR end_timestamp_ms IS NULL)')
    })

    it('constrains the existing table rather than recreating it', () => {
      expect(sql).toContain('ALTER TABLE public.work_version_comments')
      expect(sql).not.toMatch(/CREATE TABLE\s+public\.work_version_comments/)
      expect(sql).not.toMatch(/DROP TABLE/)
    })

    // A trigger would give a friendlier message but would mean restating an
    // ~80-line function from 224, inviting drift. The unbypassable guarantee is
    // the point; the readable error belongs at the API edge.
    it('does not restate migration 224 functions', () => {
      expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.validate_work_version_comment')
      expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.create_work_version_comment')
    })
  })

  // WR-04. 224 revoked from PUBLIC and anon by name but never granted to
  // authenticated, so the CHECK on every peaks write worked only through
  // Postgres's implicit default grant.
  describe('peaks range helper grant', () => {
    it('grants EXECUTE to authenticated', () => {
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.work_version_peaks_in_range(SMALLINT[])')
      expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.work_version_peaks_in_range\(SMALLINT\[\]\)\s+TO authenticated;/)
    })

    it('does not redefine the function it is granting on', () => {
      expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.work_version_peaks_in_range')
    })
  })

  it('reloads the PostgREST schema cache', () => {
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'")
  })
})
