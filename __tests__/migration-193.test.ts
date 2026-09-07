import { readFileSync } from 'fs'
import path from 'path'

// ─── migration 193 — the child-table branch removal + the four ────────────
//     column-allowlist read functions
// Text-lock + structural test, in the established style of
// __tests__/migration-186.test.ts, __tests__/migration-187.test.ts and
// __tests__/migration-192.test.ts. This project's migrations are
// human-gated: an agent never pushes them, so this file IS the pre-push
// review evidence for R-02/WSR-03, WSR-04 and WSR-05 (findings F2 and F3).
//
// LIMITATION, STATED UP FRONT: this suite proves what the SQL DECLARES. It
// does NOT prove that a workspace caller receives nothing extra at runtime.
// It cannot execute a policy, cannot call a function, and never touches a
// database. The behavioural half is plan 11's owner-run query at the joint
// push checkpoint (38.0.1-VALIDATION.md, WSR-03/04 row): connect as a
// workspace caller holding only `view_summaries`, call each of the four
// RPCs, and confirm no `audio_file_url`, `lyrics`, `url`, `document_data`,
// `inputs` or `output` field comes back — and that a direct PostgREST read
// of the four child tables returns nothing at all.

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/193_workspace_column_allowlist_rpcs.sql'),
  'utf8'
)

// Executable SQL only, with `--` comment lines stripped, so "the migration
// does not do X" assertions cannot be defeated (or falsely tripped) by
// prose. Mirrors migration-186's / migration-192's pattern.
const sqlOnly = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

// The same view with COMMENT ON bodies removed too, for assertions about
// what the migration actually DOES rather than what its documentation
// (including inline COMMENT ON FUNCTION strings, which deliberately NAME
// the withheld columns so the next reader knows they were considered)
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

const HELPER = 'workspace_project_permission'

/** The ten policies migration 186 recreated — this migration's inventory is
 * asserted to be exactly the same set, so a hand-edit can neither drop one
 * (silently leaving 186's workspace disjunct live on a child table) nor add
 * an eleventh (widening the blast radius past the five tables). */
const CHILD_TABLE_POLICIES = [
  { table: 'tracks', policy: 'tracks_select_project_owner_or_member', kind: 'select', nullableFallback: false },
  { table: 'tracks', policy: 'tracks_write_project_owner_or_editor', kind: 'write', nullableFallback: false },
  { table: 'vault_assets', policy: 'vault_assets_select_project_owner_or_member', kind: 'select', nullableFallback: false },
  { table: 'vault_assets', policy: 'vault_assets_write_project_owner_or_editor', kind: 'write', nullableFallback: false },
  { table: 'vault_documents', policy: 'vault_documents_select_project_owner_or_member', kind: 'select', nullableFallback: true },
  { table: 'vault_documents', policy: 'vault_documents_write_project_owner_or_editor', kind: 'write', nullableFallback: true },
  { table: 'tool_outputs', policy: 'tool_outputs_select_project_owner_or_member', kind: 'select', nullableFallback: true },
  { table: 'tool_outputs', policy: 'tool_outputs_write_project_owner_or_editor', kind: 'write', nullableFallback: true },
] as const

const VAULT_PROJECTS_POLICIES = [
  { policy: 'vault_projects_select_owner_or_member', permission: 'view_summaries', helperCount: 1 },
  { policy: 'vault_projects_update_owner_or_editor', permission: 'edit_metadata', helperCount: 2 },
] as const

const ALL_POLICY_NAMES = [
  ...CHILD_TABLE_POLICIES.map((p) => p.policy),
  ...VAULT_PROJECTS_POLICIES.map((p) => p.policy),
]

