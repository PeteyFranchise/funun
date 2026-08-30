import { readFileSync } from 'fs'
import path from 'path'

// ─── migration 138 — the diary, its capture triggers, the reorder RPC ───────
// Text-lock + structural test, in the established style of
// __tests__/migration-134.test.ts. Phase 37's migrations are human-gated: an
// agent never pushes them, so these four files ARE the pre-push review
// evidence.
//
// Two properties here are worth more than the rest, and both are properties of
// what the file REFUSES to do. First: work_diary_events has exactly one policy
// and it is SELECT — an entry is evidence, and evidence that can be edited
// afterwards is not evidence (T-37-04). Second: reorder_lyric_blocks() is
// granted to service_role and to nobody else — called directly by a client it
// would reshuffle any work in the database (T-37-06).

const migration138 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/138_work_diary_events.sql'),
  'utf8'
)

// Executable SQL with every `--` comment line stripped, so "the migration does
// not do X" assertions cannot be defeated (or falsely tripped) by prose.
const sqlOnly = migration138
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

const commentProse = normalizeWhitespace(
  migration138
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('--'))
    .map(line => line.replace(/^--\s?/, ''))
    .join(' ')
)

const DIARY_KINDS = [
  'version',
  'lyric_edit',
  'roster',
  'sheet',
  'ai_entry',
  'rename',
  'reorder',
  'detach',
  'note',
] as const

const CAPTURE_FUNCTIONS = [
  'capture_work_version_event',
  'capture_lyric_block_added',
  'capture_lyric_block_edited',
  'capture_lyric_block_removed',
  'capture_lyric_block_detached',
  'capture_work_member_event',
  'capture_ai_entry_event',
  'capture_work_rename_event',
  'capture_split_sheet_party_event',
] as const

/** The body of a `CREATE OR REPLACE FUNCTION public.<name>` statement. */
function functionBlock(name: string): string {
  const start = sqlOnly.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sqlOnly.indexOf('\n$$;', start)
  expect(end).toBeGreaterThan(start)
  return sqlOnly.slice(start, end)
}

/** A single `CREATE TRIGGER <name> ... ;` statement. */
function triggerStatement(name: string): string {
  const start = sqlOnly.indexOf(`CREATE TRIGGER ${name}\n`)
  expect(start).toBeGreaterThanOrEqual(0)
  return normalizeWhitespace(sqlOnly.slice(start, sqlOnly.indexOf(';', start) + 1))
}

