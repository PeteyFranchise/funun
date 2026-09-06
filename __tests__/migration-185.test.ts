import { readFileSync } from 'fs'
import path from 'path'

// ─── migration 185 — workspace attachments, custody transfers ─────────────
// Text-lock + structural test, in the established style of
// __tests__/migration-182.test.ts, __tests__/migration-183.test.ts, and
// __tests__/migration-184.test.ts. This project's migrations are
// human-gated: an agent never pushes them, so this file IS the pre-push
// review evidence for D-23 (no owner_workspace_id column), D-25 (detach
// severs, never deletes), D-26 (attachment as a query, never a copy), D-29
// (two-sided custody transfer), custody-negotiation privacy, and — the most
// important one — the scope guard proving Slice D's live-policy work
// (migration 186) did not leak into this additive batch.

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/185_workspace_attachments_custody.sql'),
  'utf8'
)

// Executable SQL only, with `--` comment lines stripped. Structural and
// negative assertions must run against this rather than the raw file.
const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

const TABLES = ['workspace_attachments', 'workspace_custody_transfers'] as const

const HELPERS = ['workspace_attachment_visible', 'custody_transfer_visible'] as const

const PRODUCTION_TABLES = ['vault_projects', 'tracks', 'vault_assets', 'vault_documents', 'tool_outputs'] as const

