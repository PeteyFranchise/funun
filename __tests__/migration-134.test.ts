import { readFileSync } from 'fs'
import path from 'path'
import {
  HANDLE_MIN_LENGTH,
  HANDLE_MAX_LENGTH,
  isValidHandle,
} from '@/lib/handles/validate'

// ─── migration 134 — the fixture sweep + the handle format constraint ───────
// Text-lock + structural test, in the same style as
// __tests__/migration-133.test.ts (readFileSync + a comment-stripped view of
// the executable SQL). Migration 134 is human-gated: it is never pushed by an
// agent, so this file IS the pre-push review evidence.
//
// The load-bearing proof here is a STRING-IDENTITY proof, and it exists
// because the failure it guards against is invisible in review: if the CHECK
// constraint's regex and lib/handles/validate.ts's HANDLE_PATTERN differ by a
// single character, one layer accepts a handle the other rejects, and the
// disagreement surfaces much later as an unexplainable 400 on a value the
// signup form said was fine. The pattern is therefore read out of BOTH files
// and compared — never hardcoded here, which would only move the drift.

const migration134 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/134_handle_format_and_backfill.sql'),
  'utf8'
)
const validateSource = readFileSync(
  path.join(process.cwd(), 'lib/handles/validate.ts'),
  'utf8'
)

// Executable SQL with every `--` comment line stripped, so "the migration does
// not do X" assertions cannot be defeated (or falsely tripped) by prose.
const sqlOnly = migration134
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

// The header's prose is hard-wrapped, so a sentence documenting a WHY is split
// across `--` lines. Unwrap it before asserting on the wording.
const commentProse = normalizeWhitespace(
  migration134
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('--'))
    .map(line => line.replace(/^--\s?/, ''))
    .join(' ')
)

// ─── the two patterns, each read from its own file ──────────────────────────
const tsPatternMatch = validateSource.match(/^const HANDLE_PATTERN = \/(.*)\/$/m)
const sqlPatternMatch = sqlOnly.match(/handle ~ '([^']*)'/)

