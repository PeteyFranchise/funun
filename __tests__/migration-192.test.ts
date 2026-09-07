import { readFileSync } from 'fs'
import path from 'path'
import { MEMBER_CONSENT_SOURCE, MAX_GRANT_CHAIN_DEPTH } from '@/lib/workspaces/grant-lineage'

// ─── migration 192 — workspace_project_permission v2 ───────────────────────
// Text-lock + structural test, in the established style of
// __tests__/migration-186.test.ts and __tests__/migration-187.test.ts. This
// project's migrations are human-gated: an agent never pushes them, so this
// file IS the pre-push review evidence for R-01/WSR-02, R-02/WSR-05,
// R-04/WSR-06 and R-11/WSR-17.
//
// LIMITATION, STATED UP FRONT: a text-lock test proves what the SQL SAYS. It
// CANNOT prove that a workspace actually loses access the moment custody
// transfers away, that an expired-but-active contractor is actually refused
// by RLS, or that a revoked parent grant actually kills its descendant's
// access at read time against a live Postgres. That behavioural proof is
// plan 11's joint push checkpoint's smoke checklist
// (38.0.1-VALIDATION.md), not this suite. A green Jest run here is evidence
// the SQL is well-formed and structurally sound; it is not evidence any of
// the three properties above hold in production.

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/192_workspace_project_permission_v2.sql'),
  'utf8'
)

// Executable SQL only, with `--` comment lines stripped, so "the migration
// does not do X" assertions cannot be defeated (or falsely tripped) by
// prose. Mirrors migration-186's / migration-187's / migration-190's
// pattern.
const sqlOnly = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

