import { readFileSync } from 'fs'
import path from 'path'
import {
  WORKSPACE_TYPE_VALUES,
  WORKSPACE_ROLE_VALUES,
  WORKSPACE_MEMBERSHIP_STATE_VALUES,
  WORKSPACE_VERIFICATION_STATE_VALUES,
  WORKSPACE_INVITATION_STATE_VALUES,
} from '@/lib/workspaces/types'
import { WORKSPACE_OWNER_FLOOR_MESSAGE } from '@/lib/workspaces/membership'

// ─── migration 182 — workspaces foundation ─────────────────────────────────
// Text-lock + structural test, in the established style of
// __tests__/migration-078.test.ts and __tests__/migration-136.test.ts.
// This project's migrations are human-gated: an agent never pushes them, so
// this file IS the pre-push review evidence for the never-zero-owners
// trigger, the write lockdown, and the recursion-avoidance helper pair.
//
// The CHECK-clause assertions are built FROM the TypeScript *_VALUES arrays
// rather than restating the literals inline, so adding a workspace role,
// state, or type in lib/workspaces/types.ts without updating this migration
// fails this suite instead of drifting silently into production.

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/182_workspaces_foundation.sql'),
  'utf8'
)

// Executable SQL only, with `--` comment lines stripped. Structural and
// negative assertions ("no handle_new_user", "no DISABLE RLS") must run
// against this rather than the raw file, because this migration's own
// header prose legitimately discusses both identifiers.
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

const HELPERS = ['workspace_member_role', 'is_workspace_owner'] as const
const TABLES = [
  'workspaces',
  'workspace_members',
  'workspace_invitations',
  'workspace_audit_log',
] as const

