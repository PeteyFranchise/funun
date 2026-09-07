import { readFileSync } from 'fs'
import path from 'path'

// ─── migration 194 — the set-based, paginated catalogue page function ─────
// Text-lock + structural test, in the established style of
// __tests__/migration-186.test.ts, __tests__/migration-192.test.ts and
// __tests__/migration-193.test.ts. This project's migrations are
// human-gated: an agent never pushes them, so this file IS the pre-push
// review evidence for R-10 / WSR-20 (finding F18).
//
// LIMITATION, STATED UP FRONT: this suite proves what the SQL DECLARES. It
// does NOT prove that a workspace caller receives nothing extra at runtime,
// and it cannot prove the page is actually bounded in the planner. It never
// executes a statement and never touches a database. The behavioural halves
// are (1) lib/workspaces/catalogue.test.ts, which proves the TypeScript
// issues a bounded, unmemoised number of statements, and (2) plan 11's
// owner-run checkpoint, whose step 8 runs EXPLAIN ANALYZE on this very
// function and confirms index scans with no SQLSTATE 42P17.

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/194_workspace_catalogue_rpc.sql'),
  'utf8'
)

// Executable SQL only, with `--` comment lines stripped, so "the migration
// does not do X" assertions cannot be defeated (or falsely tripped) by
// prose. Mirrors migration-186's / 192's / 193's pattern.
const sqlOnly = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

// The same view with COMMENT ON bodies removed too, for assertions about
// what the migration actually DOES rather than what its documentation
// (including the inline COMMENT ON FUNCTION string, which deliberately
// NAMES the withheld material so the next reader knows it was considered)
// discusses.
const sqlNoDocs = sqlOnly.replace(/COMMENT ON [\s\S]*?';\n/g, '')

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

const commentProse = normalizeWhitespace(
  migration
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('--'))
    .map((line) => line.replace(/^--\s?/, ''))
    .join(' ')
)

const FN = 'workspace_catalogue_page'
const SIGNATURE = `public.${FN}(uuid, uuid, int, int, uuid)`

/** The body of the `CREATE OR REPLACE FUNCTION public.<name>` statement. */
function functionBlock(name: string): string {
  const start = sqlOnly.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sqlOnly.indexOf('\n$$;', start)
  expect(end).toBeGreaterThan(start)
  return sqlOnly.slice(start, end)
}

/** The declared `RETURNS TABLE (...)` column list — the security contract
 * itself, sliced away from the body so an assertion about the contract
 * cannot be satisfied (or tripped) by the body. Same slicing rule as
 * __tests__/migration-193.test.ts's `returnColumnList`. */
function returnColumnList(name: string): string {
  const block = functionBlock(name)
  const start = block.indexOf('RETURNS TABLE (')
  expect(start).toBeGreaterThanOrEqual(0)
  const end = block.indexOf('LANGUAGE sql', start)
  expect(end).toBeGreaterThan(start)
  return block.slice(start, end)
}

/** Columns that must never appear in ANY workspace read function's return
 * column list, whichever table they belong to (custody D-01/D-09, D-40).
 * DUPLICATED from __tests__/migration-193.test.ts rather than imported,
 * because that file is a test module with no exports — the drift guard
 * below reads its source and asserts the two arrays are identical, so a
 * later edit to either one fails this suite instead of silently letting the
 * catalogue's contract diverge from the four child-table contracts. */
const FORBIDDEN_RETURN_COLUMNS = [
  'audio_file_url',
  'audio_file_size',
  'lyrics',
  'url',
  'document_data',
  'file_url',
  'signed_by',
  'esign_completion_claim_token',
  'inputs',
  'output',
  'metadata',
  'user_id',
] as const

/** The complete, reviewed return contract. Asserted verbatim so adding a
 * column is a deliberate, visible edit to this file. */