describe('migration 138 — the diary, its triggers, and the atomic reorder', () => {
  // ══ The table ═════════════════════════════════════════════════════════════
  describe('work_diary_events exists with exactly the nine decided kinds', () => {
    it('creates the table', () => {
      expect(sqlOnly).toContain('CREATE TABLE public.work_diary_events (')
    })

    it('names exactly the nine kinds, in the CHECK, and no others', () => {
      const check = normalizeWhitespace(sqlOnly).match(/kind TEXT NOT NULL CHECK \(kind IN \(([^)]*)\)\)/)
      expect(check).not.toBeNull()
      const kinds = check![1].split(',').map(value => value.trim().replace(/'/g, ''))
      expect(kinds).toEqual([...DIARY_KINDS])
    })

    it('keeps actor_user_id nullable and payload defaulted', () => {
      const body = normalizeWhitespace(
        sqlOnly.slice(
          sqlOnly.indexOf('CREATE TABLE public.work_diary_events ('),
          sqlOnly.indexOf('\n);', sqlOnly.indexOf('CREATE TABLE public.work_diary_events ('))
        )
      )
      expect(body).toContain('actor_user_id UUID REFERENCES auth.users,')
      expect(body).toContain("payload JSONB NOT NULL DEFAULT '{}',")
      expect(body).toContain('work_id UUID REFERENCES public.works ON DELETE CASCADE NOT NULL,')
    })

    it('indexes the reverse-chronological read the feed performs', () => {
      expect(normalizeWhitespace(sqlOnly)).toContain(
        'CREATE INDEX idx_work_diary_events_work_id ON public.work_diary_events (work_id, created_at DESC);'
      )
    })

    it('uses gen_random_uuid() and never uuid_generate_v4()', () => {
      expect(sqlOnly).toContain('gen_random_uuid()')
      expect(sqlOnly).not.toMatch(/uuid_generate_v4/)
    })
  })

  // ══ T-37-04: the diary is append-only to every client ═════════════════════
  describe('the diary is readable and nothing else (T-37-04)', () => {
    it('enables RLS and creates EXACTLY ONE policy, a SELECT policy', () => {
      expect(sqlOnly).toContain('ALTER TABLE public.work_diary_events ENABLE ROW LEVEL SECURITY;')
      const policies = sqlOnly.match(/CREATE POLICY[^;]*;/g) ?? []
      expect(policies).toHaveLength(1)
      expect(policies[0]).toContain('ON public.work_diary_events')
      expect(policies[0]).toContain('FOR SELECT TO authenticated')
    })

    it('creates no UPDATE and no DELETE policy anywhere in the file', () => {
      expect(sqlOnly).not.toMatch(/FOR\s+UPDATE\s+TO/i)
      expect(sqlOnly).not.toMatch(/FOR\s+DELETE\s+TO/i)
      expect(sqlOnly).not.toMatch(/FOR\s+ALL\s+TO/i)
      expect(sqlOnly).not.toMatch(/FOR\s+INSERT\s+TO/i)
    })

    it('carries the write REVOKE verbatim', () => {
      expect(sqlOnly).toContain(
        'REVOKE INSERT, UPDATE, DELETE ON public.work_diary_events FROM authenticated, anon;'
      )
    })

    it('grants no table privilege on the diary back to any client role', () => {
      const tableGrants =
        sqlOnly.match(/GRANT[^;]*ON\s+(TABLE\s+)?public\.work_diary_events[^;]*;/gi) ?? []
      expect(tableGrants).toEqual([])
    })

    it('resolves visibility through migration 136\'s helper pair, wrapped as subselects', () => {
      const policy = normalizeWhitespace(
        (sqlOnly.match(/CREATE POLICY[^;]*;/g) ?? [''])[0]
      )
      expect(policy).toContain('(SELECT public.is_work_owner(work_id, auth.uid()))')
      expect(policy).toContain('(SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL')
      // The 42P17 guard: never an inlined cross-table EXISTS.
      expect(policy).not.toMatch(/EXISTS\s*\(\s*SELECT/i)
    })

    it('records WHY it is read-only, in evidentiary terms', () => {
      expect(commentProse).toMatch(/READ-ONLY TO EVERY CLIENT/)
      expect(commentProse).toMatch(/A DIARY ENTRY IS EVIDENCE/)
      expect(commentProse).toMatch(/an editable arbiter is not an arbiter/)
      expect(commentProse).toMatch(/none may be added/)
    })
  })

  // ══ RESEARCH Pitfall 1: the wall feed is not reused ═══════════════════════
  describe('the public wall feed is documented as the anti-pattern and never touched', () => {
    it('names neither the wall-feed table nor its emitter anywhere in the file', () => {
      expect(migration138).not.toMatch(/activity_events/)
      expect(migration138).not.toMatch(/emitActivity/)
    })

    it('records what makes that feed the wrong thing to reuse', () => {
      expect(commentProse).toMatch(/THE ANTI-PATTERN THIS TABLE EXISTS TO AVOID/)
      expect(commentProse).toMatch(/USING \(true\)/)
      expect(commentProse).toMatch(/swallows its own errors by design/)
      expect(commentProse).toMatch(/The RENDER COMPONENT of that feed is worth copying/)
      expect(commentProse).toMatch(/Nothing in app\/api\/works\/\*\* may import that emitter/)
    })
  })

  // ══ T-37-05 / CAT-Q1: capture lives at the database tier ══════════════════
  describe('every diary-worthy mutation has a SECURITY DEFINER capture function', () => {
    it.each(CAPTURE_FUNCTIONS)('declares public.%s with an empty search path', fn => {
      const block = normalizeWhitespace(functionBlock(fn))
      expect(block).toContain('RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER')
      expect(block).toContain("SET search_path = ''")
    })

    it.each(CAPTURE_FUNCTIONS)('public.%s inserts exactly one diary row', fn => {
      const inserts = functionBlock(fn).match(/INSERT INTO public\.work_diary_events/g) ?? []
      expect(inserts).toHaveLength(1)
    })

    it.each(CAPTURE_FUNCTIONS)('public.%s is revoke-only — trigger-internal, never an RPC', fn => {
      expect(sqlOnly).toMatch(
        new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\(\\)\\s+FROM PUBLIC, anon, authenticated;`)
      )
      expect(sqlOnly).not.toMatch(
        new RegExp(`GRANT\\s+EXECUTE ON FUNCTION public\\.${fn}\\(\\) TO (authenticated|anon)`)
      )
    })

    it('attaches a trigger for every insert-driven source', () => {
      expect(triggerStatement('trg_capture_work_version')).toContain(
        'AFTER INSERT ON public.work_versions'
      )
      expect(triggerStatement('trg_capture_lyric_block_added')).toContain(
        'AFTER INSERT ON public.lyric_blocks'
      )
      expect(triggerStatement('trg_capture_lyric_block_removed')).toContain(
        'AFTER DELETE ON public.lyric_blocks'
      )
      expect(triggerStatement('trg_capture_work_member')).toContain(
        'AFTER INSERT ON public.work_members'
      )
      expect(triggerStatement('trg_capture_ai_entry')).toContain('AFTER INSERT ON public.ai_entries')
      expect(triggerStatement('trg_capture_split_sheet_party')).toContain(
        'AFTER INSERT ON public.split_sheet_parties'
      )
    })

    it('gives every update-driven trigger a column list AND a change guard', () => {
      // Without the column list a reorder would fire the edit trigger; without
      // the WHEN guard a no-op save would.
      const edited = triggerStatement('trg_capture_lyric_block_edited')
      expect(edited).toContain('AFTER UPDATE OF text, block_type, custom_label ON public.lyric_blocks')
      expect(edited).toContain('WHEN ( NEW.text IS DISTINCT FROM OLD.text')
      expect(edited).toContain('NEW.block_type IS DISTINCT FROM OLD.block_type')
      expect(edited).toContain('NEW.custom_label IS DISTINCT FROM OLD.custom_label')

      const detached = triggerStatement('trg_capture_lyric_block_detached')
      expect(detached).toContain('AFTER UPDATE OF repeat_of_block_id ON public.lyric_blocks')
      expect(detached).toContain(
        'WHEN (OLD.repeat_of_block_id IS NOT NULL AND NEW.repeat_of_block_id IS NULL)'
      )

      const renamed = triggerStatement('trg_capture_work_rename')
      expect(renamed).toContain('AFTER UPDATE OF title ON public.works')
      expect(renamed).toContain('WHEN (NEW.title IS DISTINCT FROM OLD.title)')
    })

    it('drops each trigger before creating it, so a re-run is idempotent', () => {
      for (const trigger of [
        'trg_capture_work_version',
        'trg_capture_lyric_block_added',
        'trg_capture_lyric_block_edited',
        'trg_capture_lyric_block_removed',
        'trg_capture_lyric_block_detached',
        'trg_capture_work_member',
        'trg_capture_ai_entry',
        'trg_capture_work_rename',
        'trg_capture_split_sheet_party',
      ]) {
        expect(sqlOnly).toMatch(new RegExp(`DROP TRIGGER IF EXISTS ${trigger} ON public\\.`))
      }
    })

    it('records that capture is a database-tier guarantee, and names the one exception', () => {
      expect(commentProse).toMatch(/never depends on discipline/)
      expect(commentProse).toMatch(/DATABASE-TIER guarantee, not an application convention/)
      expect(commentProse).toMatch(/THE ONE DELIBERATE EXCEPTION: kind 'note' has no trigger/)
      expect(commentProse).toMatch(/it must stay the only one/)
    })

    it('records that the lyric cadence is the client\'s debounce, not a throttle here', () => {
      expect(commentProse).toMatch(/fires per SAVED UPDATE, not per keystroke/)
      expect(commentProse).toMatch(/not a wall of "lyrics changed"/)
    })

    it('carries a payload rich enough for the feed, and never a numeral', () => {
      const aiEntry = normalizeWhitespace(functionBlock('capture_ai_entry_event'))
      // The citation string itself is recorded at the moment it is agreed to.
      expect(aiEntry).toContain("'citation', NEW.citation")
      expect(aiEntry).toContain("'mode', NEW.mode")

      const rename = normalizeWhitespace(functionBlock('capture_work_rename_event'))
      expect(rename).toContain("'previousTitle', OLD.title")
      expect(rename).toContain("'title', NEW.title")

      // A stored numeral in a payload would go stale on the next reorder.
      expect(sqlOnly).not.toMatch(/'blockNumber'/)
      expect(sqlOnly).not.toMatch(/'versionNumber'/)
    })
  })

  // ══ T-37-10: the new trigger on a live table is a strict no-op ════════════
  describe('the split-sheet-party trigger no-ops for every sheet that is not a work', () => {
    it('reads the parent sheet and returns early before any insert', () => {
      const block = functionBlock('capture_split_sheet_party_event')
      const lookupIndex = block.indexOf('FROM public.split_sheets')
      const guardIndex = block.indexOf('IF v_work_id IS NULL THEN')
      const returnIndex = block.indexOf('RETURN NEW;')
      const insertIndex = block.indexOf('INSERT INTO public.work_diary_events')

      expect(lookupIndex).toBeGreaterThanOrEqual(0)
      expect(guardIndex).toBeGreaterThan(lookupIndex)
      expect(returnIndex).toBeGreaterThan(guardIndex)
      // The early return comes BEFORE the insert — that ordering is the no-op.
      expect(insertIndex).toBeGreaterThan(returnIndex)
    })

    it('scopes the lookup to the row that just changed', () => {
      expect(normalizeWhitespace(functionBlock('capture_split_sheet_party_event'))).toContain(
        'WHERE sheet.id = NEW.split_sheet_id;'
      )
    })

    it('records why attaching to a live table is safe', () => {
      expect(commentProse).toMatch(/THIS TRIGGER IS ATTACHED TO A TABLE THE EXISTING SPLIT-SHEET BUILDER/)
      expect(commentProse).toMatch(/strict no-op/)
      expect(commentProse).toMatch(/NULL for every split sheet that exists today/)
    })
  })

  // ══ T-37-06 / T-37-07: the atomic reorder ═════════════════════════════════
  describe('reorder_lyric_blocks is atomic, validated, and service-role only', () => {
    const reorder = () => functionBlock('reorder_lyric_blocks')

    it('is SECURITY DEFINER with an empty search path and the locked signature', () => {
      const block = normalizeWhitespace(reorder())
      expect(block).toContain('CREATE OR REPLACE FUNCTION public.reorder_lyric_blocks( p_work_id UUID, p_order JSONB )')
      expect(block).toContain('RETURNS INT LANGUAGE plpgsql SECURITY DEFINER')
      expect(block).toContain("SET search_path = ''")
    })

    it('takes the SHARE ROW EXCLUSIVE table lock before counting', () => {
      const block = reorder()
      const lockIndex = block.indexOf('LOCK TABLE public.lyric_blocks IN SHARE ROW EXCLUSIVE MODE;')
      const countIndex = block.indexOf('SELECT count(*) INTO v_expected')
      const updateIndex = block.indexOf('UPDATE public.lyric_blocks AS block')
      expect(lockIndex).toBeGreaterThanOrEqual(0)
      expect(countIndex).toBeGreaterThan(lockIndex)
      expect(updateIndex).toBeGreaterThan(countIndex)
    })

    it('rejects a malformed, duplicated, non-contiguous or incomplete order', () => {
      const block = reorder()
      expect(block).toContain("RAISE EXCEPTION 'order must be an array'")
      expect(block).toContain("RAISE EXCEPTION 'order may contain at most 200 items'")
      expect(block).toContain("RAISE EXCEPTION 'order contains an invalid block id or position'")
      expect(block).toContain("RAISE EXCEPTION 'order contains duplicate block ids'")
      expect(block).toContain("RAISE EXCEPTION 'positions must be unique and contiguous from zero'")
      expect(block).toContain(
        "RAISE EXCEPTION 'order must contain every current block of this work exactly once'"
      )
    })

    it('raises a serialization failure if the block set drifted under the lock', () => {
      const block = normalizeWhitespace(reorder())
      expect(block).toContain('GET DIAGNOSTICS v_updated = ROW_COUNT;')
      expect(block).toContain(
        "IF v_updated <> v_expected THEN RAISE EXCEPTION 'blocks changed during reorder' USING ERRCODE = 'serialization_failure';"
      )
    })

    it('scopes every read and the update to p_work_id', () => {
      const block = normalizeWhitespace(reorder())
      expect(block).toContain('FROM public.lyric_blocks AS block WHERE block.work_id = p_work_id;')
      expect(block).toContain('WHERE block.id = requested.id AND block.work_id = p_work_id;')
    })

    it('applies every position in ONE set-based UPDATE', () => {
      const updates = reorder().match(/UPDATE public\.lyric_blocks/g) ?? []
      expect(updates).toHaveLength(1)
      expect(normalizeWhitespace(reorder())).toContain(
        'FROM jsonb_to_recordset(p_order) AS requested(id UUID, "position" INT)'
      )
    })

    it('emits EXACTLY ONE reorder diary event for the whole drag', () => {
      const inserts = reorder().match(/INSERT INTO public\.work_diary_events/g) ?? []
      expect(inserts).toHaveLength(1)
      expect(normalizeWhitespace(reorder())).toContain("p_work_id, 'reorder', auth.uid(),")
    })

    it('is revoked from every client role and granted only to service_role', () => {
      const revokeIndex = sqlOnly.indexOf(
        'REVOKE ALL ON FUNCTION public.reorder_lyric_blocks(UUID, JSONB) FROM PUBLIC, anon, authenticated;'
      )
      const grantIndex = sqlOnly.indexOf(
        'GRANT EXECUTE ON FUNCTION public.reorder_lyric_blocks(UUID, JSONB) TO service_role;'
      )
      expect(revokeIndex).toBeGreaterThanOrEqual(0)
      expect(grantIndex).toBeGreaterThan(revokeIndex)
      expect(sqlOnly).not.toMatch(
        /GRANT EXECUTE ON FUNCTION public\.reorder_lyric_blocks\(UUID, JSONB\) TO authenticated/
      )
    })

    it('records why the event is emitted here and not from a per-row trigger', () => {
      expect(commentProse).toMatch(
        /WHY THE DIARY EVENT IS EMITTED FROM INSIDE THIS FUNCTION, NOT FROM A PER-ROW TRIGGER/
      )
      expect(commentProse).toMatch(/ONE DRAG IS ONE EVENT/)
    })

    it('records why it lives in 138 rather than 137', () => {
      expect(commentProse).toMatch(/WHY THIS LIVES IN 138 AND NOT IN 137/)
      expect(commentProse).toMatch(/forward reference to a table that does not exist yet/)
    })

    it('records the honest limit on reorder attribution', () => {
      expect(commentProse).toMatch(/ON ATTRIBUTION/)
      expect(commentProse).toMatch(/the reorder event's actor is normally NULL/)
      expect(commentProse).toMatch(/a reorder moves no authorship and settles no money/)
    })
  })

  // ══ Housekeeping ══════════════════════════════════════════════════════════
  describe('housekeeping', () => {
    it('carries the standing human-gated push line', () => {
      expect(migration138).toMatch(/HUMAN-GATED/)
      expect(commentProse).toMatch(/never runs `supabase db push` from an agent/)
    })

    it('touches no already-landed migration', () => {
      expect(commentProse).toMatch(/Do NOT edit migrations 001-134/)
    })

    it('ends with the schema-cache reload as its last statement', () => {
      const lines = migration138
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('--'))
      expect(lines[lines.length - 1]).toBe("NOTIFY pgrst, 'reload schema';")
      const notifies = migration138.match(/NOTIFY pgrst, 'reload schema';/g) ?? []
      expect(notifies).toHaveLength(1)
    })
  })
})
