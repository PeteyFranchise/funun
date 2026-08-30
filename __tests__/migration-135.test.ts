import { readFileSync } from 'fs'
import path from 'path'

// ─── migration 135 — the composition core ───────────────────────────────────
// Text-lock + structural test, in the established style of
// __tests__/migration-134.test.ts (readFileSync + a comment-stripped view of
// the executable SQL). Phase 37's migrations are human-gated: an agent never
// pushes them, so these four files ARE the pre-push review evidence.
//
// What this file locks is mostly ABSENCES — no stored numeral, no reverse
// split-sheet pointer, no labels column, no policy, no percentage on an AI
// entry. Absences are exactly what a later well-meaning edit restores without
// noticing, and each one here is a resolved decision rather than an oversight.

const migration135 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/135_works_core.sql'),
  'utf8'
)

// Executable SQL with every `--` comment line stripped, so "the migration does
// not do X" assertions cannot be defeated (or falsely tripped) by prose. Every
// absence assertion below runs against THIS view — the header deliberately
// NAMES the things the file must not do (uuid_generate_v4, a split_sheet_id
// column, a labels column) in order to explain why they are absent, and an
// assertion against the raw file would make documenting a decision impossible.
const sqlOnly = migration135
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

// The prose is hard-wrapped, so a sentence documenting a WHY is split across
// `--` lines. Unwrap it before asserting on the wording.
const commentProse = normalizeWhitespace(
  migration135
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('--'))
    .map(line => line.replace(/^--\s?/, ''))
    .join(' ')
)

const TABLES = ['works', 'work_versions', 'lyric_blocks', 'ai_entries'] as const

/** The body of a CREATE TABLE statement, from its opening paren to its `);`. */
function tableBlock(table: string): string {
  const marker = `CREATE TABLE public.${table} (`
  const start = sqlOnly.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sqlOnly.indexOf('\n);', start)
  expect(end).toBeGreaterThan(start)
  return sqlOnly.slice(start + marker.length, end)
}

/**
 * Column names declared in a table body. Matches a bare identifier followed by
 * a type keyword, so table-level CHECK constraints and wrapped continuation
 * lines are not mistaken for columns.
 */
function columnNames(table: string): string[] {
  return tableBlock(table)
    .split('\n')
    .map(line => line.trim())
    .filter(line =>
      /^[a-z_]+\s+(UUID|TEXT|JSONB|INTEGER|BIGINT|TIMESTAMPTZ|BOOLEAN|NUMERIC)\b/.test(line)
    )
    .map(line => line.split(/\s+/)[0])
}

