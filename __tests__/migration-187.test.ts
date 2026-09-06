import { readFileSync } from 'fs'
import path from 'path'

// ─── migration 187 — F1 hotfix: custody offer requires the current holder ──
// Text-lock + structural test, in the established style of
// __tests__/migration-185.test.ts and __tests__/migration-186.test.ts. This
// project's migrations are human-gated: an agent never pushes them, so this
// file IS the pre-push review evidence that migration 187 independently
// closes the same hole lib/workspaces/custody-transfer.ts's assertMayOffer
// closes at the application layer (Codex adversarial review 2026-09-06,
// finding F1) — defence in depth, not a single point of failure.

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/187_custody_offer_requires_current_holder.sql'),
  'utf8'
)

// Executable SQL only, with `--` comment lines stripped, so "the migration
// does not do X" assertions cannot be defeated (or falsely tripped) by
// prose. Mirrors migration-185's / migration-186's pattern.
const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

describe('migration 187 — custody offer requires the current holder (F1 hotfix)', () => {
  // ══ The guard itself ═════════════════════════════════════════════════
  describe('guard_custody_transfer_offered_by_holder — replaced, not merely altered', () => {
    it('REPLACEs the function migration 185 created (CREATE OR REPLACE, not CREATE)', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.guard_custody_transfer_offered_by_holder()')
      expect(sql).not.toMatch(/CREATE FUNCTION public\.guard_custody_transfer_offered_by_holder/)
    })

    it('is declared RETURNS TRIGGER, plain LANGUAGE plpgsql, with an empty search path', () => {
      const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_custody_transfer_offered_by_holder()')
      const end = sql.indexOf('\n$$;', start)
      const block = normalizeWhitespace(sql.slice(start, end))
      expect(block).toContain('RETURNS TRIGGER')
      expect(block).toContain('LANGUAGE plpgsql')
      expect(block).toContain("SET search_path = ''")
      // NOT SECURITY DEFINER — matches migration 185's own posture: the
      // only role that can ever reach this trigger is service_role, since
      // migration 185 section (c) already revokes every client INSERT
      // path on this table.
      expect(block).not.toContain('SECURITY DEFINER')
    })

    it('reads the custodian live from vault_projects.user_id at insert time', () => {
      const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_custody_transfer_offered_by_holder()')
      const end = sql.indexOf('\n$$;', start)
      const block = sql.slice(start, end)
      expect(block).toMatch(/SELECT\s+user_id\s+INTO\s+v_custodian_id/)
      expect(block).toMatch(/FROM\s+public\.vault_projects/)
      expect(block).toMatch(/WHERE\s+id\s*=\s*NEW\.project_id/)
    })

    it('requires BOTH offered_by and from_user_id to equal the current custodian', () => {
      const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_custody_transfer_offered_by_holder()')
      const end = sql.indexOf('\n$$;', start)
      const block = normalizeWhitespace(sql.slice(start, end))
      expect(block).toContain('NEW.offered_by <> v_custodian_id')
      expect(block).toContain('NEW.from_user_id <> v_custodian_id')
      expect(block).toContain('v_custodian_id IS NULL')
    })

    it('raises insufficient_privilege naming the rule', () => {
      const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_custody_transfer_offered_by_holder()')
      const end = sql.indexOf('\n$$;', start)
      const block = sql.slice(start, end)
      expect(block).toContain("USING ERRCODE = 'insufficient_privilege'")
      expect(block).toMatch(/current custodian/)
      expect(block).toMatch(/two-sided, never unilateral/)
    })

    it('removes the workspace owner/admin exception entirely — no workspace_member_role call survives', () => {
      const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_custody_transfer_offered_by_holder()')
      const end = sql.indexOf('\n$$;', start)
      const block = sql.slice(start, end)
      expect(block).not.toMatch(/workspace_member_role/)
      expect(block).not.toMatch(/NEW\.workspace_id/)
      expect(block).not.toMatch(/'owner'/)
      expect(block).not.toMatch(/'admin'/)
    })

    it('is idempotent: DROP TRIGGER IF EXISTS then CREATE TRIGGER, matching migrations 182-186', () => {
      const dropIndex = sql.indexOf(
        'DROP TRIGGER IF EXISTS guard_custody_transfer_offered_by_holder ON public.workspace_custody_transfers;'
      )
      const createIndex = sql.indexOf('CREATE TRIGGER guard_custody_transfer_offered_by_holder')
      expect(dropIndex).toBeGreaterThanOrEqual(0)
      expect(createIndex).toBeGreaterThan(dropIndex)

      const triggerBlock = normalizeWhitespace(sql.slice(createIndex, sql.indexOf('NOTIFY pgrst')))
      expect(triggerBlock).toContain(
        'CREATE TRIGGER guard_custody_transfer_offered_by_holder BEFORE INSERT ON public.workspace_custody_transfers'
      )
      expect(triggerBlock).toContain(
        'FOR EACH ROW EXECUTE FUNCTION public.guard_custody_transfer_offered_by_holder()'
      )
    })

    it('revokes EXECUTE from PUBLIC, anon and authenticated (no client can call this directly)', () => {
      expect(sql).toContain(
        'REVOKE EXECUTE ON FUNCTION public.guard_custody_transfer_offered_by_holder()\n  FROM PUBLIC, anon, authenticated;'
      )
    })
  })

  // ══ Additive-only scope guard ════════════════════════════════════════
  describe('additive only — touches nothing but this one trigger function and trigger', () => {
    it('creates no table', () => {
      expect(sql).not.toMatch(/CREATE TABLE/i)
    })

    it('creates or drops no policy', () => {
      expect(sql).not.toMatch(/CREATE POLICY/i)
      expect(sql).not.toMatch(/DROP POLICY/i)
    })

    it('never disables row level security', () => {
      expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i)
    })

    it('never alters any table', () => {
      expect(sql).not.toMatch(/ALTER TABLE/i)
    })

    it('defines exactly one function in this file', () => {
      const matches = sql.match(/CREATE OR REPLACE FUNCTION/g) ?? []
      expect(matches).toHaveLength(1)
    })

    it('never touches vault_projects, tracks, vault_assets, vault_documents, or tool_outputs beyond a plain SELECT', () => {
      // The only reference to vault_projects anywhere in this file is the
      // single read inside the trigger body — assert it appears exactly
      // once and never inside an ALTER/CREATE POLICY/DROP context.
      const vaultProjectsMentions = sql.match(/vault_projects/g) ?? []
      expect(vaultProjectsMentions).toHaveLength(1)
      expect(sql).not.toMatch(/\btracks\b/)
      expect(sql).not.toMatch(/vault_assets/)
      expect(sql).not.toMatch(/vault_documents/)
      expect(sql).not.toMatch(/tool_outputs/)
    })
  })

  // ══ Housekeeping ═════════════════════════════════════════════════════
  describe('housekeeping', () => {
    it('warns that supabase db push must never be run by an executor agent', () => {
      expect(migration).toMatch(/HUMAN-GATED/)
      expect(migration).toMatch(/never runs.*supabase db push/)
    })

    it('documents the 187/188/189-190 renumbering', () => {
      expect(migration).toContain('187')
      expect(migration).toContain('188')
      expect(migration).toContain('189-190')
      expect(migration).toMatch(/pre-existing F3 fix/)
    })

    it('never uses uuid_generate_v4', () => {
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
