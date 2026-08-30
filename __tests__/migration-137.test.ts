import { readFileSync } from 'fs'
import path from 'path'

// ─── migration 137 — the sheet→work link, and nothing else ──────────────────
// Text-lock + structural test, in the established style of
// __tests__/migration-134.test.ts. Phase 37's migrations are human-gated: an
// agent never pushes them, so these four files ARE the pre-push review
// evidence.
//
// Almost every assertion here is an assertion of RESTRAINT. This file touches
// the two most dangerous tables in the codebase — split_sheets, whose RLS pair
// migration 064 exists solely to de-recurse, and (by proximity of temptation)
// vault_projects, whose type CHECK still has to validate the one existing
// production row typed 'unreleased'. One nullable column is the entire change,
// and the suite fails if it ever becomes more than that.

const migration137 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/137_split_sheets_work_link.sql'),
  'utf8'
)

// Executable SQL with every `--` comment line stripped, so "the migration does
// not do X" assertions cannot be defeated (or falsely tripped) by prose — and
// the header of this file deliberately DISCUSSES the RLS pair and the project
// type CHECK in order to explain why it leaves them alone.
const sqlOnly = migration137
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

// The same view with COMMENT ON bodies removed, for the same reason: a comment
// that documents a non-change must not read as the change.
const sqlNoDocs = sqlOnly.replace(/COMMENT ON [\s\S]*?';\n/g, '')

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

const commentProse = normalizeWhitespace(
  migration137
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('--'))
    .map(line => line.replace(/^--\s?/, ''))
    .join(' ')
)

