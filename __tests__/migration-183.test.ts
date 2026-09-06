import { readFileSync } from 'fs'
import path from 'path'
import { ROSTER_RELATIONSHIP_STATE_VALUES } from '@/lib/workspaces/types'

// ─── migration 183 — workspace roster relationships, agreement evidence, ──
//                     blocks
// Text-lock + structural test, in the established style of
// __tests__/migration-182.test.ts and __tests__/migration-136.test.ts. This
// project's migrations are human-gated: an agent never pushes them, so this
// file IS the pre-push review evidence for the D-05 inertness shape, the
// D-15 multiplicity guarantee, the D-16/D-39 compute-on-read evidence
// ladder, the D-37 forbidden-vocabulary rule, and the D-51 member-private
// block list.
//
// The state CHECK-clause assertion is built FROM
// ROSTER_RELATIONSHIP_STATE_VALUES (lib/workspaces/types.ts) rather than
// restating the five literals inline, so adding or renaming a roster state
// there without updating this migration fails this suite instead of
// drifting silently into production.

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/183_workspace_roster_relationships.sql'),
  'utf8'
)

// Executable SQL only, with `--` comment lines stripped. Structural and
// negative assertions must run against this rather than the raw file,
// because this migration's own header and table-comment prose legitimately
// discusses "document_supported", "verified" and "approved" in plain words
// to state the rule those very words must never appear as stored status
// (D-37, D-39) — see the housekeeping describe block below.
const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** CHECK (col IN ('a', 'b', ...)) clause built from a *_VALUES array. */
function checkClause(column: string, values: readonly string[]): string {
  const list = values.map((v) => `'${v}'`).join(', ')
  return `${column} IN (${list})`
}

const TABLES = [
  'workspace_roster_relationships',
  'workspace_agreement_evidence',
  'workspace_roster_blocks',
] as const

const HELPERS = [
  'workspace_roster_relationship_is_live',
  'workspace_agreement_evidence_visible',
] as const

