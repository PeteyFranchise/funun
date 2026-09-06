import { readFileSync } from 'fs'
import path from 'path'

// ─── migration 186 — the RLS workspace branch + the D-56 disable control ───
// Text-lock + structural test, in the established style of
// __tests__/migration-136.test.ts and __tests__/migration-078.test.ts. This
// migration is human-gated (an agent never pushes it) AND it is the only
// file in Phase 38 that edits ALREADY-LIVE policies on production tables —
// this suite, plus __tests__/workspace-structural-exclusions.test.ts, is the
// pre-push review evidence the 38-RLS-SMOKE-CHECKLIST.md checkpoint depends
// on. A green run here proves the SQL TEXT matches what was authored; it
// never proves the policies behave correctly against live Postgres — that is
// what the smoke checklist is for.

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/186_workspace_rls_extension.sql'),
  'utf8'
)

// Executable SQL only, with `--` comment lines stripped, so "the migration
// does not do X" assertions cannot be defeated (or falsely tripped) by
// prose. Mirrors migration-136's / migration-078's pattern.
const sqlOnly = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

// The same view with COMMENT ON bodies removed, for assertions about what
// the migration actually DOES rather than what its documentation discusses.
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

const HELPERS = ['workspace_project_permission', 'workspace_audit_visible'] as const

const PERMITTED_TABLES = [
  'vault_projects',
  'tracks',
  'vault_assets',
  'vault_documents',
  'tool_outputs',
  'workspace_audit_log',
] as const

// The region of the file spanning every CREATE/DROP POLICY statement —
// section (d) and (e) — used for the subselect-wrapping and non-recursion
// structural proofs so the helpers' own CREATE/REVOKE/GRANT/COMMENT
// statements (which name the functions without calling them from a policy)
// stay out of the sample.
const policyRegionStart = sqlOnly.indexOf('DROP POLICY IF EXISTS "vault_projects_select_owner_or_member"')
const policyRegionEnd = sqlOnly.indexOf("NOTIFY pgrst, 'reload schema';")
const policyRegion = sqlOnly.slice(policyRegionStart, policyRegionEnd)

/** The body of a `CREATE OR REPLACE FUNCTION public.<name>` statement. */
function functionBlock(name: string): string {
  const start = sqlOnly.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sqlOnly.indexOf('\n$$;', start)
  expect(end).toBeGreaterThan(start)
  return sqlOnly.slice(start, end)
}