describe('migration 137 — one nullable column on split_sheets', () => {
  // ══ The whole schema change ═══════════════════════════════════════════════
  describe('exactly one ALTER TABLE, adding exactly one column, idempotently', () => {
    it('issues a single ALTER TABLE and it targets split_sheets', () => {
      const alters = sqlOnly.match(/ALTER\s+TABLE\s+[a-z_.]+/gi) ?? []
      expect(alters).toHaveLength(1)
      expect(alters.map(normalizeWhitespace)).toEqual(['ALTER TABLE public.split_sheets'])
    })

    it('adds exactly one column, and does so idempotently', () => {
      const additions = sqlOnly.match(/ADD\s+COLUMN/gi) ?? []
      expect(additions).toHaveLength(1)
      expect(normalizeWhitespace(sqlOnly)).toContain(
        'ALTER TABLE public.split_sheets ADD COLUMN IF NOT EXISTS work_id UUID REFERENCES public.works ON DELETE SET NULL;'
      )
    })

    it('points the FK at works with SET NULL, never CASCADE', () => {
      // Deleting a work must not delete the legal record of who wrote it —
      // migration 067's sentence, applied here for the same reason.
      expect(sqlOnly).toMatch(/REFERENCES public\.works ON DELETE SET NULL/)
      expect(sqlOnly).not.toMatch(/REFERENCES public\.works ON DELETE CASCADE/)
    })

    it('creates the lookup index the living-draft resolution depends on', () => {
      expect(normalizeWhitespace(sqlOnly)).toContain(
        'CREATE INDEX IF NOT EXISTS idx_split_sheets_work_id ON public.split_sheets (work_id);'
      )
    })

    it('drops nothing and alters no existing column or constraint', () => {
      expect(sqlOnly).not.toMatch(/\bDROP\b/i)
      expect(sqlOnly).not.toMatch(/ALTER\s+COLUMN/i)
      expect(sqlOnly).not.toMatch(/ADD\s+CONSTRAINT/i)
      expect(sqlOnly).not.toMatch(/\bNOT\s+NULL\b/i)
    })

    it('runs only the four statement kinds it claims to', () => {
      const verbs = (
        sqlOnly.match(
          /^\s*(ALTER|CREATE|COMMENT|NOTIFY|UPDATE|INSERT|DELETE|DROP|GRANT|REVOKE|TRUNCATE)\b/gim
        ) ?? []
      ).map(verb => verb.trim().toUpperCase())
      expect(verbs).toEqual(['ALTER', 'CREATE', 'COMMENT', 'NOTIFY'])
    })
  })

  // ══ Open Question 1: the FK direction is a decision ═══════════════════════
  describe('the FK direction is documented as resolved, not assumed', () => {
    it('records the three reasons the sheet side wins', () => {
      expect(commentProse).toMatch(/WHY THE FK POINTS THIS WAY \(Open Question 1, resolved\)/)
      expect(commentProse).toMatch(/migration 067/)
      expect(commentProse).toMatch(/avoids a mutual FK pair/)
      expect(commentProse).toMatch(/costs nothing at read time/)
    })

    it('records that there is no reverse column and never will be', () => {
      expect(commentProse).toMatch(
        /THERE IS NO REVERSE COLUMN ON public\.works AND THERE WILL NOT BE ONE/
      )
      // 135's header carries the same decision from the other side, so neither
      // absence can later be read as the other file's oversight.
      expect(commentProse).toMatch(/Migration 135's own header records the same decision/)
    })

    it('adds no column to works', () => {
      expect(sqlNoDocs).not.toMatch(/ALTER\s+TABLE\s+public\.works/i)
    })
  })

  // ══ T-37-10 adjacent: the split-sheet RLS pair is not touched ═════════════
  describe('the recursion-sensitive split-sheet RLS pair is left completely alone', () => {
    it('creates, drops and alters no policy', () => {
      expect(sqlOnly).not.toMatch(/CREATE\s+POLICY/i)
      expect(sqlOnly).not.toMatch(/DROP\s+POLICY/i)
      expect(sqlOnly).not.toMatch(/ALTER\s+POLICY/i)
      expect(sqlOnly).not.toMatch(/ROW LEVEL SECURITY/i)
    })

    it('does not mention split_sheet_parties in any executable statement', () => {
      expect(sqlNoDocs).not.toMatch(/split_sheet_parties/i)
    })

    it('creates no function and no trigger', () => {
      expect(sqlOnly).not.toMatch(/CREATE\s+(OR REPLACE\s+)?FUNCTION/i)
      expect(sqlOnly).not.toMatch(/CREATE\s+TRIGGER/i)
      expect(sqlOnly).not.toMatch(/SECURITY DEFINER/i)
    })

    it('records WHY the non-change is deliberate, with the cost of the alternative', () => {
      expect(commentProse).toMatch(/WHAT THIS MIGRATION DELIBERATELY DOES NOT TOUCH: THE SHEET RLS/)
      expect(commentProse).toMatch(/migration 064 exists for the single purpose/)
      expect(commentProse).toMatch(/42P17/)
      expect(commentProse).toMatch(/service-role read in a lib helper that has ALREADY proved work membership/)
      expect(commentProse).toMatch(/would be a bad trade/)
    })
  })

  // ══ RESEARCH Pitfall 4: vault_projects.type keeps validating ══════════════
  describe('vault_projects and its type CHECK are untouched (RESEARCH Pitfall 4)', () => {
    it('names vault_projects in no executable statement', () => {
      expect(sqlNoDocs).not.toMatch(/vault_projects/i)
    })

    it('never references the retired type value in executable SQL', () => {
      expect(sqlNoDocs).not.toMatch(/'unreleased'/i)
      expect(sqlNoDocs).not.toMatch(/\bCHECK\b/i)
    })

    it('records that the retirement is a UI decision, not a schema one', () => {
      expect(commentProse).toMatch(/vault_projects\.type IS ALSO UNTOUCHED/)
      expect(commentProse).toMatch(/retires the 'unreleased' project type from the CREATE FLOW UI/)
      expect(commentProse).toMatch(/must keep validating/)
      expect(commentProse).toMatch(/turn a UI decision into a destructive one/)
    })
  })

  // ══ Housekeeping ══════════════════════════════════════════════════════════
  describe('housekeeping', () => {
    it('documents the column it adds, including how a living draft is found', () => {
      const comment = sqlOnly.match(/COMMENT ON COLUMN public\.split_sheets\.work_id IS[\s\S]*?';/)
      expect(comment).not.toBeNull()
      expect(comment![0]).toContain('LIVING DRAFT')
      expect(comment![0]).toContain('no reverse pointer')
    })

    it('carries the standing human-gated push line', () => {
      expect(migration137).toMatch(/HUMAN-GATED/)
      expect(commentProse).toMatch(/never runs `supabase db push` from an agent/)
    })

    it('touches no already-landed migration', () => {
      expect(commentProse).toMatch(/Do NOT edit migrations 001-134/)
    })

    it('ends with the schema-cache reload as its last statement', () => {
      const lines = migration137
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('--'))
      expect(lines[lines.length - 1]).toBe("NOTIFY pgrst, 'reload schema';")
      const notifies = migration137.match(/NOTIFY pgrst, 'reload schema';/g) ?? []
      expect(notifies).toHaveLength(1)
    })
  })
})