describe('migration 185 — workspace_attachments, workspace_custody_transfers', () => {
  // ══ Table shape ═══════════════════════════════════════════════════════
  describe('both tables exist with row level security and gen_random_uuid() defaults', () => {
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

  // ══ Attachment shape (WS-09, D-23) ══════════════════════════════════════
  describe('workspace_attachments carries the link columns and the load-bearing indexes (WS-09, D-23)', () => {
    const tableBlock = sql.slice(
      sql.indexOf('CREATE TABLE public.workspace_attachments'),
      sql.indexOf('\n);', sql.indexOf('CREATE TABLE public.workspace_attachments'))
    )

    it('declares workspace_id, project_id and detached_at columns', () => {
      const body = normalizeWhitespace(tableBlock)
      expect(body).toMatch(/workspace_id\s+UUID NOT NULL REFERENCES public\.workspaces/)
      expect(body).toMatch(/project_id\s+UUID NOT NULL REFERENCES public\.vault_projects/)
      expect(body).toContain('detached_at')
    })

    it('declares the partial unique index on (workspace_id, project_id) WHERE detached_at IS NULL', () => {
      const block = normalizeWhitespace(
        sql.slice(
          sql.indexOf('CREATE UNIQUE INDEX idx_workspace_attachments_live_pair'),
          sql.indexOf('CREATE INDEX idx_workspace_attachments_project_live')
        )
      )
      expect(block).toContain('ON public.workspace_attachments (workspace_id, project_id)')
      expect(block).toContain('WHERE detached_at IS NULL')
    })

    it('declares the covering index on (project_id, workspace_id) WHERE detached_at IS NULL', () => {
      const block = normalizeWhitespace(
        sql.slice(
          sql.indexOf('CREATE INDEX idx_workspace_attachments_project_live'),
          sql.indexOf('CREATE INDEX idx_workspace_attachments_workspace_live')
        )
      )
      expect(block).toContain('ON public.workspace_attachments (project_id, workspace_id)')
      expect(block).toContain('WHERE detached_at IS NULL')
    })

    it('declares a catalogue index on (workspace_id) WHERE detached_at IS NULL', () => {
      const block = normalizeWhitespace(
        sql.slice(
          sql.indexOf('CREATE INDEX idx_workspace_attachments_workspace_live'),
          sql.indexOf('ALTER TABLE public.workspace_attachments ENABLE ROW LEVEL SECURITY')
        )
      )
      expect(block).toContain('ON public.workspace_attachments (workspace_id)')
      expect(block).toContain('WHERE detached_at IS NULL')
    })
  })

  // ══ No custody column on the project (D-23) ════════════════════════════
  describe('no workspace-ownership column is added to vault_projects (D-23)', () => {
    it('contains no ALTER TABLE public.vault_projects', () => {
      expect(sql).not.toMatch(/ALTER TABLE public\.vault_projects/i)
    })

    it('contains no owner_workspace_id identifier anywhere', () => {
      expect(sql).not.toMatch(/owner_workspace_id/i)
    })

    it('contains no ADD COLUMN against any pre-existing table', () => {
      expect(sql).not.toMatch(/ADD COLUMN/i)
    })
  })

  // ══ Detach is not delete (D-25) ═════════════════════════════════════════
  describe('detachment severs the link only; nothing is deleted (D-25)', () => {
    it('contains no DELETE FROM public.workspace_attachments', () => {
      expect(sql).not.toMatch(/DELETE FROM public\.workspace_attachments/i)
    })

    it('attachments never cascade from a workspace_members row', () => {
      // The hazard this guards against: an FK from workspace_attachments to
      // workspace_members with ON DELETE CASCADE would silently delete an
      // attachment (never merely detach it) the moment a seat is removed —
      // violating D-25's "nothing is deleted" guarantee. workspace_id and
      // project_id cascade from workspaces/vault_projects deliberately;
      // this asserts the workspace_members hazard specifically does not
      // exist anywhere in the table definition.
      expect(sql).not.toMatch(/REFERENCES public\.workspace_members[^,)]*ON DELETE CASCADE/i)
    })

    it('cascades only from workspaces and vault_projects (plus the relationship link)', () => {
      const tableBlock = sql.slice(
        sql.indexOf('CREATE TABLE public.workspace_attachments'),
        sql.indexOf('\n);', sql.indexOf('CREATE TABLE public.workspace_attachments'))
      )
      const cascadeSources = [...tableBlock.matchAll(/REFERENCES (public\.\w+)[^,)]*ON DELETE CASCADE/gi)].map(
        (m) => m[1]
      )
      expect(cascadeSources).toEqual(
        expect.arrayContaining(['public.workspaces', 'public.vault_projects'])
      )
      for (const source of cascadeSources) {
        expect(['public.workspaces', 'public.vault_projects', 'public.workspace_roster_relationships']).toContain(
          source
        )
      }
    })
  })

  // ══ Two-sided custody (WS-12, D-29) ═════════════════════════════════════
  describe('custody transfer is structurally two-sided (WS-12, D-29)', () => {
    it("the state CHECK lists exactly offered, accepted, declined, withdrawn", () => {
      expect(sql).toContain(
        "state          TEXT NOT NULL DEFAULT 'offered'\n" +
          "                 CHECK (state IN ('offered', 'accepted', 'declined', 'withdrawn'))"
      )
    })

    it('declares CHECK (from_user_id <> to_user_id)', () => {
      expect(sql).toContain('CHECK (from_user_id <> to_user_id)')
    })

    it('declares a partial unique index on (project_id) WHERE state = \'offered\'', () => {
      const block = normalizeWhitespace(
        sql.slice(
          sql.indexOf('CREATE UNIQUE INDEX idx_workspace_custody_transfers_one_live_offer'),
          sql.indexOf('CREATE INDEX idx_workspace_custody_transfers_project')
        )
      )
      expect(block).toContain('ON public.workspace_custody_transfers (project_id)')
      expect(block).toContain("WHERE state = 'offered'")
    })

    it('guard_custody_transfer_offered_by_holder exists as a BEFORE INSERT trigger raising insufficient_privilege', () => {
      const fnBlock = sql.slice(
        sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_custody_transfer_offered_by_holder'),
        sql.indexOf('DROP TRIGGER IF EXISTS guard_custody_transfer_offered_by_holder')
      )
      expect(fnBlock).toMatch(/RETURNS TRIGGER/)
      expect(fnBlock).toContain("USING ERRCODE = 'insufficient_privilege'")

      const triggerBlock = sql.slice(
        sql.indexOf('DROP TRIGGER IF EXISTS guard_custody_transfer_offered_by_holder'),
        sql.indexOf('NOTIFY pgrst')
      )
      expect(triggerBlock).toMatch(
        /CREATE TRIGGER guard_custody_transfer_offered_by_holder\s+BEFORE INSERT ON public\.workspace_custody_transfers/
      )
    })

    it('the guard checks offered_by against from_user_id and an active owner/admin role on workspace_id', () => {
      const fnBlock = normalizeWhitespace(
        sql.slice(
          sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_custody_transfer_offered_by_holder'),
          sql.indexOf('REVOKE EXECUTE ON FUNCTION public.guard_custody_transfer_offered_by_holder')
        )
      )
      expect(fnBlock).toContain('NEW.offered_by <> NEW.from_user_id')
      expect(fnBlock).toMatch(/public\.workspace_member_role\(NEW\.workspace_id, NEW\.offered_by\)\s*IN\s*\(\s*'owner',\s*'admin'\s*\)/)
    })
  })

  // ══ Custody privacy ═════════════════════════════════════════════════════
  describe('custody_transfer_visible keys only on the three named parties (T-38-10-04)', () => {
    it('references from_user_id, to_user_id and offered_by in its body', () => {
      const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.custody_transfer_visible')
      const end = sql.indexOf('\n$$;', start)
      const body = sql.slice(start, end)
      expect(body).toContain('from_user_id = p_uid')
      expect(body).toContain('to_user_id = p_uid')
      expect(body).toContain('offered_by = p_uid')
    })

    it('never calls workspace_member_role from inside its body', () => {
      const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.custody_transfer_visible')
      const end = sql.indexOf('\n$$;', start)
      const body = sql.slice(start, end)
      expect(body).not.toContain('workspace_member_role')
    })
  })

  // ══ Lockdown ═════════════════════════════════════════════════════════════
  describe('two-table write lockdown — no client PostgREST write path', () => {
    it.each(TABLES)('revokes INSERT/UPDATE/DELETE on public.%s from authenticated and anon', (table) => {
      expect(sql).toContain(`REVOKE INSERT, UPDATE, DELETE ON public.${table} FROM authenticated, anon;`)
    })
  })

  // ══ Helper conventions ══════════════════════════════════════════════════
  describe('the helper pair is SECURITY DEFINER, STABLE, and search-path-pinned', () => {
    function functionBlock(name: string): string {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
      expect(start).toBeGreaterThanOrEqual(0)
      const end = sql.indexOf('\n$$;', start)
      expect(end).toBeGreaterThan(start)
      return sql.slice(start, end)
    }

    it('workspace_attachment_visible declares (p_attachment_id UUID, p_uid UUID)', () => {
      const block = normalizeWhitespace(functionBlock('workspace_attachment_visible'))
      expect(block).toContain('(p_attachment_id UUID, p_uid UUID)')
      expect(block).toContain('LANGUAGE sql STABLE SECURITY DEFINER')
      expect(block).toContain("SET search_path = ''")
    })

    it('custody_transfer_visible declares (p_transfer_id UUID, p_uid UUID)', () => {
      const block = normalizeWhitespace(functionBlock('custody_transfer_visible'))
      expect(block).toContain('(p_transfer_id UUID, p_uid UUID)')
      expect(block).toContain('LANGUAGE sql STABLE SECURITY DEFINER')
      expect(block).toContain("SET search_path = ''")
    })

    it.each(HELPERS)('revokes then grants EXECUTE on public.%s to authenticated only', (helper) => {
      const revokeIndex = sql.indexOf(
        `REVOKE EXECUTE ON FUNCTION public.${helper}(uuid, uuid) FROM PUBLIC, anon, authenticated;`
      )
      const grantIndex = sql.indexOf(`GRANT  EXECUTE ON FUNCTION public.${helper}(uuid, uuid) TO authenticated;`)
      expect(revokeIndex).toBeGreaterThanOrEqual(0)
      expect(grantIndex).toBeGreaterThan(revokeIndex)
      expect(sql).not.toMatch(new RegExp(`GRANT\\s+EXECUTE ON FUNCTION public\\.${helper}\\(uuid, uuid\\) TO anon`))
    })

    it.each(HELPERS)('documents public.%s as an RLS primitive, not a client RPC', (helper) => {
      const comment = sql.match(new RegExp(`COMMENT ON FUNCTION public\\.${helper}\\(uuid, uuid\\) IS[^;]*;`))
      expect(comment).not.toBeNull()
      expect(comment![0]).toContain('SECURITY DEFINER')
      expect(comment![0]).toContain('wrapped as (SELECT ...)')
      expect(comment![0]).toContain('not a client-invoked RPC')
    })

    it('the unwrapped-helper-call array in policy bodies is empty', () => {
      const policyRegion = sql.slice(sql.indexOf('CREATE POLICY'))
      const helperPattern = /public\.(workspace_attachment_visible|custody_transfer_visible)\s*\(/g
      const calls = policyRegion.match(helperPattern) ?? []
      expect(calls.length).toBeGreaterThanOrEqual(2)

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
      const policyRegion = sql.slice(sql.indexOf('CREATE POLICY'))
      expect(policyRegion).not.toMatch(/EXISTS\s*\(\s*SELECT 1 FROM (public\.)?workspace_attachments/i)
      expect(policyRegion).not.toMatch(/EXISTS\s*\(\s*SELECT 1 FROM (public\.)?workspace_custody_transfers/i)
    })
  })

  // ══ Scope guard (the important one) ═════════════════════════════════════
  describe('scope guard — Slice D policy work (migration 186) does not leak into this migration', () => {
    it.each(PRODUCTION_TABLES)('never creates or drops a policy naming %s', (table) => {
      const policyPattern = new RegExp(`(CREATE|DROP) POLICY[^;]*\\bON public\\.${table}\\b`, 'i')
      expect(sql).not.toMatch(policyPattern)
    })

    it('never drops a policy anywhere in this file', () => {
      expect(sql).not.toMatch(/DROP POLICY/i)
    })

    it('does not define a three-hop project-permission helper here', () => {
      expect(sql).not.toMatch(/workspace_project_permission/i)
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

    it('never alters project_members or work_members', () => {
      expect(sql).not.toMatch(/ALTER TABLE public\.project_members/i)
      expect(sql).not.toMatch(/ALTER TABLE public\.work_members/i)
    })

    it('never alters the migration-182/183/184 workspace tables', () => {
      expect(sql).not.toMatch(/ALTER TABLE public\.workspaces\b/i)
      expect(sql).not.toMatch(/ALTER TABLE public\.workspace_members\b/i)
      expect(sql).not.toMatch(/ALTER TABLE public\.workspace_invitations\b/i)
      expect(sql).not.toMatch(/ALTER TABLE public\.workspace_audit_log\b/i)
      expect(sql).not.toMatch(/ALTER TABLE public\.workspace_roster_relationships\b/i)
      expect(sql).not.toMatch(/ALTER TABLE public\.workspace_agreement_evidence\b/i)
      expect(sql).not.toMatch(/ALTER TABLE public\.workspace_roster_blocks\b/i)
      expect(sql).not.toMatch(/ALTER TABLE public\.workspace_grants\b/i)
      expect(sql).not.toMatch(/ALTER TABLE public\.workspace_permission_bundles\b/i)
    })

    it('never redefines workspace_member_role, is_workspace_owner, or the 183/184 helper functions', () => {
      expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.workspace_member_role/)
      expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.is_workspace_owner/)
      expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.workspace_roster_relationship_is_live/)
      expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.workspace_agreement_evidence_visible/)
      expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.workspace_grant_visible_to_member/)
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

    it('documents the 185 numbering and the 187/188 reservation for Phase 38.2', () => {
      expect(migration).toContain('185')
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