describe('migration 186 — the RLS workspace branch + the D-56 disable control', () => {
  expect(policyRegionStart).toBeGreaterThanOrEqual(0)
  expect(policyRegionEnd).toBeGreaterThan(policyRegionStart)

  // ══ D-56 / WS-31 — the platform-wide disable control ═══════════════════
  describe('workspace_access_config — a true singleton, service-role only', () => {
    it('creates the table as a BOOLEAN-keyed singleton', () => {
      expect(sqlOnly).toContain('CREATE TABLE public.workspace_access_config (')
      const table = sqlOnly.slice(
        sqlOnly.indexOf('CREATE TABLE public.workspace_access_config ('),
        sqlOnly.indexOf('\n);', sqlOnly.indexOf('CREATE TABLE public.workspace_access_config ('))
      )
      expect(normalizeWhitespace(table)).toContain('id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id)')
      expect(normalizeWhitespace(table)).toContain('enabled BOOLEAN NOT NULL DEFAULT TRUE')
      expect(table).toContain('disabled_reason TEXT')
      expect(table).toContain('disabled_by     UUID REFERENCES auth.users')
      expect(table).toContain('disabled_at     TIMESTAMPTZ')
    })

    it('seeds exactly one row, idempotently', () => {
      expect(sqlOnly).toContain('INSERT INTO public.workspace_access_config (id, enabled)')
      expect(sqlOnly).toContain('VALUES (TRUE, TRUE)')
      expect(sqlOnly).toContain('ON CONFLICT (id) DO NOTHING;')
    })

    it('enables RLS and revokes ALL client access, including SELECT', () => {
      expect(sqlOnly).toContain('ALTER TABLE public.workspace_access_config ENABLE ROW LEVEL SECURITY;')
      expect(sqlOnly).toContain(
        'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.workspace_access_config FROM authenticated, anon;'
      )
    })

    it('creates no policy at all on workspace_access_config (deny-by-construction)', () => {
      const policies =
        sqlOnly.match(/CREATE POLICY[^;]*ON public\.workspace_access_config[^;]*;/g) ?? []
      expect(policies).toEqual([])
    })
  })

  describe('workspace_access_enabled() — STABLE, not IMMUTABLE, fails closed', () => {
    it('is declared STABLE SECURITY DEFINER with an empty search path', () => {
      const block = normalizeWhitespace(functionBlock('workspace_access_enabled'))
      expect(block).toContain('RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER')
      expect(block).toContain("SET search_path = ''")
    })

    it('is NEVER declared IMMUTABLE in its own CREATE OR REPLACE FUNCTION statement', () => {
      const declStart = sqlOnly.indexOf('CREATE OR REPLACE FUNCTION public.workspace_access_enabled')
      const declEnd = sqlOnly.indexOf('$$;', declStart) + 3
      const declaration = sqlOnly.slice(declStart, declEnd)
      expect(declaration).not.toMatch(/IMMUTABLE/)
      expect(declaration).toMatch(/\bSTABLE\b/)
    })

    it('body COALESCEs to FALSE — a missing config row fails closed', () => {
      const block = normalizeWhitespace(functionBlock('workspace_access_enabled'))
      expect(block).toContain('COALESCE(')
      expect(block).toMatch(/COALESCE\([^)]*workspace_access_config[^)]*\),\s*FALSE\)/)
    })

    it('revokes then grants EXECUTE, never to anon', () => {
      const revokeIndex = sqlOnly.indexOf(
        'REVOKE EXECUTE ON FUNCTION public.workspace_access_enabled() FROM PUBLIC, anon, authenticated;'
      )
      const grantIndex = sqlOnly.indexOf(
        'GRANT  EXECUTE ON FUNCTION public.workspace_access_enabled() TO authenticated;'
      )
      expect(revokeIndex).toBeGreaterThanOrEqual(0)
      expect(grantIndex).toBeGreaterThan(revokeIndex)
      expect(sqlOnly).not.toMatch(/GRANT\s+EXECUTE ON FUNCTION public\.workspace_access_enabled\(\) TO anon/)
    })

    it('is consulted by workspace_project_permission as an early-exit guard', () => {
      const block = normalizeWhitespace(functionBlock('workspace_project_permission'))
      expect(block).toContain('public.workspace_access_enabled()')
    })

    it('records that personal Member access never consults it', () => {
      expect(sqlOnly).toMatch(/Personal Member access[\s\S]{0,60}never/)
    })
  })

  // ══ T-38-11-02 / WS-23 — the three-hop helper and non-recursion ═══════
  describe('the three-hop SECURITY DEFINER helper pair', () => {
    it.each(HELPERS)('declares public.%s correctly', (helper) => {
      const block = normalizeWhitespace(functionBlock(helper))
      expect(block).toContain('LANGUAGE sql STABLE SECURITY DEFINER')
      expect(block).toContain("SET search_path = ''")
    })

    it('workspace_project_permission takes exactly (project, uid, permission)', () => {
      expect(sqlOnly).toContain(
        'CREATE OR REPLACE FUNCTION public.workspace_project_permission('
      )
      const signature = normalizeWhitespace(
        sqlOnly.slice(
          sqlOnly.indexOf('CREATE OR REPLACE FUNCTION public.workspace_project_permission('),
          sqlOnly.indexOf('RETURNS BOOLEAN', sqlOnly.indexOf('CREATE OR REPLACE FUNCTION public.workspace_project_permission('))
        )
      )
      expect(signature).toContain('p_project_id UUID')
      expect(signature).toContain('p_uid UUID')
      expect(signature).toContain('p_permission TEXT')
    })

    it.each(HELPERS)('revokes then grants EXECUTE on public.%s, never to anon', (helper) => {
      const sig = helper === 'workspace_project_permission' ? '(uuid, uuid, text)' : '(uuid, uuid)'
      const revokeIndex = sqlOnly.indexOf(
        `REVOKE EXECUTE ON FUNCTION public.${helper}${sig} FROM PUBLIC, anon, authenticated;`
      )
      const grantIndex = sqlOnly.indexOf(
        `GRANT  EXECUTE ON FUNCTION public.${helper}${sig} TO authenticated;`
      )
      expect(revokeIndex).toBeGreaterThanOrEqual(0)
      expect(grantIndex).toBeGreaterThan(revokeIndex)
      expect(sqlOnly).not.toMatch(
        new RegExp(`GRANT\\s+EXECUTE ON FUNCTION public\\.${helper}\\([^)]*\\)\\s+TO\\s+anon`)
      )
    })

    it.each(HELPERS)('documents public.%s as an RLS primitive, not a client RPC', (helper) => {
      const sig = helper === 'workspace_project_permission' ? '(uuid, uuid, text)' : '(uuid, uuid)'
      const escaped = sig.replace(/[()]/g, (m) => `\\${m}`)
      const comment = sqlOnly.match(
        new RegExp(`COMMENT ON FUNCTION public\\.${helper}${escaped} IS[^;]*;`)
      )
      expect(comment).not.toBeNull()
      expect(comment![0]).toContain('SECURITY DEFINER')
      expect(comment![0]).toContain('wrapped as (SELECT ...)')
      expect(comment![0]).toContain('not a client-invoked RPC')
    })

    it('workspace_project_permission references all four workspace tables', () => {
      const block = functionBlock('workspace_project_permission')
      expect(block).toMatch(/FROM public\.workspace_attachments/)
      expect(block).toMatch(/JOIN public\.workspace_members/)
      expect(block).toMatch(/JOIN public\.workspace_roster_relationships/)
      expect(block).toMatch(/JOIN public\.workspace_grants/)
    })

    it('non-recursion (WS-23): the helper body references NONE of the five production tables', () => {
      const block = functionBlock('workspace_project_permission')
      expect(block).not.toMatch(/\bvault_projects\b/)
      expect(block).not.toMatch(/\btracks\b/)
      expect(block).not.toMatch(/\bvault_assets\b/)
      expect(block).not.toMatch(/\bvault_documents\b/)
      expect(block).not.toMatch(/\btool_outputs\b/)
    })

    it('workspace_audit_visible references only workspace_audit_log and the migration-182 helper', () => {
      const block = functionBlock('workspace_audit_visible')
      expect(block).toMatch(/FROM public\.workspace_audit_log/)
      expect(block).toMatch(/public\.workspace_member_role\(/)
      expect(block).not.toMatch(/\bvault_projects\b/)
    })

    it('records the recursion doctrine this pair exists to extend', () => {
      expect(sqlOnly).toMatch(/42P17/)
      expect(sqlOnly).toMatch(/migrations? 018/)
      expect(sqlOnly).toMatch(/064/)
      expect(sqlOnly).toMatch(/078/)
    })
  })

  // ══ T-38-11-02, structurally: the scalar-subselect wrapping ═══════════
  describe('every helper call inside a policy is wrapped as a scalar subselect', () => {
    it('finds helper calls in the policy region at all (the sample is not empty)', () => {
      const calls = policyRegion.match(/public\.(workspace_project_permission|workspace_audit_visible)\s*\(/g) ?? []
      expect(calls.length).toBeGreaterThanOrEqual(10)
    })

    it('precedes every one of them with "(SELECT "', () => {
      const pattern = /public\.(workspace_project_permission|workspace_audit_visible)\s*\(/g
      const unwrapped: string[] = []
      let match: RegExpExecArray | null
      while ((match = pattern.exec(policyRegion)) !== null) {
        const preceding = policyRegion.slice(Math.max(0, match.index - 8), match.index)
        if (!preceding.endsWith('(SELECT ')) {
          unwrapped.push(
            policyRegion.slice(Math.max(0, match.index - 40), match.index + 40).replace(/\s+/g, ' ')
          )
        }
      }
      expect(unwrapped).toEqual([])
    })

    it('inlines no cross-table EXISTS subquery in any policy body', () => {
      expect(policyRegion).not.toMatch(/EXISTS\s*\(\s*SELECT/i)
    })
  })

  // ══ D-48 — additive, not rewritten ══════════════════════════════════════
  describe('every recreated policy keeps its original 078 clauses verbatim', () => {
    it('vault_projects_select_owner_or_member keeps the owner + member-role branches', () => {
      const block = normalizeWhitespace(
        sqlOnly.slice(
          sqlOnly.indexOf('CREATE POLICY "vault_projects_select_owner_or_member"'),
          sqlOnly.indexOf('DROP POLICY IF EXISTS "vault_projects_update_owner_or_editor"')
        )
      )
      expect(block).toContain('(SELECT auth.uid()) = user_id')
      expect(block).toContain('(SELECT public.project_member_role(id, auth.uid())) IS NOT NULL')
      expect(block).toContain(
        "OR (SELECT public.workspace_project_permission(id, auth.uid(), 'view_summaries'))"
      )
    })

    it('vault_projects_update_owner_or_editor keeps its branches in BOTH USING and WITH CHECK', () => {
      const block = sqlOnly.slice(
        sqlOnly.indexOf('CREATE POLICY "vault_projects_update_owner_or_editor"'),
        sqlOnly.indexOf('-- tracks (project_id NOT NULL')
      )
      const usingClause = block.slice(0, block.indexOf('WITH CHECK'))
      const checkClause = block.slice(block.indexOf('WITH CHECK'))
      for (const clause of [usingClause, checkClause]) {
        const normalized = normalizeWhitespace(clause)
        expect(normalized).toContain('(SELECT auth.uid()) = user_id')
        expect(normalized).toContain("IN ('co-owner', 'editor')")
        expect(normalized).toContain(
          "OR (SELECT public.workspace_project_permission(id, auth.uid(), 'edit_metadata'))"
        )
      }
    })

    const childTables: Array<{
      table: string
      selectPolicy: string
      writePolicy: string
      nullableFallback: boolean
    }> = [
      {
        table: 'tracks',
        selectPolicy: 'tracks_select_project_owner_or_member',
        writePolicy: 'tracks_write_project_owner_or_editor',
        nullableFallback: false,
      },
      {
        table: 'vault_assets',
        selectPolicy: 'vault_assets_select_project_owner_or_member',
        writePolicy: 'vault_assets_write_project_owner_or_editor',
        nullableFallback: false,
      },
      {
        table: 'vault_documents',
        selectPolicy: 'vault_documents_select_project_owner_or_member',
        writePolicy: 'vault_documents_write_project_owner_or_editor',
        nullableFallback: true,
      },
      {
        table: 'tool_outputs',
        selectPolicy: 'tool_outputs_select_project_owner_or_member',
        writePolicy: 'tool_outputs_write_project_owner_or_editor',
        nullableFallback: true,
      },
    ]

    it.each(childTables)(
      '$table: SELECT policy keeps is_project_owner + project_member_role (+ nullable fallback)',
      ({ table, selectPolicy, writePolicy, nullableFallback }) => {
        const block = normalizeWhitespace(
          sqlOnly.slice(
            sqlOnly.indexOf(`CREATE POLICY "${selectPolicy}"`),
            sqlOnly.indexOf(`DROP POLICY IF EXISTS "${writePolicy}"`)
          )
        )
        expect(block).toContain(`ON public.${table}`)
        expect(block).toContain('(SELECT public.is_project_owner(project_id, auth.uid()))')
        expect(block).toContain(
          '(SELECT public.project_member_role(project_id, auth.uid())) IS NOT NULL'
        )
        expect(block).toContain(
          "OR (SELECT public.workspace_project_permission(project_id, auth.uid(), 'view_summaries'))"
        )
        if (nullableFallback) {
          expect(block).toContain('(project_id IS NULL AND user_id = (SELECT auth.uid()))')
        } else {
          expect(block).not.toContain('project_id IS NULL')
        }
      }
    )

    it.each(childTables)(
      '$table: write policy (FOR ALL) keeps co-owner/editor + nullable fallback in BOTH USING and WITH CHECK',
      ({ table, writePolicy, nullableFallback }) => {
        const start = sqlOnly.indexOf(`CREATE POLICY "${writePolicy}"`)
        expect(start).toBeGreaterThanOrEqual(0)
        const nextBoundary = sqlOnly.indexOf('\n\n-- ', start + 10)
        const block = sqlOnly.slice(start, nextBoundary > 0 ? nextBoundary : start + 900)
        expect(block).toContain('FOR ALL TO authenticated')
        const usingClause = block.slice(0, block.indexOf('WITH CHECK'))
        const checkClause = block.slice(block.indexOf('WITH CHECK'))
        for (const clause of [usingClause, checkClause]) {
          const normalized = normalizeWhitespace(clause)
          expect(normalized).toContain('(SELECT public.is_project_owner(project_id, auth.uid()))')
          expect(normalized).toContain(
            "(SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')"
          )
          expect(normalized).toContain(
            `OR (SELECT public.workspace_project_permission(project_id, auth.uid(), 'edit_metadata'))`
          )
          if (nullableFallback) {
            expect(normalized).toContain('(project_id IS NULL AND user_id = (SELECT auth.uid()))')
          }
        }
      }
    )
  })

  // ══ T-38-11-07 — insert/delete untouched ════════════════════════════════
  describe('vault_projects INSERT and DELETE are untouched', () => {
    it('names neither policy in any executable statement', () => {
      expect(sqlNoDocs).not.toMatch(/CREATE POLICY "vault_projects_insert_own"/)
      expect(sqlNoDocs).not.toMatch(/CREATE POLICY "vault_projects_delete_owner_only"/)
      expect(sqlNoDocs).not.toMatch(/DROP POLICY IF EXISTS "vault_projects_insert_own"/)
      expect(sqlNoDocs).not.toMatch(/DROP POLICY IF EXISTS "vault_projects_delete_owner_only"/)
    })

    it('records why, in a comment', () => {
      expect(commentProse).toMatch(/vault_projects_insert_own/)
      expect(commentProse).toMatch(/vault_projects_delete_owner_only/)
      expect(commentProse).toMatch(/D-24/)
    })
  })

  // ══ Blast radius — the six-table allowlist ══════════════════════════════
  describe('blast radius: every CREATE/DROP POLICY names one of exactly six tables', () => {
    it('extracts the table name from every policy statement and checks the allowlist', () => {
      const statements = sqlOnly.match(/(?:CREATE|DROP) POLICY[^;]*;/g) ?? []
      expect(statements.length).toBeGreaterThanOrEqual(11)

      const offenders: string[] = []
      for (const statement of statements) {
        const match = statement.match(/ON public\.([a-z_]+)/)
        const table = match?.[1]
        if (!table || !(PERMITTED_TABLES as readonly string[]).includes(table)) {
          offenders.push(statement.replace(/\s+/g, ' ').trim())
        }
      }
      expect(offenders).toEqual([])
    })

    it('never names project_members, work_members, subscriptions, buyer_orgs, buyer_members or funun_staff', () => {
      const statements = sqlOnly.match(/(?:CREATE|DROP) POLICY[^;]*;/g) ?? []
      for (const forbidden of [
        'project_members',
        'work_members',
        'subscriptions',
        'buyer_orgs',
        'buyer_members',
        'funun_staff',
      ]) {
        expect(statements.some((s) => s.includes(`public.${forbidden}`))).toBe(false)
      }
    })

    it('never references the signup trigger', () => {
      expect(sqlNoDocs).not.toMatch(/handle_new_user/)
    })
  })

  // ══ Housekeeping ══════════════════════════════════════════════════════════
  describe('housekeeping', () => {
    it('carries the standing human-gated push line and the "pushed alone" rule', () => {
      expect(migration).toMatch(/HUMAN-GATED/)
      expect(commentProse).toMatch(/never runs `supabase db push`|never runs.*supabase db push/)
      expect(commentProse).toMatch(/PUSHED ALONE|pushed alone|NEVER BATCHED WITH 182-185/)
    })

    it('documents the 186/187/188 numbering', () => {
      expect(migration).toContain('186')
      expect(migration).toContain('187')
      expect(migration).toContain('188')
      expect(commentProse).toMatch(/RESERVED/)
    })

    it('never disables row level security', () => {
      expect(sqlNoDocs).not.toMatch(/DISABLE ROW LEVEL SECURITY/i)
    })

    it('never opens a bare USING (true) policy', () => {
      expect(sqlNoDocs).not.toMatch(/USING\s*\(\s*true\s*\)/i)
    })

    it('ends with the schema-cache reload as its last statement', () => {
      const lines = migration
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('--'))
      expect(lines[lines.length - 1]).toBe("NOTIFY pgrst, 'reload schema';")
      const notifies = migration.match(/NOTIFY pgrst, 'reload schema';/g) ?? []
      expect(notifies).toHaveLength(1)
    })

    it('touches no table outside the six-table allowlist plus workspace_access_config', () => {
      expect(sqlNoDocs).not.toMatch(/CREATE TABLE public\.(?!workspace_access_config\b)/)
    })
  })
})