describe('migration 182 — workspaces, workspace_members, workspace_invitations, workspace_audit_log', () => {
  // ══ Table shape ═══════════════════════════════════════════════════════
  describe('all four tables exist with row level security and gen_random_uuid() defaults', () => {
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

  // ══ CHECK constraints mirror the TypeScript vocabulary ═══════════════════
  describe('CHECK constraints agree byte-for-byte with lib/workspaces/types.ts', () => {
    it('workspaces.workspace_type matches WORKSPACE_TYPE_VALUES', () => {
      expect(sql).toContain(checkClause('workspace_type', WORKSPACE_TYPE_VALUES))
    })

    it('workspaces.verification_state matches WORKSPACE_VERIFICATION_STATE_VALUES', () => {
      expect(sql).toContain(checkClause('verification_state', WORKSPACE_VERIFICATION_STATE_VALUES))
    })

    it('workspace_members.role matches WORKSPACE_ROLE_VALUES', () => {
      const block = sql.slice(
        sql.indexOf('CREATE TABLE public.workspace_members'),
        sql.indexOf('CREATE UNIQUE INDEX idx_workspace_members_unique_user')
      )
      expect(normalizeWhitespace(block)).toContain(checkClause('role', WORKSPACE_ROLE_VALUES))
    })

    it('workspace_members.status matches WORKSPACE_MEMBERSHIP_STATE_VALUES', () => {
      const block = sql.slice(
        sql.indexOf('CREATE TABLE public.workspace_members'),
        sql.indexOf('CREATE UNIQUE INDEX idx_workspace_members_unique_user')
      )
      expect(normalizeWhitespace(block)).toContain(checkClause('status', WORKSPACE_MEMBERSHIP_STATE_VALUES))
    })

    it('workspace_invitations.role matches WORKSPACE_ROLE_VALUES', () => {
      const block = sql.slice(
        sql.indexOf('CREATE TABLE public.workspace_invitations'),
        sql.indexOf('CREATE UNIQUE INDEX idx_workspace_invitations_one_live_per_email')
      )
      expect(normalizeWhitespace(block)).toContain(checkClause('role', WORKSPACE_ROLE_VALUES))
    })

    it('workspace_invitations.status matches WORKSPACE_INVITATION_STATE_VALUES', () => {
      const block = sql.slice(
        sql.indexOf('CREATE TABLE public.workspace_invitations'),
        sql.indexOf('CREATE UNIQUE INDEX idx_workspace_invitations_one_live_per_email')
      )
      expect(normalizeWhitespace(block)).toContain(checkClause('status', WORKSPACE_INVITATION_STATE_VALUES))
    })
  })

  // ══ D-04: born unverified ═════════════════════════════════════════════
  describe('a workspace is born unverified (D-04)', () => {
    it('verification_state defaults to the literal unverified', () => {
      const block = sql.slice(
        sql.indexOf('CREATE TABLE public.workspaces'),
        sql.indexOf('ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY')
      )
      expect(normalizeWhitespace(block)).toMatch(
        /verification_state\s+TEXT NOT NULL DEFAULT 'unverified'/
      )
    })

    it("never defaults verification_state to verified (rejecting buyer_orgs' born-verified default)", () => {
      const block = sql.slice(
        sql.indexOf('CREATE TABLE public.workspaces'),
        sql.indexOf('ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY')
      )
      expect(block).not.toMatch(/verification_state\s+TEXT NOT NULL DEFAULT 'verified'/)
    })
  })

  // ══ D-02: roster/catalogue independence ═══════════════════════════════
  describe('roster_enabled and catalogue_enabled are independent flags (D-02)', () => {
    it('both are BOOLEAN NOT NULL DEFAULT FALSE', () => {
      const block = normalizeWhitespace(
        sql.slice(
          sql.indexOf('CREATE TABLE public.workspaces'),
          sql.indexOf('ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY')
        )
      )
      expect(block).toContain('roster_enabled BOOLEAN NOT NULL DEFAULT FALSE')
      expect(block).toContain('catalogue_enabled BOOLEAN NOT NULL DEFAULT FALSE')
    })

    it('neither flag is derived from workspace_type anywhere in the executable SQL', () => {
      expect(sql).not.toMatch(/roster_enabled\s*=.*workspace_type/)
      expect(sql).not.toMatch(/catalogue_enabled\s*=.*workspace_type/)
      expect(sql).not.toMatch(/GENERATED ALWAYS AS[\s\S]{0,80}workspace_type/)
    })
  })

  // ══ Write lockdown (T-38-03-01) ════════════════════════════════════════
  describe('four-table write lockdown — no client PostgREST write path', () => {
    it.each(TABLES)('revokes INSERT/UPDATE/DELETE on public.%s from authenticated and anon', (table) => {
      expect(sql).toContain(
        `REVOKE INSERT, UPDATE, DELETE ON public.${table} FROM authenticated, anon;`
      )
    })

    it('additionally revokes UPDATE/DELETE on workspace_audit_log from PUBLIC (append-only, D-50)', () => {
      expect(sql).toContain('REVOKE UPDATE, DELETE ON public.workspace_audit_log FROM PUBLIC;')
    })
  })

  // ══ SECURITY DEFINER helper pair (T-38-03-02) ══════════════════════════
  describe('the helper pair is SECURITY DEFINER, STABLE, and search-path-pinned', () => {
    function functionBlock(name: string): string {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
      expect(start).toBeGreaterThanOrEqual(0)
      const end = sql.indexOf('\n$$;', start)
      expect(end).toBeGreaterThan(start)
      return sql.slice(start, end)
    }

    it.each(HELPERS)('declares public.%s correctly', (helper) => {
      const block = normalizeWhitespace(functionBlock(helper))
      expect(block).toContain('(p_workspace_id UUID, p_uid UUID)')
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
      expect(comment![0]).toContain('42P17')
      expect(comment![0]).toContain('wrapped as (SELECT ...)')
      expect(comment![0]).toContain('not a client-invoked RPC')
    })
  })

  // ══ Scalar-subselect wrapping — structural recursion guard ═══════════════
  describe('every helper call inside a policy body is scalar-subselect wrapped', () => {
    const policyRegion = sql.slice(
      sql.indexOf('CREATE POLICY'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_workspace_never_zero_owners')
    )

    it('finds helper calls in the policy region at all (the sample is not empty)', () => {
      const calls = policyRegion.match(/public\.(workspace_member_role|is_workspace_owner)\s*\(/g) ?? []
      expect(calls.length).toBeGreaterThanOrEqual(4)
    })

    it('precedes every one of them with "(SELECT "', () => {
      const pattern = /public\.(workspace_member_role|is_workspace_owner)\s*\(/g
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

  // ══ Own-table SELECT policies exist for all three policed tables ═══════
  describe('non-recursive SELECT policies', () => {
    it('workspaces_select_member widens to any active member or the creator', () => {
      const policy = sql.slice(
        sql.indexOf('CREATE POLICY "workspaces_select_member"'),
        sql.indexOf('CREATE POLICY "workspace_members_select"')
      )
      expect(policy).toContain('(SELECT public.workspace_member_role(id, auth.uid())) IS NOT NULL')
      expect(policy).toContain('created_by = (SELECT auth.uid())')
    })

    it('workspace_members_select allows own row, owner, or admin', () => {
      const policy = sql.slice(
        sql.indexOf('CREATE POLICY "workspace_members_select"'),
        sql.indexOf('CREATE POLICY "workspace_invitations_select"')
      )
      expect(policy).toContain('user_id = (SELECT auth.uid())')
      expect(policy).toContain('(SELECT public.is_workspace_owner(workspace_id, auth.uid()))')
      expect(policy).toContain("(SELECT public.workspace_member_role(workspace_id, auth.uid())) = 'admin'")
    })

    it('workspace_invitations_select is owner/admin only, never the invited address', () => {
      const policy = sql.slice(
        sql.indexOf('CREATE POLICY "workspace_invitations_select"'),
        sql.indexOf('-- ─── (h)')
      )
      expect(policy).toContain('(SELECT public.is_workspace_owner(workspace_id, auth.uid()))')
      expect(policy).toContain("(SELECT public.workspace_member_role(workspace_id, auth.uid())) = 'admin'")
      expect(policy).not.toMatch(/email\s*=\s*\(SELECT/)
      expect(policy).not.toMatch(/auth\.(jwt|email)/)
    })
  })

  // ══ D-13: never-zero-owners ════════════════════════════════════════════
  describe('the owner floor is enforced by the database (D-13)', () => {
    it('declares guard_workspace_never_zero_owners as a BEFORE trigger on workspace_members', () => {
      const trigger = normalizeWhitespace(
        sql.slice(sql.indexOf('CREATE TRIGGER guard_workspace_never_zero_owners'))
      )
      expect(trigger).toContain('BEFORE DELETE OR UPDATE ON public.workspace_members')
      expect(trigger).toContain('FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_never_zero_owners();')
    })

    it('the RAISE EXCEPTION text is byte-identical to WORKSPACE_OWNER_FLOOR_MESSAGE', () => {
      expect(sql).toContain(`RAISE EXCEPTION '${WORKSPACE_OWNER_FLOOR_MESSAGE}'`)
    })

    it('raises with ERRCODE insufficient_privilege', () => {
      const block = sql.slice(
        sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_workspace_never_zero_owners'),
        sql.indexOf('\n$$;', sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_workspace_never_zero_owners'))
      )
      expect(normalizeWhitespace(block)).toMatch(/USING ERRCODE = 'insufficient_privilege'/)
    })

    it('is declared SECURITY DEFINER with an empty search path and is revoke-only (trigger-internal)', () => {
      const block = normalizeWhitespace(
        sql.slice(
          sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_workspace_never_zero_owners'),
          sql.indexOf(
            '\n$$;',
            sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_workspace_never_zero_owners')
          )
        )
      )
      expect(block).toContain('RETURNS TRIGGER')
      expect(block).toContain('LANGUAGE plpgsql SECURITY DEFINER')
      expect(block).toContain("SET search_path = ''")
      expect(sql).toContain(
        'REVOKE EXECUTE ON FUNCTION public.guard_workspace_never_zero_owners() FROM PUBLIC, anon, authenticated;'
      )
    })
  })

  // ══ D-22: dual-identity audit rows ═════════════════════════════════════
  describe('workspace_audit_log carries both actor and subject identity (D-22)', () => {
    it('declares both actor_user_id and subject_member_id columns', () => {
      const block = normalizeWhitespace(
        sql.slice(
          sql.indexOf('CREATE TABLE public.workspace_audit_log'),
          sql.indexOf('CREATE INDEX idx_workspace_audit_log_workspace')
        )
      )
      expect(block).toContain('actor_user_id UUID NOT NULL REFERENCES auth.users')
      expect(block).toContain('subject_member_id UUID REFERENCES auth.users ON DELETE SET NULL')
    })
  })

  // ══ Negative assertions — nothing pre-existing touched ═════════════════
  describe('negative assertions — additive only, nothing pre-existing perturbed', () => {
    it('never references handle_new_user (D-03, D-53 — no auto-provisioned workspace)', () => {
      expect(sql).not.toMatch(/handle_new_user/)
    })

    it('never uses uuid_generate_v4', () => {
      expect(sql).not.toContain('uuid_generate_v4')
    })

    it('never disables row level security', () => {
      expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i)
    })

    it('never drops a policy (nothing pre-existing is being rewritten here)', () => {
      expect(sql).not.toMatch(/DROP POLICY/i)
    })

    it('never touches vault_projects', () => {
      expect(sql).not.toMatch(/ALTER TABLE public\.vault_projects/i)
    })

    it('never redefines find_auth_user_id_by_email (already live from migration 177)', () => {
      expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.find_auth_user_id_by_email/)
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

    it('documents the 182 numbering and the 187/188 reservation for Phase 38.2', () => {
      expect(migration).toContain('182')
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