// The same view with COMMENT ON bodies removed too, for assertions about
// what the migration actually DOES rather than what its documentation
// (including inline COMMENT ON FUNCTION strings) discusses.
const sqlNoDocs = sqlOnly.replace(/COMMENT ON [\s\S]*?';\n/g, '')

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** The body of a `CREATE OR REPLACE FUNCTION public.<name>` statement. */
function functionBlock(name: string): string {
  const start = sqlOnly.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sqlOnly.indexOf('\n$$;', start)
  expect(end).toBeGreaterThan(start)
  return sqlOnly.slice(start, end)
}

describe('migration 192 — workspace_project_permission v2', () => {
  // ══ Drift guard — SQL and TypeScript must agree ════════════════════════
  describe('SQL/TypeScript agreement (drift guard)', () => {
    it('MEMBER_CONSENT_SOURCE is byte-identical to the SQL literal', () => {
      expect(MEMBER_CONSENT_SOURCE).toBe('member_consent')
      expect(sqlOnly).toContain(`source = '${MEMBER_CONSENT_SOURCE}'`)
    })

    it('MAX_GRANT_CHAIN_DEPTH (8) is the depth bound used by the recursive walk', () => {
      expect(MAX_GRANT_CHAIN_DEPTH).toBe(8)
      const block = functionBlock('workspace_grant_lineage_live')
      expect(block).toContain(`c.depth < ${MAX_GRANT_CHAIN_DEPTH}`)
    })
  })

  // ══ Section (a) — the lineage function ══════════════════════════════════
  describe('workspace_grant_lineage_live — the SQL twin of isGrantChainLive', () => {
    it('is declared STABLE SECURITY DEFINER with an empty search path, returning BOOLEAN', () => {
      const block = normalizeWhitespace(functionBlock('workspace_grant_lineage_live'))
      expect(block).toContain('RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER')
      expect(block).toContain("SET search_path = ''")
    })

    it('uses WITH RECURSIVE to walk parent_grant_id upward', () => {
      const block = functionBlock('workspace_grant_lineage_live')
      expect(block).toMatch(/WITH RECURSIVE chain AS/)
      expect(block).toMatch(/JOIN chain c ON g\.id = c\.parent_grant_id/)
    })

    it('refuses the chain when any link carries a non-null revoked_at', () => {
      const block = functionBlock('workspace_grant_lineage_live')
      expect(block).toMatch(/NOT EXISTS\s*\(\s*SELECT 1 FROM chain WHERE revoked_at IS NOT NULL\s*\)/)
    })

    it('requires the chain to terminate at a member-consent root', () => {
      const block = functionBlock('workspace_grant_lineage_live')
      expect(block).toMatch(
        /EXISTS\s*\(\s*SELECT 1 FROM chain WHERE parent_grant_id IS NULL AND source = 'member_consent'\s*\)/
      )
    })

    it('bounds recursion depth so a future cycle terminates rather than loops', () => {
      const block = functionBlock('workspace_grant_lineage_live')
      expect(block).toMatch(/depth\s*\+\s*1/)
      expect(block).toMatch(/WHERE c\.depth < \d+/)
    })

    it('revokes then grants EXECUTE, never to anon', () => {
      const revokeIndex = sqlOnly.indexOf(
        'REVOKE EXECUTE ON FUNCTION public.workspace_grant_lineage_live(uuid) FROM PUBLIC, anon, authenticated;'
      )
      const grantIndex = sqlOnly.indexOf(
        'GRANT  EXECUTE ON FUNCTION public.workspace_grant_lineage_live(uuid) TO authenticated;'
      )
      expect(revokeIndex).toBeGreaterThanOrEqual(0)
      expect(grantIndex).toBeGreaterThan(revokeIndex)
      expect(sqlOnly).not.toMatch(
        /GRANT\s+EXECUTE ON FUNCTION public\.workspace_grant_lineage_live\(uuid\)\s+TO\s+anon/
      )
    })

    it('documents itself as the SQL twin of lib/workspaces/grant-lineage.ts', () => {
      const comment = sqlOnly.match(/COMMENT ON FUNCTION public\.workspace_grant_lineage_live\(uuid\) IS[^;]*;/)
      expect(comment).not.toBeNull()
      expect(comment![0]).toContain('grant-lineage.ts')
      expect(comment![0]).toContain('isGrantChainLive')
      expect(comment![0]).toContain('SECURITY DEFINER')
      expect(comment![0]).toContain('not a client-invoked RPC')
    })
  })

  // ══ Section (b) — expires_at on both membership helpers (WSR-17) ═══════
  describe('workspace_member_role and is_workspace_owner — expires_at added', () => {
    it('workspace_member_role checks expires_at AND status = active', () => {
      const block = normalizeWhitespace(functionBlock('workspace_member_role'))
      expect(block).toContain("status = 'active'")
      expect(block).toContain('(expires_at IS NULL OR expires_at > now())')
    })

    it('is_workspace_owner checks expires_at AND status = active', () => {
      const block = normalizeWhitespace(functionBlock('is_workspace_owner'))
      expect(block).toContain("status = 'active'")
      expect(block).toContain('(expires_at IS NULL OR expires_at > now())')
    })

    it('both are CREATE OR REPLACE (replacing migration 182), STABLE SECURITY DEFINER', () => {
      for (const name of ['workspace_member_role', 'is_workspace_owner']) {
        const block = normalizeWhitespace(functionBlock(name))
        expect(block).toContain('LANGUAGE sql STABLE SECURITY DEFINER')
        expect(block).toContain("SET search_path = ''")
      }
    })

    it('both revoke then grant EXECUTE, never to anon', () => {
      for (const name of ['workspace_member_role', 'is_workspace_owner']) {
        const revokeIndex = sqlOnly.indexOf(
          `REVOKE EXECUTE ON FUNCTION public.${name}(uuid, uuid) FROM PUBLIC, anon, authenticated;`
        )
        const grantIndex = sqlOnly.indexOf(
          `GRANT  EXECUTE ON FUNCTION public.${name}(uuid, uuid) TO authenticated;`
        )
        expect(revokeIndex).toBeGreaterThanOrEqual(0)
        expect(grantIndex).toBeGreaterThan(revokeIndex)
      }
    })

    it('both comments state parity with requireWorkspaceAccess and that the API check is kept, not removed', () => {
      for (const name of ['workspace_member_role', 'is_workspace_owner']) {
        const comment = sqlOnly.match(new RegExp(`COMMENT ON FUNCTION public\\.${name}\\(uuid, uuid\\) IS[^;]*;`))
        expect(comment).not.toBeNull()
        expect(comment![0]).toMatch(/requireWorkspaceAccess/)
        expect(comment![0]).toMatch(/not removed as duplication/)
      }
    })
  })

  // ══ Section (c) — workspace_project_permission, six hops ═══════════════
  describe('workspace_project_permission — six hops, custody-bound, lineage-checked', () => {
    it('opens with the D-56 kill-switch conjunct', () => {
      const block = functionBlock('workspace_project_permission')
      const selectIndex = block.indexOf('SELECT')
      const killSwitchIndex = block.indexOf('public.workspace_access_enabled()')
      expect(killSwitchIndex).toBeGreaterThan(selectIndex)
      // It is the first conjunct: nothing but "SELECT" precedes it.
      expect(normalizeWhitespace(block.slice(selectIndex, killSwitchIndex))).toBe('SELECT')
    })

    it('hop 1-2: a live attachment joined to an active, unexpired membership', () => {
      const block = functionBlock('workspace_project_permission')
      expect(block).toMatch(/FROM public\.workspace_attachments a/)
      expect(block).toMatch(/JOIN public\.workspace_members m/)
      expect(block).toContain("m.status = 'active'")
      expect(block).toContain('(m.expires_at IS NULL OR m.expires_at > now())')
    })

    it('hop 3: the relationship join has NO nullable relationship_id fallback', () => {
      const block = functionBlock('workspace_project_permission')
      expect(block).toMatch(/JOIN public\.workspace_roster_relationships r/)
      expect(block).toContain('r.id = a.relationship_id')
      expect(block).not.toContain('a.relationship_id IS NULL')
    })

    it('hop 4: the grant join has NO nullable relationship_id fallback', () => {
      const block = functionBlock('workspace_project_permission')
      expect(block).toMatch(/JOIN public\.workspace_grants g/)
      expect(block).toContain('g.relationship_id = r.id')
      expect(block).not.toContain('g.relationship_id IS NULL')
    })

    it('hop 5: the vault_projects join constrains both p.id and p.user_id = r.member_user_id (custody bind)', () => {
      const block = functionBlock('workspace_project_permission')
      expect(block).toMatch(/JOIN public\.vault_projects p/)
      expect(block).toContain('p.id = a.project_id')
      expect(block).toContain('p.user_id = r.member_user_id')
    })

    it('hop 6: calls workspace_grant_lineage_live on the resolved grant', () => {
      const block = functionBlock('workspace_project_permission')
      expect(block).toMatch(/public\.workspace_grant_lineage_live\(g\.id\)/)
    })

    it('is STABLE SECURITY DEFINER with an empty search path, taking (project, uid, permission)', () => {
      const block = normalizeWhitespace(functionBlock('workspace_project_permission'))
      expect(block).toContain('LANGUAGE sql STABLE SECURITY DEFINER')
      expect(block).toContain("SET search_path = ''")
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

    it('revokes then grants EXECUTE, never to anon', () => {
      const revokeIndex = sqlOnly.indexOf(
        'REVOKE EXECUTE ON FUNCTION public.workspace_project_permission(uuid, uuid, text) FROM PUBLIC, anon, authenticated;'
      )
      const grantIndex = sqlOnly.indexOf(
        'GRANT  EXECUTE ON FUNCTION public.workspace_project_permission(uuid, uuid, text) TO authenticated;'
      )
      expect(revokeIndex).toBeGreaterThanOrEqual(0)
      expect(grantIndex).toBeGreaterThan(revokeIndex)
      expect(sqlOnly).not.toMatch(
        /GRANT\s+EXECUTE ON FUNCTION public\.workspace_project_permission\([^)]*\)\s+TO\s+anon/
      )
    })

    it('the comment describes all six hops and restates the no-storage-path rule', () => {
      const comment = sqlOnly.match(
        /COMMENT ON FUNCTION public\.workspace_project_permission\(uuid, uuid, text\) IS[^;]*;/
      )
      expect(comment).not.toBeNull()
      expect(comment![0]).toMatch(/hop 1/)
      expect(comment![0]).toMatch(/hop 5/)
      expect(comment![0]).toMatch(/hop 6/)
      expect(comment![0]).toMatch(/never resolves, signs or returns a storage path or URL/)
      expect(comment![0]).toContain('not a client-invoked RPC')
    })
  })

  // ══ Negative structural guarantees ══════════════════════════════════════
  describe('negative structural guarantees', () => {
    it('creates and drops NO policy anywhere in the file', () => {
      expect(sqlNoDocs).not.toMatch(/CREATE POLICY/i)
      expect(sqlNoDocs).not.toMatch(/DROP POLICY/i)
    })

    it('names none of the four child tables — those remain migration 193\'s job', () => {
      expect(sqlNoDocs).not.toMatch(/\btracks\b/)
      expect(sqlNoDocs).not.toMatch(/\bvault_assets\b/)
      expect(sqlNoDocs).not.toMatch(/\bvault_documents\b/)
      expect(sqlNoDocs).not.toMatch(/\btool_outputs\b/)
    })

    it('touches none of handle_new_user, member_type, industry_roles, capability_grants or project_members (D-52)', () => {
      for (const forbidden of [
        'handle_new_user',
        'member_type',
        'industry_roles',
        'capability_grants',
        'project_members',
      ]) {
        expect(sqlNoDocs).not.toMatch(new RegExp(`\\b${forbidden}\\b`))
      }
    })

    it('never disables row level security', () => {
      expect(sqlNoDocs).not.toMatch(/DISABLE ROW LEVEL SECURITY/i)
    })

    it('never uses uuid_generate_v4', () => {
      expect(sqlOnly).not.toContain('uuid_generate_v4')
    })
  })

  // ══ Housekeeping ══════════════════════════════════════════════════════════
  describe('housekeeping', () => {
    it('warns that supabase db push must never be run by an executor agent', () => {
      expect(migration).toMatch(/HUMAN-GATED/)
      expect(migration).toMatch(/never runs.*supabase db push/)
    })

    it('states it is pushed WITH 191/193/194, never staged alone', () => {
      expect(migration).toMatch(/PUSHED WITH 191, 193 AND 194 — NEVER STAGED ALONE/)
      expect(migration).toMatch(/never staged ahead of that\s*\n?-- window/)
    })

    it('documents the migration numbering (190 separate, 191 schema, 193-194 later, 195-198 future phases)', () => {
      expect(migration).toContain('192')
      expect(migration).toMatch(/190 = plan 02/)
      expect(migration).toMatch(/191 = plan 05/)
      expect(migration).toMatch(/193 and 194 remain this phase's later plans/)
      expect(migration).toMatch(/195-196 are RESERVED for Phase 38\.0\.2/)
      expect(migration).toMatch(/197-198 are RESERVED for\s*\n--\s*Phase 38\.2/)
    })

    it('restates the recursion doctrine and the Pitfall 1 non-recursion nuance', () => {
      expect(migration).toMatch(/RECURSION DOCTRINE/)
      expect(migration).toMatch(/42P17|SQLSTATE/)
      expect(migration).toMatch(/does not trigger RLS re-evaluation/)
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

    it('creates exactly four functions in this file', () => {
      const matches = sqlOnly.match(/CREATE OR REPLACE FUNCTION/g) ?? []
      expect(matches).toHaveLength(4)
    })
  })
})