describe('migration 134 — handle format constraint + fixture sweep', () => {
  // ══ D-05: the SQL rule and the TypeScript rule are the same rule ══════════
  describe('format constraint mirrors the application validator exactly', () => {
    it('finds a single unflagged HANDLE_PATTERN literal in lib/handles/validate.ts', () => {
      expect(tsPatternMatch).not.toBeNull()
      // No trailing flags: a flagged literal (e.g. /i) would mean the two
      // layers differ in a way string comparison alone could not see.
      expect(validateSource).toMatch(/^const HANDLE_PATTERN = \/.*\/$/m)
    })

    it('finds the regex operand of the CHECK constraint in the migration', () => {
      expect(sqlPatternMatch).not.toBeNull()
    })

    it('the SQL pattern is IDENTICAL to the TypeScript pattern, character for character', () => {
      const tsPattern = tsPatternMatch![1]
      const sqlPattern = sqlPatternMatch![1]
      expect(sqlPattern).toBe(tsPattern)
    })

    it('the SQL length bounds are the validator\'s own HANDLE_MIN_LENGTH and HANDLE_MAX_LENGTH', () => {
      const bounds = sqlOnly.match(/length\(handle\)\s+BETWEEN\s+(\d+)\s+AND\s+(\d+)/i)
      expect(bounds).not.toBeNull()
      expect(Number(bounds![1])).toBe(HANDLE_MIN_LENGTH)
      expect(Number(bounds![2])).toBe(HANDLE_MAX_LENGTH)
    })

    it('the pattern taken from the SQL behaves like the format rule it claims to be', () => {
      // Compiled from the string that is actually in the migration, so this
      // asserts the SQL literal is a working pattern rather than a plausible
      // looking one. PostgreSQL AREs and JavaScript agree on every construct
      // used here (anchors, character classes, non-capturing group, quantifiers).
      const compiled = new RegExp(sqlPatternMatch![1])
      // The one long-lived production handle must survive the constraint.
      expect(compiled.test('maya-reyes')).toBe(true)
      expect(compiled.test('MayaReyes')).toBe(true)
      expect(compiled.test('a_b-c9')).toBe(true)
      // Leading, trailing and doubled separators are rejected (D-05 edge rules).
      expect(compiled.test('-maya')).toBe(false)
      expect(compiled.test('maya-')).toBe(false)
      expect(compiled.test('maya--reyes')).toBe(false)
      expect(compiled.test('_maya')).toBe(false)
      // Whitespace and non-alphanumerics are rejected, which is why the
      // constraint needs no TRIM to match the validator's trimming behaviour.
      expect(compiled.test('maya reyes')).toBe(false)
      expect(compiled.test('   ')).toBe(false)
      expect(compiled.test('maya.reyes')).toBe(false)
      expect(compiled.test('maya😀')).toBe(false)
    })

    it('adds exactly one CHECK constraint, named, on the handle column', () => {
      const addConstraint = sqlOnly.match(/ADD\s+CONSTRAINT\s+(\w+)/gi) ?? []
      expect(addConstraint).toHaveLength(1)
      expect(addConstraint[0]).toMatch(/user_profiles_handle_format_chk$/)
      expect(sqlOnly).toMatch(/ALTER TABLE public\.user_profiles/)
    })

    it('keeps the NULL-tolerant disjunct, so the constraint is safe to apply on its own', () => {
      const constraintBody = normalizeWhitespace(
        sqlOnly.slice(sqlOnly.indexOf('ADD CONSTRAINT'))
      )
      expect(constraintBody).toMatch(/CHECK \( handle IS NULL OR \(handle ~ /)
    })
  })

  // ══ The sweep is a fixture sweep, not a backfill ══════════════════════════
  describe('fixture sweep', () => {
    const sweep = normalizeWhitespace(
      sqlOnly.slice(
        sqlOnly.indexOf('UPDATE public.user_profiles'),
        sqlOnly.indexOf(';', sqlOnly.indexOf('UPDATE public.user_profiles')) + 1
      )
    )

    it('is the only UPDATE in the file, and is scoped to rows that have no handle', () => {
      const updates = sqlOnly.match(/UPDATE public\./g) ?? []
      expect(updates).toHaveLength(1)
      expect(sweep).toMatch(/WHERE handle IS NULL;$/)
    })

    it('derives the generated value from the row\'s own primary key, so it cannot collide', () => {
      expect(sweep).toMatch(/SET handle = 'user-' \|\| left\(replace\(id::text, '-', ''\), 12\)/)
    })

    it('generates a value the format constraint itself accepts', () => {
      // Reproduce the SQL expression in TypeScript against a representative id
      // and run it through the application validator: if the sweep could ever
      // produce a value the constraint rejects, section 2 would fail to
      // validate on push against the rows section 1 just wrote.
      const id = '0f9c1a2b-3d4e-5f60-7182-93a4b5c6d7e8'
      const generated = 'user-' + id.replace(/-/g, '').slice(0, 12)
      expect(generated).toBe('user-0f9c1a2b3d4e')
      expect(generated).toHaveLength(17)
      expect(isValidHandle(generated)).toBe(true)
      expect(new RegExp(sqlPatternMatch![1]).test(generated)).toBe(true)
    })

    it('runs BEFORE the constraint is added', () => {
      expect(sqlOnly.indexOf('UPDATE public.user_profiles')).toBeLessThan(
        sqlOnly.indexOf('ADD CONSTRAINT')
      )
    })

    it('documents itself as a fixture sweep gated on an owner confirmation, not a general backfill', () => {
      expect(commentProse).toMatch(/FIXTURE SWEEP, NOT A BACKFILL/)
      expect(commentProse).toMatch(/CHOSEN, never assigned/)
      expect(commentProse).toMatch(/D-09/)
    })
  })

  // ══ D-13: the nullability alteration is absent, deliberately ══════════════
  describe('no nullability alteration (D-13 is escalated, not applied)', () => {
    it('contains no NOT NULL alteration of the handle column anywhere in the file', () => {
      // Asserted against the WHOLE file, not just the executable SQL: a
      // commented-out alteration left behind by a future edit is one
      // uncomment away from breaking four provisioning lanes.
      expect(migration134).not.toMatch(/SET\s+NOT\s+NULL/i)
      expect(sqlOnly).not.toMatch(/ALTER\s+COLUMN\s+handle/i)
      expect(sqlOnly).not.toMatch(/\bNOT\s+NULL\b/i)
    })

    it('records WHY it is absent, so the omission cannot be read as an oversight', () => {
      expect(commentProse).toMatch(/WHAT IS DELIBERATELY ABSENT/)
      expect(commentProse).toMatch(/D-13/)
      expect(commentProse).toMatch(/D-15/)
      expect(commentProse).toMatch(/app_metadata is invisible to handle_new_user\(\) at INSERT/)
    })
  })

  // ══ Housekeeping ══════════════════════════════════════════════════════════
  describe('housekeeping', () => {
    it('carries the standing human-gated push line', () => {
      expect(migration134).toMatch(/HUMAN-GATED/)
      expect(commentProse).toMatch(/never runs `supabase db push` from an agent/)
    })

    it('explains WHY in the phase\'s own terms — D-05 and the PostgREST bypass', () => {
      expect(migration134).toMatch(/D-05/)
      expect(commentProse).toMatch(/column-level UPDATE on handle/)
    })

    it('touches no already-landed migration', () => {
      expect(commentProse).toMatch(/Do NOT edit migrations 001-133/)
    })

    it('ends with the schema-cache reload as its last statement', () => {
      const lines = migration134
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith('--'))
      expect(lines[lines.length - 1]).toBe("NOTIFY pgrst, 'reload schema';")
      const notifies = migration134.match(/NOTIFY pgrst, 'reload schema';/g) ?? []
      expect(notifies).toHaveLength(1)
    })
  })
})
