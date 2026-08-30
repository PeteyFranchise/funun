import { readFileSync } from 'fs'
import path from 'path'
import { HANDLE_MIN_LENGTH, HANDLE_MAX_LENGTH } from '@/lib/handles/validate'

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

describe('migration 134 — handle format constraint, and deliberately no backfill', () => {
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

  // ══ There is no sweep, and there must never be one again ═════════
  // An earlier draft of this migration swept the handle-less rows on the
  // premise that all of them were fixtures. The owner instead DELETED those
  // five fixture accounts outright (2026-08-27), so every remaining
  // handle-less row belongs to a REAL PERSON. A sweep would now auto-assign a
  // public identity to someone who has simply not signed in since the D-09
  // gate shipped — the exact thing the owner's locked decision forbids
  // (36-CONTEXT.md D-09, ROADMAP owner decision 4). These assertions are the
  // inverse text-lock: they fail the moment the sweep returns in any form.
  describe('no backfill and no sweep — handles are prompted, never generated', () => {
    it('contains no UPDATE statement at all', () => {
      expect(sqlOnly).not.toMatch(/\bUPDATE\b/i)
    })

    it('writes to no row of user_profiles — the only DDL is the constraint plus its comment', () => {
      expect(sqlOnly).not.toMatch(/SET\s+handle/i)
      expect(sqlOnly).not.toMatch(/\bINSERT\s+INTO\b/i)
      expect(sqlOnly).not.toMatch(/\bDELETE\s+FROM\b/i)
      // Statement-initiating verbs at line start, rather than a naive split on
      // ';' — the column comment's own prose contains a semicolon, so splitting
      // would report a phantom fourth statement.
      const verbs = (
        sqlOnly.match(
          /^\s*(ALTER|COMMENT|NOTIFY|UPDATE|INSERT|DELETE|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\b/gim
        ) ?? []
      ).map(verb => verb.trim().toUpperCase())
      expect(verbs).toEqual(['ALTER', 'COMMENT', 'NOTIFY'])
      expect(sqlOnly).toMatch(/ALTER TABLE public\.user_profiles\s+ADD CONSTRAINT /)
      expect(sqlOnly).toMatch(/COMMENT ON COLUMN public\.user_profiles\.handle IS/)
    })

    it('never generates a handle value, in any statement or any leftover comment', () => {
      // Asserted against the WHOLE file: a commented-out sweep is one
      // uncomment away from renaming three real people.
      expect(migration134).not.toMatch(/'user-'\s*\|\|/)
      expect(migration134).not.toMatch(/WHERE handle IS NULL;/)
    })

    it('records WHY there is no sweep, so its absence cannot be read as an oversight', () => {
      expect(commentProse).toMatch(/THERE IS NO BACKFILL AND NO SWEEP IN THIS FILE/)
      expect(commentProse).toMatch(/DELETED those five fixture accounts outright/)
      expect(commentProse).toMatch(/2026-08-27/)
      expect(commentProse).toMatch(/REAL PEOPLE/)
      expect(commentProse).toMatch(/PROMPTED to choose a handle and never have one generated/)
      expect(commentProse).toMatch(/D-09/)
    })

    it('the constraint tolerates the handle-less humans it will be pushed against', () => {
      // Three real accounts still have no handle at push time. The
      // NULL-tolerant disjunct is what makes applying this migration today a
      // no-op for them rather than a failed validation — and the column
      // comment says so, so nobody "tidies it away" later.
      expect(sqlOnly).toMatch(/handle IS NULL\s+OR /)
      expect(sqlOnly).toMatch(/Never generate a handle for an existing account/)
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
