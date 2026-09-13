import { readFileSync, readdirSync } from 'fs'
import path from 'path'

const migrationsDir = path.join(process.cwd(), 'supabase/migrations')
const matches = readdirSync(migrationsDir).filter(name =>
  name.endsWith('_writer_room_take_review_surface.sql')
)

if (matches.length !== 1) {
  throw new Error(
    `expected exactly one take-review migration file, found ${matches.length}: ${matches.join(', ')}`
  )
}

const sql = readFileSync(path.join(migrationsDir, matches[0]), 'utf8')

describe('migration 224 writer room take-review surface', () => {
  describe('peaks storage', () => {
    it('adds a fixed-cardinality peaks column on work_versions', () => {
      expect(sql).toContain('ADD COLUMN peaks SMALLINT[]')
      expect(sql).toContain('work_versions_peaks_shape')
      expect(sql).toContain('cardinality(peaks) = 200')
      expect(sql).toContain('array_position(peaks, NULL) IS NULL')
    })
  })

  describe('range comments', () => {
    it('adds both paired span constraints', () => {
      expect(sql).toContain('work_version_comments_end_after_start')
      expect(sql).toContain('work_version_comments_end_range')
    })

    it('restates the GRANT SELECT column list with the new columns visible', () => {
      const grantBlock = sql.match(
        /GRANT SELECT \([\s\S]*?\) ON public\.work_version_comments TO authenticated;/
      )?.[0]
      expect(grantBlock).toBeDefined()
      expect(grantBlock).toContain('end_timestamp_ms')
      expect(grantBlock).toContain('needs_reposition')
    })

    it('raises the new span and reposition error codes', () => {
      expect(sql).toContain('comment_end_timestamp_out_of_range')
      expect(sql).toContain('reposition_flag_requires_carry')
    })

    it('restates the seven-argument RPC grant', () => {
      expect(sql).toContain(
        'GRANT EXECUTE ON FUNCTION public.create_work_version_comment(uuid, uuid, text, integer, uuid, uuid[], integer)'
      )
    })

    it('drops the six-argument overload before creating the seven-argument one', () => {
      const dropIndex = sql.indexOf(
        'DROP FUNCTION IF EXISTS public.create_work_version_comment(uuid, uuid, text, integer, uuid, uuid[]);'
      )
      const createIndex = sql.indexOf(
        'CREATE OR REPLACE FUNCTION public.create_work_version_comment('
      )
      expect(dropIndex).toBeGreaterThan(-1)
      expect(createIndex).toBeGreaterThan(-1)
      expect(dropIndex).toBeLessThan(createIndex)
    })
  })

  describe('carry-forward integrity (D-07 / Pitfall 5 lock)', () => {
    const carryStart = sql.indexOf(
      'CREATE OR REPLACE FUNCTION public.review_work_version_comment_carry('
    )
    const carryEnd = sql.indexOf('$$;', carryStart)
    const carryBody = sql.slice(carryStart, carryEnd)

    it('is present in the migration', () => {
      expect(carryStart).toBeGreaterThan(-1)
      expect(carryEnd).toBeGreaterThan(carryStart)
    })

    it('clamps both endpoints together via CROSS JOIN LATERAL with headroom on the start', () => {
      expect(carryBody).toContain('CROSS JOIN LATERAL')
      expect(carryBody).toContain('GREATEST(0, v_bound - 1)')
      expect(carryBody).toContain('needs_reposition')
      expect(carryBody).toContain('end_timestamp_ms')
      const greatestCalls = carryBody.match(/GREATEST\(/g) ?? []
      expect(greatestCalls.length).toBeGreaterThanOrEqual(2)
    })

    it('never clamps the end timestamp alone, without the start', () => {
      expect(carryBody).not.toMatch(/LEAST\(\s*source\.end_timestamp_ms/)
    })
  })

  describe('pins access model (negative assertions)', () => {
    const pinsStart = sql.indexOf('CREATE TABLE public.work_version_pins')
    const pinsSlice = sql.slice(pinsStart)

    it('is present in the migration', () => {
      expect(pinsStart).toBeGreaterThan(-1)
    })

    it('is RLS-gated, author-only, deletable, and range-checked', () => {
      expect(pinsSlice).toContain('ENABLE ROW LEVEL SECURITY')
      expect(pinsSlice).toContain('author_user_id = auth.uid()')
      expect(pinsSlice).toContain('GRANT DELETE')
      expect(pinsSlice).toContain('CHECK (timestamp_ms BETWEEN 0 AND 86400000)')
    })

    it('never uses a membership branch or an UPDATE grant', () => {
      expect(pinsSlice).not.toContain('is_work_owner')
      expect(pinsSlice).not.toContain('work_member_tier')
      expect(pinsSlice).not.toContain('GRANT UPDATE')
    })

    it('has exactly one CREATE POLICY statement naming work_version_pins', () => {
      const policyMatches = sql.match(/CREATE POLICY[\s\S]*?work_version_pins/g) ?? []
      expect(policyMatches.length).toBe(1)
    })

    it('does not duplicate or replace the existing work_version_comments policy', () => {
      const commentsPolicy = sql.match(
        /CREATE POLICY\s+\S+\s+ON\s+public\.work_version_comments/
      )
      expect(commentsPolicy).toBeNull()
    })
  })
})