describe('migration 183 — workspace_roster_relationships, workspace_agreement_evidence, workspace_roster_blocks', () => {
  // ══ Table shape ═══════════════════════════════════════════════════════
  describe('all three tables exist with row level security and gen_random_uuid() defaults', () => {
    it.each(TABLES)('creates public.%s', (table) => {
      expect(sql).toContain(`CREATE TABLE public.${table}`)
    })

    it.each(TABLES)('enables row level security on public.%s', (table) => {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`)
    })

    it.each(TABLES)('primary keys public.%s with gen_random_uuid()', (table) => {
      const start = sql.indexOf(`CREATE TABLE public.${table}`)
      const end = sql.indexOf('\n);', start)
      const body = normalizeWhitespace(sql.slice(start, end))
      expect(body).toContain('id UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    })
  })

  // ══ state CHECK mirrors ROSTER_RELATIONSHIP_STATE_VALUES ═══════════════
  describe('workspace_roster_relationships.state matches ROSTER_RELATIONSHIP_STATE_VALUES', () => {
    it('has exactly five literals imported from lib/workspaces/types', () => {
      expect(ROSTER_RELATIONSHIP_STATE_VALUES).toHaveLength(5)
    })

    it('the CHECK clause is built from the imported values array', () => {
      expect(sql).toContain(checkClause('state', ROSTER_RELATIONSHIP_STATE_VALUES))
    })

    it("defaults to the literal 'proposed'", () => {
      expect(sql).toMatch(/state\s+TEXT NOT NULL DEFAULT 'proposed'/)
    })
  })

  // ══ D-15: multiplicity across workspaces is structurally permitted ═════
  describe('a Member may hold roster relationships across any number of workspaces (D-15)', () => {
    it('declares a partial unique index scoped to (workspace_id, member_user_id), live states only', () => {
      expect(sql).toContain(
        'CREATE UNIQUE INDEX idx_workspace_roster_relationships_live_pair\n' +
          '  ON public.workspace_roster_relationships (workspace_id, member_user_id)\n' +
          "  WHERE state IN ('proposed', 'accepted');"
      )
    })

    it('the workspace_roster_blocks uniqueness is also scoped to the (workspace_id, member_user_id) pair', () => {
      expect(sql).toContain('UNIQUE (workspace_id, member_user_id)')
    })

    it('never defines a UNIQUE index or constraint keyed on member_user_id alone', () => {
      expect(sql).not.toMatch(/UNIQUE\s*\(\s*member_user_id\s*\)/)
      expect(sql).not.toMatch(/CREATE UNIQUE INDEX[^;]*ON public\.\w+\s*\(\s*member_user_id\s*\)/)
    })
  })

  // ══ D-05: a proposed relationship is inert; the Member sees it, the ═════
  //          workspace does not
  describe('the named Member sees their own claim; workspace-side reads require an active role (D-05)', () => {
    const relationshipsPolicy = sql.slice(
      sql.indexOf('CREATE POLICY "workspace_roster_relationships_select"'),
      sql.indexOf('CREATE POLICY "workspace_agreement_evidence_select"')
    )

    it('grants the named Member sight of their own row, unconditional on state', () => {
      expect(relationshipsPolicy).toContain('member_user_id = (SELECT auth.uid())')
    })

    it('grants workspace-side read access only through an active workspace_member_role() call', () => {
      expect(relationshipsPolicy).toContain(
        '(SELECT public.workspace_member_role(workspace_id, auth.uid())) IS NOT NULL'
      )
    })

    it('never grants workspace-side visibility through a bare cross-table EXISTS (the 018 recursion shape)', () => {
      expect(relationshipsPolicy).not.toMatch(/EXISTS\s*\(\s*SELECT 1 FROM (public\.)?workspace_members/i)
    })
  })

  // ══ D-39: no stored document_supported state, no scheduled job ═════════
  describe('authority lapse is compute-on-read, never a stored state or a cron job (D-16, D-39)', () => {
    it('declares no document_supported column or state anywhere in executable SQL', () => {
      expect(sql).not.toMatch(/document_supported/i)
    })

    it('contains no scheduler / pg_cron statement', () => {
      expect(sql).not.toMatch(/pg_cron|cron\.schedule|CREATE EXTENSION[^;]*cron/i)
    })

    it('workspace_agreement_evidence declares expires_at, superseded_at, and declared_scope NOT NULL', () => {
      const block = sql.slice(
        sql.indexOf('CREATE TABLE public.workspace_agreement_evidence'),
        sql.indexOf('CREATE INDEX idx_workspace_agreement_evidence_relationship_expires')
      )
      const normalized = normalizeWhitespace(block)
      expect(normalized).toContain('expires_at')
      expect(normalized).toContain('superseded_at')
      expect(normalized).toMatch(/declared_scope\s+TEXT NOT NULL/)
    })
  })

  // ══ D-37: no validated-status judgement word leaks into executable SQL ═
  describe('no column, default, or identifier claims Funūn validated a document (D-37)', () => {
    // The raw file's prose (this migration's `--` comments, stripped out of
    // `sql` above) deliberately explains this rule in plain words, including
    // the words "verified" and "approved" themselves — see the header and
    // the workspace_agreement_evidence explanatory comment block in the raw
    // file. That is intentional and is exactly why this assertion runs
    // against `sql` (comment-stripped), never against `migration` (raw).
    it('contains no case-insensitive "verified" in comment-stripped SQL', () => {
      expect(sql).not.toMatch(/verified/i)
    })

    it('contains no case-insensitive "approved" in comment-stripped SQL', () => {
      expect(sql).not.toMatch(/approved/i)
    })
  })

  // ══ Write lockdown ══════════════════════════════════════════════════════
  describe('three-table write lockdown — no client PostgREST write path', () => {
    it.each(TABLES)('revokes INSERT/UPDATE/DELETE on public.%s from authenticated and anon', (table) => {
      expect(sql).toContain(`REVOKE INSERT, UPDATE, DELETE ON public.${table} FROM authenticated, anon;`)
    })
  })

  // ══ SECURITY DEFINER helper pair ══════════════════════════════════════
  describe('the helper pair is SECURITY DEFINER, STABLE, and search-path-pinned', () => {
    function functionBlock(name: string): string {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
      expect(start).toBeGreaterThanOrEqual(0)
      const end = sql.indexOf('\n$$;', start)
      expect(end).toBeGreaterThan(start)
      return sql.slice(start, end)
    }

    it('workspace_roster_relationship_is_live declares (p_workspace_id UUID, p_member_user_id UUID)', () => {
      const block = normalizeWhitespace(functionBlock('workspace_roster_relationship_is_live'))
      expect(block).toContain('(p_workspace_id UUID, p_member_user_id UUID)')
      expect(block).toContain('LANGUAGE sql STABLE SECURITY DEFINER')
      expect(block).toContain("SET search_path = ''")
    })

    it('workspace_agreement_evidence_visible declares (p_evidence_id UUID, p_uid UUID)', () => {
      const block = normalizeWhitespace(functionBlock('workspace_agreement_evidence_visible'))
      expect(block).toContain('(p_evidence_id UUID, p_uid UUID)')
      expect(block).toContain('LANGUAGE sql STABLE SECURITY DEFINER')
      expect(block).toContain("SET search_path = ''")
    })

    it.each(HELPERS)('revokes then grants EXECUTE on public.%s to authenticated only', (helper) => {
      const revokeIndex = sql.indexOf(
        `REVOKE EXECUTE ON FUNCTION public.${helper}(uuid, uuid) FROM PUBLIC, anon, authenticated;`
      )
      const grantIndex = sql.indexOf(
        `GRANT  EXECUTE ON FUNCTION public.${helper}(uuid, uuid) TO authenticated;`
      )
      expect(revokeIndex).toBeGreaterThanOrEqual(0)
      expect(grantIndex).toBeGreaterThan(revokeIndex)
      expect(sql).not.toMatch(
        new RegExp(`GRANT\\s+EXECUTE ON FUNCTION public\\.${helper}\\(uuid, uuid\\) TO anon`)
      )
    })

    it.each(HELPERS)('documents public.%s as an RLS primitive, not a client RPC', (helper) => {
      const comment = sql.match(
        new RegExp(`COMMENT ON FUNCTION public\\.${helper}\\(uuid, uuid\\) IS[^;]*;`)
      )
      expect(comment).not.toBeNull()
      expect(comment![0]).toContain('SECURITY DEFINER')
      expect(comment![0]).toContain('wrapped as (SELECT ...)')
      expect(comment![0]).toContain('not a client-invoked RPC')
    })
  })

  // ══ Scalar-subselect wrapping — structural recursion guard ═══════════════
  describe('every helper call inside a policy body is scalar-subselect wrapped', () => {
    const policyRegion = sql.slice(sql.indexOf('CREATE POLICY'))
    const helperPattern =
      /public\.(workspace_member_role|is_workspace_owner|workspace_roster_relationship_is_live|workspace_agreement_evidence_visible)\s*\(/g

    it('finds helper calls in the policy region at all (the sample is not empty)', () => {
      const calls = policyRegion.match(helperPattern) ?? []
      expect(calls.length).toBeGreaterThanOrEqual(2)
    })

    it('precedes every one of them with "(SELECT "', () => {
      const pattern = new RegExp(helperPattern.source, 'g')
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

    it('inlines no cross-table EXISTS subquery in any policy body (the 018 recursion shape)', () => {
      expect(policyRegion).not.toMatch(/EXISTS\s*\(\s*SELECT 1 FROM (public\.)?workspace_members/i)
    })
  })

  // ══ D-51: blocks are member-private ═════════════════════════════════════
  describe('workspace_roster_blocks_select never lets a workspace enumerate who blocked it (D-51)', () => {
    it('the USING clause references only member_user_id and auth.uid()', () => {
      const policy = sql.slice(
        sql.indexOf('CREATE POLICY "workspace_roster_blocks_select"'),
        sql.indexOf('NOTIFY pgrst')
      )
      expect(policy).toContain('USING (member_user_id = (SELECT auth.uid()));')
      expect(policy).not.toContain('workspace_member_role')
      expect(policy).not.toContain('is_workspace_owner')
    })
  })

  // ══ Negative assertions — nothing pre-existing touched ═════════════════
  describe('negative assertions — additive only, nothing pre-existing perturbed', () => {
    it('never uses uuid_generate_v4', () => {
      expect(sql).not.toContain('uuid_generate_v4')
    })

    it('never disables row level security', () => {
      expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i)
    })

    it('never drops a policy (nothing pre-existing is being rewritten here)', () => {
      expect(sql).not.toMatch(/DROP POLICY/i)
    })

    it('never alters project_members or work_members', () => {
      expect(sql).not.toMatch(/ALTER TABLE public\.project_members/i)
      expect(sql).not.toMatch(/ALTER TABLE public\.work_members/i)
    })

    it('never alters the migration-182 workspaces tables', () => {
      expect(sql).not.toMatch(/ALTER TABLE public\.workspaces\b/i)
      expect(sql).not.toMatch(/ALTER TABLE public\.workspace_members\b/i)
      expect(sql).not.toMatch(/ALTER TABLE public\.workspace_invitations\b/i)
      expect(sql).not.toMatch(/ALTER TABLE public\.workspace_audit_log\b/i)
    })

    it('never redefines workspace_member_role or is_workspace_owner (already live from migration 182)', () => {
      expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.workspace_member_role/)
      expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.is_workspace_owner/)
    })

    it('never opens a bare USING (true) policy', () => {
      expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i)
    })
  })

  // ══ Housekeeping ══════════════════════════════════════════════════════
  describe('housekeeping', () => {
    it('warns that supabase db push must never be run by an executor agent', () => {
      expect(migration).toMatch(/never.*supabase db push|supabase db push.*checkpoint|HUMAN-GATED/i)
    })

    it('documents the 183 numbering and the 187/188 reservation for Phase 38.2', () => {
      expect(migration).toContain('183')
      expect(migration).toContain('187')
      expect(migration).toContain('188')
      expect(migration).toMatch(/RESERVED for Phase 38\.2/)
    })

    it('uses gen_random_uuid() and never uuid_generate_v4() anywhere', () => {
      expect(sql).toContain('gen_random_uuid()')
      expect(sql).not.toContain('uuid_generate_v4')
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
  })
})