const DECLARED_RETURN_LIST =
  'RETURNS TABLE ( project_id UUID, holder_user_id UUID, title TEXT, type TEXT, ' +
  'release_date DATE, vault_readiness_score INTEGER, can_view_metadata BOOLEAN, ' +
  'can_view_private_rights_identifiers BOOLEAN, genre TEXT, sub_genre TEXT, ' +
  'label TEXT, publisher TEXT, c_line TEXT, p_line TEXT, copyright_year INTEGER, ' +
  'primary_language TEXT, contact_name TEXT, contact_email TEXT, contact_phone TEXT, ' +
  'upc TEXT )'

describe('migration 194 — the set-based paginated catalogue page function', () => {
  // ══ Header discipline ═══════════════════════════════════════════════════
  describe('header states the human gate, the joint push and the correction to 191-193', () => {
    it('carries the HUMAN-GATED paragraph naming the prior convention migrations', () => {
      expect(migration).toContain('HUMAN-GATED')
      for (const m of ['078', '080', '136', '177', '181-193']) {
        expect(commentProse).toContain(m)
      }
    })

    it('states that 190 through 195 push together and this file is never staged alone', () => {
      expect(commentProse).toContain('PUSHED WITH 190, 191, 192, 193 AND 195 — NEVER STAGED ALONE')
      expect(commentProse).toContain('plans 04, 06, 07, 08, 11 and 15')
    })

    it('records that 190 was NOT pushed separately and that 195 joins this window', () => {
      expect(commentProse).toContain('Migration 190 (plan 02')
      expect(commentProse).toContain('was NOT pushed separately')
      expect(commentProse).toContain('Migration 195 (plan 15')
      expect(commentProse).toContain('LIVE LEDGER')
    })

    it('does NOT repeat the stale 195-196 / 197-198 reservation locked into 191-193', () => {
      expect(commentProse).toContain('196-197 are RESERVED for Phase 38.0.2')
      expect(commentProse).toContain('198-199 are RESERVED for Phase 38.2')
      expect(commentProse).not.toContain('195-196 are RESERVED')
      expect(commentProse).not.toContain('197-198 are RESERVED')
    })

    it('names R-10 / WSR-20 and finding F18, and states the N+1 arithmetic concretely', () => {
      for (const ref of ['R-10 / WSR-20', 'F18']) {
        expect(commentProse).toContain(ref)
      }
      expect(commentProse).toContain('403 sequential round trips')
    })

    it('states that the fix is one live query and that caching is banned, naming D-49', () => {
      expect(commentProse).toContain('THE FIX IS ONE LIVE QUERY, NOT A CACHED REPEAT')
      expect(commentProse).toContain('D-49')
      expect(commentProse).toContain('memoising')
    })
  })

  // ══ Function shape ══════════════════════════════════════════════════════
  describe('the function is declared exactly as reviewed', () => {
    it('is RETURNS TABLE, LANGUAGE sql STABLE SECURITY DEFINER, empty search path', () => {
      const block = normalizeWhitespace(functionBlock(FN))
      expect(block).toContain('RETURNS TABLE (')
      expect(block).toContain('LANGUAGE sql STABLE SECURITY DEFINER')
      expect(block).toContain("SET search_path = ''")
      expect(block).not.toContain('IMMUTABLE')
      expect(block).not.toContain('VOLATILE')
      expect(block).not.toContain('LANGUAGE plpgsql')
    })

    it('takes the five reviewed parameters, with p_project_id optional', () => {
      const block = normalizeWhitespace(functionBlock(FN))
      expect(block).toContain(
        `CREATE OR REPLACE FUNCTION public.${FN}( p_workspace_id UUID, p_uid UUID, ` +
          'p_limit INT, p_offset INT, p_project_id UUID DEFAULT NULL )'
      )
    })

    it('carries the REVOKE/GRANT pair — anon revoked, authenticated granted', () => {
      expect(sqlNoDocs).toContain(`REVOKE EXECUTE ON FUNCTION ${SIGNATURE} FROM PUBLIC, anon;`)
      expect(sqlNoDocs).toContain(`GRANT  EXECUTE ON FUNCTION ${SIGNATURE} TO authenticated;`)
    })

    it('is the only function this migration creates', () => {
      const created = (sqlNoDocs.match(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)/g) ?? []).map(
        (s) => s.replace('CREATE OR REPLACE FUNCTION public.', '')
      )
      expect(created).toEqual([FN])
    })
  })

  // ══ The six hops ════════════════════════════════════════════════════════
  describe('the body applies the same six hops as migration 192’s per-row helper', () => {
    const block = () => normalizeWhitespace(functionBlock(FN))

    it('hop 0 — the D-56 kill switch is the first conjunct of the WHERE clause', () => {
      expect(block()).toContain('WHERE public.workspace_access_enabled()')
    })

    it('hop 1 — a LIVE attachment in this workspace, optionally narrowed to one project', () => {
      const b = block()
      expect(b).toContain('FROM public.workspace_attachments a')
      expect(b).toContain('AND a.workspace_id = p_workspace_id')
      expect(b).toContain('AND a.detached_at IS NULL')
      expect(b).toContain('AND (p_project_id IS NULL OR a.project_id = p_project_id)')
    })

    it('hop 2 — an ACTIVE, UNEXPIRED membership (the WSR-17 canonical definition)', () => {
      const b = block()
      expect(b).toContain('JOIN public.workspace_members m')
      expect(b).toContain('AND m.user_id = p_uid')
      expect(b).toContain("AND m.status = 'active'")
      expect(b).toContain('AND (m.expires_at IS NULL OR m.expires_at > now())')
    })

    it('hop 3 — an accepted, in-window relationship joined through the attachment’s own relationship_id, with NO nullable fallback', () => {
      const b = block()
      expect(b).toContain('JOIN public.workspace_roster_relationships r')
      expect(b).toContain('AND r.id = a.relationship_id')
      expect(b).toContain("AND r.state = 'accepted'")
      expect(b).toContain('AND (r.effective_from IS NULL OR r.effective_from <= CURRENT_DATE)')
      expect(b).toContain('AND (r.terminates_on IS NULL OR r.terminates_on > CURRENT_DATE)')
      expect(b).not.toContain('a.relationship_id IS NULL')
    })

    it('hop 4 — an unrevoked grant on that SAME relationship, with NO nullable fallback', () => {
      const b = block()
      expect(b).toContain('JOIN public.workspace_grants g')
      expect(b).toContain('AND g.relationship_id = r.id')
      expect(b).toContain('AND g.revoked_at IS NULL')
      expect(b).toContain('AND (g.project_id IS NULL OR g.project_id = a.project_id)')
      expect(b).not.toContain('g.relationship_id IS NULL')
    })

    it('hop 5 — the custody binding p.user_id = r.member_user_id (R-04/WSR-06)', () => {
      const b = block()
      expect(b).toContain('JOIN public.vault_projects p ON p.id = a.project_id')
      expect(b).toContain('AND p.user_id = r.member_user_id')
    })

    it('hop 6 — the delegation lineage is re-walked for every grant row (R-01/WSR-02)', () => {
      expect(block()).toContain('AND public.workspace_grant_lineage_live(g.id)')
    })

    it('row visibility is view_summaries, matching migration 193’s surviving RLS branch', () => {
      expect(block()).toContain("HAVING bool_or(g.permission = 'view_summaries')")
    })

    it('considers only the three permissions that can affect this page', () => {
      const b = block()
      expect(b).toContain(
        "AND g.permission IN ( 'view_summaries', 'view_metadata', 'view_private_rights_identifiers' )"
      )
      // No other permission literal appears in executable SQL at all.
      for (const forbidden of [
        'access_clean_masters',
        'download_protected_audio',
        'act_on_behalf',
        'view_earnings',
        'edit_metadata',
      ]) {
        expect({ forbidden, present: sqlNoDocs.includes(forbidden) }).toEqual({
          forbidden,
          present: false,
        })
      }
    })
  })

  // ══ The caller-identity binding (execution-time Rule 2 addition) ════════
  describe('p_uid can only ever name the caller', () => {
    it('binds the caller-supplied p_uid to auth.uid() inside the WHERE clause', () => {
      expect(normalizeWhitespace(functionBlock(FN))).toContain('AND p_uid = (SELECT auth.uid())')
    })

    it('documents why, and that a NULL auth.uid() returns zero rows', () => {
      expect(commentProse).toContain('THE CALLER-IDENTITY BINDING')
      expect(commentProse).toContain('`p_uid` is CALLER-SUPPLIED')
      expect(commentProse).toContain('fail closed')
    })
  })

  // ══ Boundedness and determinism ═════════════════════════════════════════
  describe('the page is bounded and deterministically ordered', () => {
    it('clamps p_limit inside the function, with a stated ceiling and default', () => {
      const b = normalizeWhitespace(functionBlock(FN))
      expect(b).toContain('LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)')
      expect(b).toContain('OFFSET GREATEST(COALESCE(p_offset, 0), 0)')
    })

    it('states why the clamp exists — an unbounded page is a DoS surface', () => {
      expect(commentProse).toContain('denial-of-service surface')
      expect(commentProse).toContain('200 is the ceiling and 50 the default')
    })

    it('orders deterministically by title then id, at both query levels', () => {
      const b = normalizeWhitespace(functionBlock(FN))
      expect(b).toContain('ORDER BY p.title ASC, p.id ASC')
      expect(b).toContain('ORDER BY q.title ASC, q.project_id ASC')
    })
  })

  // ══ The security contract ═══════════════════════════════════════════════
  describe('the declared return column list is the security contract', () => {
    it('declares exactly the approved column set', () => {
      expect(normalizeWhitespace(returnColumnList(FN))).toBe(DECLARED_RETURN_LIST)
    })

    it('contains none of the forbidden column names', () => {
      const declared = returnColumnList(FN)
      const offending = FORBIDDEN_RETURN_COLUMNS.filter((column) =>
        new RegExp(`\\b${column}\\b`).test(declared)
      )
      expect(offending).toEqual([])
    })

    it('the forbidden list has not drifted from __tests__/migration-193.test.ts', () => {
      const sibling = readFileSync(
        path.join(process.cwd(), '__tests__/migration-193.test.ts'),
        'utf8'
      )
      const match = sibling.match(/const FORBIDDEN_RETURN_COLUMNS = \[([\s\S]*?)\] as const/)
      expect(match).not.toBeNull()
      const siblingList = Array.from((match as RegExpMatchArray)[1].matchAll(/'([^']+)'/g)).map(
        (m) => m[1]
      )
      expect(siblingList).toEqual([...FORBIDDEN_RETURN_COLUMNS])
    })

    it('returns no storage path, signed URL, audio reference, document payload or lyric body anywhere in the body', () => {
      const block = functionBlock(FN)
      for (const forbidden of [
        'audio_file_url',
        'audio_file_size',
        'lyrics',
        'document_data',
        'file_url',
        'cover_art_url',
        'inputs',
        'output',
      ]) {
        expect({ forbidden, present: block.includes(forbidden) }).toEqual({
          forbidden,
          present: false,
        })
      }
      expect(sqlNoDocs).not.toMatch(/createSignedUrl|storage\./)
    })

    it('reads only vault_projects and the four workspace tables — never a child asset table', () => {
      const block = functionBlock(FN)
      for (const table of ['tracks', 'vault_assets', 'vault_documents', 'tool_outputs']) {
        expect({ table, present: block.includes(`public.${table}`) }).toEqual({
          table,
          present: false,
        })
      }
      const read = Array.from(block.matchAll(/(?:FROM|JOIN) public\.([a-z_]+)/g)).map((m) => m[1])
      expect(read.sort()).toEqual(
        [
          'vault_projects',
          'workspace_attachments',
          'workspace_grants',
          'workspace_members',
          'workspace_roster_relationships',
        ].sort()
      )
    })

    it('withholds every conditional value in the database with a CASE, not in the caller', () => {
      const b = normalizeWhitespace(functionBlock(FN))
      const metadataCases = b.split('CASE WHEN q.can_view_metadata THEN').length - 1
      expect(metadataCases).toBe(11)
      expect(b).toContain('CASE WHEN q.can_view_private_rights_identifiers THEN q.upc')
    })

    it('reports the two permission flags so the reader needs no second query', () => {
      const b = normalizeWhitespace(functionBlock(FN))
      expect(b).toContain("bool_or(g.permission = 'view_metadata') AS can_view_metadata")
      expect(b).toContain(
        "bool_or(g.permission = 'view_private_rights_identifiers') AS can_view_private_rights_identifiers"
      )
      expect(commentProse).toContain('distinguish')
    })

    it('justifies holder_user_id explicitly against migration 193’s forbidden-column discipline', () => {
      expect(commentProse).toContain('`holder_user_id` IS RETURNED DELIBERATELY')
      expect(commentProse).toContain('user_profiles')
    })
  })

  // ══ The COMMENT ON contract ═════════════════════════════════════════════
  describe('the COMMENT ON FUNCTION restates the contract for the next reader', () => {
    const comment = () => {
      const start = sqlOnly.indexOf(`COMMENT ON FUNCTION ${SIGNATURE} IS`)
      expect(start).toBeGreaterThanOrEqual(0)
      return normalizeWhitespace(sqlOnly.slice(start, sqlOnly.indexOf("';", start)))
    }

    it('states the return list is the security contract', () => {
      expect(comment()).toContain('THE DECLARED RETURN COLUMN LIST IS THE SECURITY CONTRACT')
      expect(comment()).toContain('as carefully as widening an RLS policy')
    })

    it('states that no storage path or payload is ever returned', () => {
      expect(comment()).toContain(
        'NEVER returns a storage path, a signed URL, an audio reference, a raw document payload or a lyric body'
      )
    })

    it('states that the function is STABLE and caches nothing, re-reading every hop', () => {
      expect(comment()).toContain('STABLE and NOTHING IS CACHED ANYWHERE')
      expect(comment()).toContain('re-read from live rows on every single call')
      expect(comment()).toContain('takes effect on the very next read')
    })
  })

  // ══ Whole-file structural guards ════════════════════════════════════════
  describe('whole-file guards', () => {
    it('creates and drops NO policy of any kind', () => {
      expect(sqlNoDocs).not.toMatch(/CREATE POLICY/i)
      expect(sqlNoDocs).not.toMatch(/DROP POLICY/i)
      expect(sqlNoDocs).not.toMatch(/ALTER POLICY/i)
    })

    it('never writes SELECT * anywhere', () => {
      expect(sqlOnly).not.toMatch(/SELECT\s+\*/)
      expect(migration).not.toMatch(/SELECT\s+\*/)
    })

    it('creates no table, adds no column and writes no row', () => {
      expect(sqlNoDocs).not.toMatch(/CREATE TABLE/i)
      expect(sqlNoDocs).not.toMatch(/ALTER TABLE/i)
      expect(sqlNoDocs).not.toMatch(/ADD COLUMN/i)
      expect(sqlNoDocs).not.toMatch(/\bINSERT INTO\b/i)
      expect(sqlNoDocs).not.toMatch(/\bUPDATE\b/i)
      expect(sqlNoDocs).not.toMatch(/\bDELETE FROM\b/i)
      expect(sqlNoDocs).not.toMatch(/\bDROP TABLE\b/i)
      expect(sqlNoDocs).not.toMatch(/\bDROP FUNCTION\b/i)
      expect(sqlNoDocs).not.toMatch(/CREATE TRIGGER/i)
    })

    it('touches none of the legacy account fields or D-52 surfaces', () => {
      for (const forbidden of [
        'handle_new_user',
        'member_type',
        'industry_roles',
        'capability_grants',
        'project_members',
        'subscriptions',
        'workspace_audit_log',
      ]) {
        expect({ forbidden, present: sqlNoDocs.includes(forbidden) }).toEqual({
          forbidden,
          present: false,
        })
      }
    })

    it('ends with a PostgREST schema-cache reload', () => {
      expect(sqlOnly.trimEnd().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
    })
  })
})