/** The full text of one `CREATE POLICY "<name>" ... ;` statement. */
function policyBlock(name: string): string {
  const start = sqlNoDocs.indexOf(`CREATE POLICY "${name}"`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sqlNoDocs.indexOf(';', start)
  expect(end).toBeGreaterThan(start)
  return sqlNoDocs.slice(start, end)
}

/** The body of a `CREATE OR REPLACE FUNCTION public.<name>` statement. */
function functionBlock(name: string): string {
  const start = sqlOnly.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sqlOnly.indexOf('\n$$;', start)
  expect(end).toBeGreaterThan(start)
  return sqlOnly.slice(start, end)
}

/** The declared `RETURNS TABLE (...)` column list of a read function — the
 * security contract itself, sliced away from the body so an assertion about
 * the contract cannot be satisfied (or tripped) by the body. */
function returnColumnList(name: string): string {
  const block = functionBlock(name)
  const start = block.indexOf('RETURNS TABLE (')
  expect(start).toBeGreaterThanOrEqual(0)
  const end = block.indexOf('LANGUAGE sql', start)
  expect(end).toBeGreaterThan(start)
  return block.slice(start, end)
}

/** Columns that must never appear in ANY return column list, whichever
 * table they belong to (custody D-01/D-09, D-40). Asserted per function
 * against every name, not only against that table's own — a copy-paste
 * from one function into another is caught too. */
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

const READ_FUNCTIONS = [
  { name: 'workspace_read_tracks', table: 'tracks', alias: 't' },
  { name: 'workspace_read_assets', table: 'vault_assets', alias: 'a' },
  { name: 'workspace_read_documents', table: 'vault_documents', alias: 'd' },
  { name: 'workspace_read_tool_outputs', table: 'tool_outputs', alias: 'o' },
] as const

describe('migration 193 — child-table branch removal + column-allowlist read functions', () => {
  // ══ Header discipline ═══════════════════════════════════════════════════
  describe('header states the human gate and the joint-push rule', () => {
    it('carries the HUMAN-GATED paragraph naming the prior convention migrations', () => {
      expect(migration).toContain('HUMAN-GATED')
      for (const m of ['078', '080', '136', '177', '181-190']) {
        expect(commentProse).toContain(m)
      }
    })

    it('states that 191, 192, 193 and 194 push together and this file is never staged alone', () => {
      expect(commentProse).toContain('PUSHED WITH 191, 192 AND 194 — NEVER STAGED ALONE')
      expect(commentProse).toContain('REVIEW-AND-HOLD, not a push')
    })

    it('names R-02 / WSR-03 / WSR-04 / WSR-05 and findings F2 and F3', () => {
      for (const ref of ['R-02/WSR-03', 'R-02/WSR-04', 'R-02/WSR-05', 'F2', 'F3']) {
        expect(commentProse).toContain(ref)
      }
    })

    it('carries an INCLUSION / EXCLUSION CHECKLIST naming the two deliberately unnamed policies', () => {
      expect(commentProse).toContain('INCLUSION / EXCLUSION CHECKLIST')
      expect(commentProse).toContain('vault_projects_insert_own')
      expect(commentProse).toContain('vault_projects_delete_owner_only')
    })
  })

  // ══ Policy inventory — exactly migration 186's ten ══════════════════════
  describe('policy inventory matches migration 186 exactly — ten dropped, ten recreated', () => {
    it('creates exactly ten policies and drops exactly ten, by the same names', () => {
      const created = (sqlNoDocs.match(/CREATE POLICY "([^"]+)"/g) ?? []).map((s) =>
        s.replace(/CREATE POLICY "|"/g, '')
      )
      const dropped = (sqlNoDocs.match(/DROP POLICY IF EXISTS "([^"]+)"/g) ?? []).map((s) =>
        s.replace(/DROP POLICY IF EXISTS "|"/g, '')
      )
      expect(created.sort()).toEqual([...ALL_POLICY_NAMES].sort())
      expect(dropped.sort()).toEqual([...ALL_POLICY_NAMES].sort())
      expect(created).toHaveLength(10)
      expect(dropped).toHaveLength(10)
    })

    it('every recreated policy is preceded by its own DROP POLICY IF EXISTS', () => {
      for (const name of ALL_POLICY_NAMES) {
        const dropAt = sqlNoDocs.indexOf(`DROP POLICY IF EXISTS "${name}"`)
        const createAt = sqlNoDocs.indexOf(`CREATE POLICY "${name}"`)
        expect({ name, ordered: dropAt >= 0 && createAt > dropAt }).toEqual({ name, ordered: true })
      }
    })

    it('blast radius: every CREATE/DROP POLICY statement names one of exactly five tables', () => {
      const statements = sqlNoDocs.match(/(?:CREATE|DROP) POLICY[^;]*;/g) ?? []
      expect(statements.length).toBe(20)
      const permitted = ['vault_projects', 'tracks', 'vault_assets', 'vault_documents', 'tool_outputs']
      const offending = statements
        .map((s) => {
          const match = s.match(/ON public\.([a-z_]+)/)
          return match ? match[1] : `UNPARSED: ${normalizeWhitespace(s).slice(0, 80)}`
        })
        .filter((table) => !permitted.includes(table))
      expect(offending).toEqual([])
    })

    it('names neither vault_projects_insert_own nor vault_projects_delete_owner_only in any executable statement', () => {
      expect(sqlNoDocs).not.toMatch(/POLICY[^;]*"vault_projects_insert_own"/)
      expect(sqlNoDocs).not.toMatch(/POLICY[^;]*"vault_projects_delete_owner_only"/)
      expect(sqlNoDocs).not.toContain('workspace_audit_log')
    })
  })

  // ══ (a) The workspace disjunct is gone from all eight child policies ════
  describe('the workspace helper is absent from every child-table policy body', () => {
    it.each(CHILD_TABLE_POLICIES)(
      '$policy contains no reference to the workspace helper',
      ({ policy }) => {
        const block = policyBlock(policy)
        expect({ policy, helperOccurrences: block.split(HELPER).length - 1 }).toEqual({
          policy,
          helperOccurrences: 0,
        })
        expect(block).not.toContain('workspace_')
      }
    )

    it.each(CHILD_TABLE_POLICIES)(
      '$policy keeps migration 078’s owner and project_member_role clauses',
      ({ policy, kind, nullableFallback }) => {
        const block = normalizeWhitespace(policyBlock(policy))
        expect(block).toContain('(SELECT public.is_project_owner(project_id, auth.uid()))')
        if (kind === 'select') {
          expect(block).toContain(
            'OR (SELECT public.project_member_role(project_id, auth.uid())) IS NOT NULL'
          )
          expect(block).toContain('FOR SELECT TO authenticated')
        } else {
          expect(block).toContain(
            "OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')"
          )
          expect(block).toContain('FOR ALL TO authenticated')
          // FOR ALL policies restate the predicate in USING and WITH CHECK.
          expect(block).toContain('WITH CHECK (')
          expect(block.split('public.is_project_owner').length - 1).toBe(2)
        }

        const fallbacks = block.split('(project_id IS NULL AND user_id = (SELECT auth.uid()))').length - 1
        expect({ policy, fallbacks }).toEqual({
          policy,
          fallbacks: nullableFallback ? (kind === 'write' ? 2 : 1) : 0,
        })
      }
    )
  })

  // ══ (b) vault_projects keeps its branch, and only it ════════════════════
  describe('vault_projects is the only table whose policies still name the workspace helper', () => {
    it.each(VAULT_PROJECTS_POLICIES)(
      '$policy still calls the helper for $permission, wrapped as a scalar subselect',
      ({ policy, permission, helperCount }) => {
        const block = normalizeWhitespace(policyBlock(policy))
        expect(block).toContain(
          `OR (SELECT public.workspace_project_permission(id, auth.uid(), '${permission}'))`
        )
        expect(block.split(HELPER).length - 1).toBe(helperCount)
        expect(block).toContain('(SELECT auth.uid()) = user_id')
      }
    )

    it('the helper appears exactly eight times in executable SQL, with a known composition', () => {
      // 3 in the two vault_projects policies (SELECT once; UPDATE restates
      // its predicate in USING and WITH CHECK, exactly as migration 186 and
      // migration 078 wrote it) + 4 `view_summaries` gates, one per read
      // function + 1 conditional `view_private_rights_identifiers` gate on
      // the track ISRC = 8. NOTE: plan 38.0.1-10's acceptance criterion says
      // "exactly 6", which undercounts the FOR UPDATE policy's WITH CHECK
      // restatement; the composition below is the correct decomposition and
      // is asserted term by term rather than as a bare total.
      const total = sqlNoDocs.split(HELPER).length - 1
      const inPolicies = ALL_POLICY_NAMES.reduce(
        (sum, name) => sum + (policyBlock(name).split(HELPER).length - 1),
        0
      )
      const inFunctions = READ_FUNCTIONS.reduce(
        (sum, fn) => sum + (functionBlock(fn.name).split(HELPER).length - 1),
        0
      )
      expect({ total, inPolicies, inFunctions }).toEqual({ total: 8, inPolicies: 3, inFunctions: 5 })
    })

    it('documents that custody immutability is migration 190’s trigger, not this policy', () => {
      expect(commentProse).toContain('CUSTODY IMMUTABILITY UNDER THIS BRANCH IS NOT ENFORCED HERE')
      expect(commentProse).toContain('BEFORE UPDATE trigger')
      expect(commentProse).toContain('WITH CHECK clause sees only the PROPOSED row')
    })

    it('inlines no cross-table EXISTS subquery in any policy body (the recursion rule)', () => {
      const firstPolicy = sqlNoDocs.indexOf('DROP POLICY IF EXISTS')
      const lastPolicyEnd = sqlNoDocs.indexOf('CREATE OR REPLACE FUNCTION')
      const policyRegion = sqlNoDocs.slice(firstPolicy, lastPolicyEnd)
      expect(policyRegion).not.toMatch(/EXISTS\s*\(\s*SELECT/i)
    })
  })

  // ══ (c) The four read functions ════════════════════════════════════════
  describe('the four column-allowlist read functions', () => {
    it.each(READ_FUNCTIONS)(
      '$name is RETURNS TABLE, LANGUAGE sql STABLE SECURITY DEFINER, empty search path',
      ({ name }) => {
        const block = normalizeWhitespace(functionBlock(name))
        expect(block).toContain('RETURNS TABLE (')
        expect(block).toContain('LANGUAGE sql STABLE SECURITY DEFINER')
        expect(block).toContain("SET search_path = ''")
        expect(block).not.toContain('IMMUTABLE')
        expect(block).not.toContain('VOLATILE')
      }
    )

    it.each(READ_FUNCTIONS)(
      '$name gates every row on the six-hop helper and reads only public.$table',
      ({ name, table, alias }) => {
        const block = normalizeWhitespace(functionBlock(name))
        expect(block).toContain(`FROM public.${table} ${alias}`)
        expect(block).toContain(`WHERE ${alias}.project_id = p_project_id`)
        expect(block).toContain(
          `AND public.workspace_project_permission(p_project_id, p_uid, 'view_summaries')`
        )
        // Exactly one production table is read per function body.
        const otherTables = READ_FUNCTIONS.filter((f) => f.table !== table).map((f) => f.table)
        const leaked = otherTables.filter((t) => block.includes(`public.${t}`))
        expect({ name, leaked }).toEqual({ name, leaked: [] })
      }
    )

    it.each(READ_FUNCTIONS)('$name carries the REVOKE/GRANT pair', ({ name }) => {
      expect(sqlNoDocs).toContain(
        `REVOKE EXECUTE ON FUNCTION public.${name}(uuid, uuid) FROM PUBLIC, anon;`
      )
      expect(sqlNoDocs).toContain(
        `GRANT  EXECUTE ON FUNCTION public.${name}(uuid, uuid) TO authenticated;`
      )
    })

    it.each(READ_FUNCTIONS)(
      '$name carries a COMMENT ON FUNCTION stating the return list is the security contract',
      ({ name }) => {
        const start = sqlOnly.indexOf(`COMMENT ON FUNCTION public.${name}(uuid, uuid) IS`)
        expect(start).toBeGreaterThanOrEqual(0)
        const comment = normalizeWhitespace(sqlOnly.slice(start, sqlOnly.indexOf("';", start)))
        expect(comment).toContain('THE DECLARED RETURN COLUMN LIST IS THE SECURITY CONTRACT')
        expect(comment).toContain('as carefully as widening an RLS policy')
        expect(comment).toContain(
          'NEVER returns a storage path, a signed URL, a raw document payload or a lyric body'
        )
      }
    )

    // ── The security contract itself ─────────────────────────────────────
    it.each(READ_FUNCTIONS)(
      '$name’s declared return column list contains no forbidden column name',
      ({ name }) => {
        const declared = returnColumnList(name)
        const offending = FORBIDDEN_RETURN_COLUMNS.filter((column) =>
          new RegExp(`\\b${column}\\b`).test(declared)
        )
        expect({ name, offending }).toEqual({ name, offending: [] })
      }
    )

    it('workspace_read_tracks declares exactly its approved column set', () => {
      const declared = normalizeWhitespace(returnColumnList('workspace_read_tracks'))
      expect(declared).toBe(
        'RETURNS TABLE ( id UUID, project_id UUID, title TEXT, track_number INTEGER, ' +
          'duration_seconds INTEGER, bpm INTEGER, key_signature TEXT, explicit BOOLEAN, ' +
          'featuring_artists TEXT[], writers TEXT[], producers TEXT[], isrc TEXT )'
      )
    })

    it('workspace_read_assets declares exactly its approved column set', () => {
      const declared = normalizeWhitespace(returnColumnList('workspace_read_assets'))
      expect(declared).toBe(
        'RETURNS TABLE ( id UUID, project_id UUID, type TEXT, filename TEXT, ' +
          'width INTEGER, height INTEGER, size_bytes BIGINT )'
      )
    })

    it('workspace_read_documents declares exactly its approved column set', () => {
      const declared = normalizeWhitespace(returnColumnList('workspace_read_documents'))
      expect(declared).toBe(
        'RETURNS TABLE ( id UUID, project_id UUID, track_id UUID, type TEXT, ' +
          'status TEXT, signed_at TIMESTAMPTZ )'
      )
    })

    it('workspace_read_tool_outputs declares exactly its approved column set', () => {
      const declared = normalizeWhitespace(returnColumnList('workspace_read_tool_outputs'))
      expect(declared).toBe(
        'RETURNS TABLE ( id UUID, project_id UUID, tool_slug TEXT, title TEXT, ' +
          'created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ )'
      )
    })

    it('the ISRC is the ONLY conditionally exposed column, gated on view_private_rights_identifiers', () => {
      const tracks = normalizeWhitespace(functionBlock('workspace_read_tracks'))
      expect(tracks).toContain(
        "CASE WHEN public.workspace_project_permission(p_project_id, p_uid, 'view_private_rights_identifiers') THEN t.isrc ELSE NULL::TEXT END"
      )
      const conditionalElsewhere = READ_FUNCTIONS.filter(
        (fn) => fn.name !== 'workspace_read_tracks' && functionBlock(fn.name).includes('CASE')
      ).map((fn) => fn.name)
      expect(conditionalElsewhere).toEqual([])
      expect(sqlNoDocs.split('view_private_rights_identifiers').length - 1).toBe(1)
    })

    it('no function branches on access_clean_masters — clean-master access is not a column read', () => {
      expect(sqlNoDocs).not.toContain('access_clean_masters')
      expect(sqlNoDocs).not.toMatch(/createSignedUrl|storage\./)
    })
  })

  // ══ Whole-file structural guards ═══════════════════════════════════════
  describe('whole-file guards', () => {
    it('never writes SELECT * anywhere', () => {
      expect(sqlOnly).not.toMatch(/SELECT\s+\*/)
      expect(migration).not.toMatch(/SELECT\s+\*/)
    })

    it('creates no table, adds no column and writes no row', () => {
      expect(sqlNoDocs).not.toMatch(/CREATE TABLE/i)
      expect(sqlNoDocs).not.toMatch(/ADD COLUMN/i)
      expect(sqlNoDocs).not.toMatch(/\bINSERT INTO\b/i)
      expect(sqlNoDocs).not.toMatch(/\bDELETE FROM\b/i)
      expect(sqlNoDocs).not.toMatch(/\bDROP TABLE\b/i)
      expect(sqlNoDocs).not.toMatch(/\bDROP FUNCTION\b/i)
    })

    it('touches none of the legacy account fields or D-52 surfaces', () => {
      for (const forbidden of [
        'handle_new_user',
        'member_type',
        'industry_roles',
        'capability_grants',
        'project_members',
        'subscriptions',
      ]) {
        expect({ forbidden, present: sqlNoDocs.includes(forbidden) }).toEqual({
          forbidden,
          present: false,
        })
      }
    })

    it('never opens a bare USING (true) policy', () => {
      expect(sqlNoDocs).not.toMatch(/USING\s*\(\s*true\s*\)/i)
      expect(sqlNoDocs).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i)
    })

    it('ends with a PostgREST schema-cache reload', () => {
      expect(sqlOnly.trimEnd().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
    })
  })
})