describe('migration 135 — works, work_versions, lyric_blocks, ai_entries', () => {
  // ══ The four tables, and the UUID default rule ════════════════════════════
  describe('the composition core exists with the right UUID defaults', () => {
    it.each(TABLES)('creates public.%s', table => {
      expect(sqlOnly).toContain(`CREATE TABLE public.${table} (`)
    })

    it.each(TABLES)('gives public.%s a gen_random_uuid() primary key', table => {
      const idLine = tableBlock(table)
        .split('\n')
        .map(line => normalizeWhitespace(line))
        .find(line => line.startsWith('id '))
      expect(idLine).toBe('id UUID PRIMARY KEY DEFAULT gen_random_uuid(),')
    })

    it('never uses uuid_generate_v4() in any executable statement', () => {
      // uuid-ossp lives in the `extensions` schema and is not on the migration
      // session's search_path — migration 062's first push failed on exactly
      // that, and the header of this file names the function precisely so the
      // rule survives review.
      expect(sqlOnly).not.toMatch(/uuid_generate_v4/)
      expect(commentProse).toMatch(/gen_random_uuid\(\), never uuid_generate_v4\(\)/)
    })

    it('creates every lookup index the derived-numeral reads depend on', () => {
      expect(sqlOnly).toMatch(/CREATE INDEX idx_works_user_id ON public\.works \(user_id\)/)
      expect(sqlOnly).toMatch(
        /CREATE INDEX idx_work_versions_work_id ON public\.work_versions \(work_id, created_at\)/
      )
      expect(sqlOnly).toMatch(
        /CREATE INDEX idx_lyric_blocks_work_id ON public\.lyric_blocks \(work_id, position\)/
      )
      expect(sqlOnly).toMatch(/CREATE INDEX idx_ai_entries_work_id ON public\.ai_entries \(work_id\)/)
    })
  })

  // ══ works: the three-state vocal setting and the graduation seam ══════════
  describe('works carries the three-state vocal setting (DEFAULT-PERFORMER RULE)', () => {
    it('names exactly primary, varies and instrumental', () => {
      const check = normalizeWhitespace(tableBlock('works')).match(
        /vocal_state TEXT NOT NULL DEFAULT 'primary' CHECK \(vocal_state IN \(([^)]*)\)\)/
      )
      expect(check).not.toBeNull()
      const states = check![1].split(',').map(value => value.trim().replace(/'/g, ''))
      expect(states).toEqual(['primary', 'varies', 'instrumental'])
    })

    it('records why the third state is not cosmetic', () => {
      expect(commentProse).toMatch(/'instrumental' is not cosmetic/)
      expect(commentProse).toMatch(/Crate's vocal check/)
      expect(commentProse).toMatch(/omit vocal performer roles/)
    })

    it('carries the 37.2 graduation seam, nullable and non-destructive', () => {
      expect(normalizeWhitespace(tableBlock('works'))).toContain(
        'graduated_project_id UUID REFERENCES public.vault_projects ON DELETE SET NULL'
      )
      expect(commentProse).toMatch(/NOTHING in 37\.1 writes it/)
    })
  })

  // ══ Open Question 1: no reverse pointer to the split sheet ════════════════
  describe('works has no reverse split-sheet pointer (Open Question 1, resolved)', () => {
    it('declares no column whose name ends in split_sheet_id', () => {
      expect(columnNames('works').some(name => name.endsWith('split_sheet_id'))).toBe(false)
    })

    it('declares no split-sheet FK anywhere in the executable SQL', () => {
      expect(sqlOnly).not.toMatch(/REFERENCES\s+(public\.)?split_sheets/i)
    })

    it('records that the direction is a decision, resolved sheet-side only', () => {
      expect(commentProse).toMatch(/NO REVERSE POINTER TO THE SPLIT SHEET/)
      expect(commentProse).toMatch(/Open Question 1/)
      expect(commentProse).toMatch(/added in migration 137/)
      expect(commentProse).toMatch(/insert-then-update-the-other-row/)
    })
  })

  // ══ Open Question 2: labels defer to 37.2 ═════════════════════════════════
  describe('works has no labels column (Open Question 2, resolved as DEFER)', () => {
    it('declares no labels or tags column', () => {
      const names = columnNames('works')
      expect(names).not.toContain('labels')
      expect(names).not.toContain('tags')
      expect(names).not.toContain('label')
    })

    it('declares no array column anywhere in the file', () => {
      // A labels system would arrive as TEXT[] (the shape every other
      // people-or-words list in this schema uses). Nothing here needs one.
      expect(sqlOnly).not.toMatch(/TEXT\s*\[\s*\]/i)
    })

    it('records that the deferral is a decision with a stated cost', () => {
      expect(commentProse).toMatch(/NO ARTIST-LABELS COLUMN/)
      expect(commentProse).toMatch(/Open Question 2/)
      expect(commentProse).toMatch(/DEFER to 37\.2/)
      expect(commentProse).toMatch(/no backfill will ever be needed/)
    })
  })

  // ══ Pitfall 5: no numeral is ever stored ══════════════════════════════════
  describe('no version numeral and no block numeral is stored (RESEARCH Pitfall 5)', () => {
    it.each(['work_versions', 'lyric_blocks'])(
      '%s declares no column whose name contains "number" or "numeral"',
      table => {
        const offenders = columnNames(table).filter(
          name => name.includes('number') || name.includes('numeral')
        )
        expect(offenders).toEqual([])
      }
    )

    it('stores exactly one ordering fact on a block: position', () => {
      expect(columnNames('lyric_blocks')).toContain('position')
      expect(normalizeWhitespace(tableBlock('lyric_blocks'))).toContain('position INTEGER NOT NULL')
    })

    it('orders versions by created_at alone', () => {
      expect(columnNames('work_versions')).toContain('created_at')
      expect(commentProse).toMatch(/NO VERSION NUMERAL COLUMN EXISTS AND NONE MAY BE ADDED/)
      expect(commentProse).toMatch(/ROW_NUMBER\(\) OVER \(PARTITION BY work_id ORDER BY created_at\)/)
    })

    it('records the RENUMBERING RULE and why authorship cannot smudge', () => {
      expect(commentProse).toMatch(/RENUMBERING RULE/)
      expect(commentProse).toMatch(/NO BLOCK NUMERAL COLUMN EXISTS AND NONE MAY BE ADDED/)
      expect(commentProse).toMatch(/authorship — which binds to the row id — cannot smudge/)
    })
  })

  // ══ The REPEAT RULE is a link, not a copy ═════════════════════════════════
  describe('lyric_blocks encodes the REPEAT RULE as a self-referencing link', () => {
    it('declares repeat_of_block_id as a self-FK with ON DELETE SET NULL', () => {
      expect(normalizeWhitespace(tableBlock('lyric_blocks'))).toContain(
        'repeat_of_block_id UUID REFERENCES public.lyric_blocks ON DELETE SET NULL'
      )
    })

    it('records that it is a link and that detach is copy-on-write', () => {
      expect(commentProse).toMatch(/REPEAT RULE/)
      expect(commentProse).toMatch(/is a LINK, not a copy/)
      expect(commentProse).toMatch(/copy-on-write/)
      // CASCADE here would silently delete lyrics elsewhere in the song.
      expect(commentProse).toMatch(/ON DELETE SET NULL, never CASCADE/)
    })
  })

  // ══ The PERFORMER RULE keeps two people-facts apart ═══════════════════════
  describe('lyric_blocks keeps writer and performer as separate facts', () => {
    it('declares both author_user_id and performers', () => {
      const names = columnNames('lyric_blocks')
      expect(names).toContain('author_user_id')
      expect(names).toContain('performers')
    })

    it('records which one moves splits and which one moves only credits', () => {
      expect(commentProse).toMatch(/PERFORMER RULE/)
      expect(commentProse).toMatch(/MOVES SPLITS/)
      expect(commentProse).toMatch(/moves CREDITS and never splits/)
      expect(commentProse).toMatch(/an inherited badge fills the PLAN, never the RECORD/)
    })
  })

  // ══ CAT-Q3: an AI entry is zero-split by construction ═════════════════════
  describe('ai_entries is zero-split and level-consistent (CAT-Q3)', () => {
    it('declares no percentage, share or split column', () => {
      const names = columnNames('ai_entries')
      const offenders = names.filter(
        name =>
          name.includes('percent') ||
          name.includes('split') ||
          name.includes('share') ||
          name.includes('ownership')
      )
      expect(offenders).toEqual([])
    })

    it('declares no NUMERIC column of any kind on the table', () => {
      expect(tableBlock('ai_entries')).not.toMatch(/NUMERIC/i)
    })

    it('carries the table-level CHECK binding level to version_id', () => {
      expect(normalizeWhitespace(tableBlock('ai_entries'))).toContain(
        "CHECK ( (level = 'version' AND version_id IS NOT NULL) OR (level = 'work' AND version_id IS NULL) )"
      )
    })

    it('names DDEX component vocabulary and the swap-vs-generate modes', () => {
      const body = normalizeWhitespace(tableBlock('ai_entries'))
      expect(body).toContain(
        "CHECK (component IN ('vocal', 'instrument', 'lyric', 'melody', 'full'))"
      )
      expect(body).toContain("CHECK (mode IN ('performance', 'generate'))")
    })

    it('keeps the when-in-doubt citation pointer, so the label can stay TRUE', () => {
      expect(normalizeWhitespace(tableBlock('ai_entries'))).toContain(
        'human_source_version_id UUID REFERENCES public.work_versions ON DELETE SET NULL'
      )
      expect(commentProse).toMatch(/ZERO SPLIT BY CONSTRUCTION/)
      expect(commentProse).toMatch(/no percentage column on this table and none may be added/i)
      expect(commentProse).toMatch(/when-in-doubt rule made structural/)
      expect(commentProse).toMatch(/Doubt is resolved by work, not by wording/)
    })
  })

  // ══ RLS on, policies deliberately deferred to 136 ═════════════════════════
  describe('RLS is enabled on all four tables and no policy is created here', () => {
    it.each(TABLES)('enables row level security on public.%s', table => {
      expect(sqlOnly).toMatch(
        new RegExp(`ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY;`)
      )
    })

    it('creates no policy and drops no policy', () => {
      expect(sqlOnly).not.toMatch(/CREATE\s+POLICY/i)
      expect(sqlOnly).not.toMatch(/DROP\s+POLICY/i)
      expect(sqlOnly).not.toMatch(/ALTER\s+POLICY/i)
    })

    it('records WHY the policies live in 136, so the gap is not read as a hole', () => {
      expect(commentProse).toMatch(/135 AND 136 ARE ONE UNIT, SPLIT ONLY FOR REVIEWABILITY/)
      expect(commentProse).toMatch(/Splitting the other way is impossible/)
      expect(commentProse).toMatch(/public\.work_member_tier\(\)/)
      expect(commentProse).toMatch(/pushed together in a single `supabase db push`/)
    })

    it('records the phase RLS doctrine — real policies, not the 128-134 posture', () => {
      expect(commentProse).toMatch(/RLS DOCTRINE FOR THIS PHASE/)
      expect(commentProse).toMatch(/NOT the zero-policy\+REVOKE\s+posture of migrations 128-134/)
    })
  })

  // ══ Reuse, not redefinition ═══════════════════════════════════════════════
  describe('update_updated_at() is reused, never redefined', () => {
    it('attaches the migration 001 trigger function to both mutable tables', () => {
      expect(sqlOnly).toMatch(
        /CREATE TRIGGER works_updated_at\s+BEFORE UPDATE ON public\.works\s+FOR EACH ROW EXECUTE FUNCTION public\.update_updated_at\(\);/
      )
      expect(sqlOnly).toMatch(
        /CREATE TRIGGER lyric_blocks_updated_at\s+BEFORE UPDATE ON public\.lyric_blocks\s+FOR EACH ROW EXECUTE FUNCTION public\.update_updated_at\(\);/
      )
    })

    it('defines no function of its own', () => {
      expect(sqlOnly).not.toMatch(/CREATE\s+(OR REPLACE\s+)?FUNCTION/i)
    })
  })

  // ══ Pitfall 2: storage policies are documented, not widened ═══════════════
  describe('storage stays untouched and the path convention is documented', () => {
    it('alters nothing in the storage schema', () => {
      expect(sqlOnly).not.toMatch(/storage\.objects/i)
      expect(sqlOnly).not.toMatch(/\bstorage\./i)
    })

    it('documents the owner-prefix-free path and why it has to be that way', () => {
      expect(commentProse).toMatch(/\{work_id\}\/\{version_id\}\.\{ext\}/)
      expect(commentProse).toMatch(/NO owner-id prefix/)
      expect(commentProse).toMatch(/inert defense-in-depth/)
      expect(commentProse).toMatch(/REJECT a legitimate collaborator's upload/)
      expect(commentProse).toMatch(/gated at the API route through public\.work_member_tier\(\)/)
    })
  })

  // ══ Housekeeping ══════════════════════════════════════════════════════════
  describe('housekeeping', () => {
    it('carries the standing human-gated push line', () => {
      expect(migration135).toMatch(/HUMAN-GATED/)
      expect(commentProse).toMatch(/never runs `supabase db push` from an agent/)
    })

    it('touches no already-landed migration', () => {
      expect(commentProse).toMatch(/Do NOT edit migrations 001-134/)
    })

    it('ends with the schema-cache reload as its last statement', () => {
      const lines = migration135
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('--'))
      expect(lines[lines.length - 1]).toBe("NOTIFY pgrst, 'reload schema';")
      const notifies = migration135.match(/NOTIFY pgrst, 'reload schema';/g) ?? []
      expect(notifies).toHaveLength(1)
    })
  })
})
