import { readFileSync } from 'fs'
import path from 'path'

// ─── migration 190 — vault_projects.user_id immutability (F3 pre-existing ──
//                     half; R-17 / WSR-25)
// Text-lock + structural test, in the established style of
// __tests__/migration-187.test.ts. This project's migrations are
// human-gated: an agent never pushes them, so this file IS the pre-push
// review evidence for migration 190.
//
// LIMITATION, STATED UP FRONT: a text-lock test proves what the SQL SAYS.
// It CANNOT prove that the trigger FIRES in a live Postgres — this repo has
// no live-Postgres test harness (38.0.1-VALIDATION.md's opening section).
// The behavioural proof — that all three ordinary caller classes are
// actually rejected with insufficient_privilege, and that a real two-sided
// custody transfer still succeeds end to end — is the owner-run check in
// this plan's Task 3 blocking checkpoint, not this suite. A green Jest run
// here is evidence the SQL is well-formed and structurally sound; it is not
// evidence the trigger works in production.

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/190_vault_projects_user_id_immutable.sql'),
  'utf8'
)

// Executable SQL only, with `--` comment lines stripped, so "the migration
// does not do X" assertions cannot be defeated (or falsely tripped) by
// prose. Mirrors migration-187's pattern.
const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function extractBlock(startMarker: string, endMarker = '\n$$;'): string {
  const start = sql.indexOf(startMarker)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf(endMarker, start)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('migration 190 — vault_projects.user_id immutable to ordinary traffic', () => {
  // ══ The guard trigger function ═══════════════════════════════════════
  describe('guard_vault_projects_user_id_immutable — the BEFORE UPDATE guard', () => {
    it('is created with CREATE OR REPLACE FUNCTION', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.guard_vault_projects_user_id_immutable()')
    })

    it('is declared RETURNS TRIGGER, plain LANGUAGE plpgsql, with an empty search path', () => {
      const block = normalizeWhitespace(
        extractBlock('CREATE OR REPLACE FUNCTION public.guard_vault_projects_user_id_immutable()')
      )
      expect(block).toContain('RETURNS TRIGGER')
      expect(block).toContain('LANGUAGE plpgsql')
      expect(block).toContain("SET search_path = ''")
      // NOT SECURITY DEFINER — it tests current_user itself; elevating it
      // would make that read meaningless (mirrors migration 187's guard).
      expect(block).not.toContain('SECURITY DEFINER')
    })

    it('compares NEW.user_id to OLD.user_id with IS DISTINCT FROM', () => {
      const block = extractBlock('CREATE OR REPLACE FUNCTION public.guard_vault_projects_user_id_immutable()')
      expect(block).toMatch(/NEW\.user_id\s+IS\s+DISTINCT\s+FROM\s+OLD\.user_id/)
    })

    it('raises insufficient_privilege naming the D-29 two-sided flow', () => {
      const block = extractBlock('CREATE OR REPLACE FUNCTION public.guard_vault_projects_user_id_immutable()')
      expect(block).toContain('RAISE EXCEPTION')
      expect(block).toContain("USING ERRCODE = 'insufficient_privilege'")
      expect(block).toMatch(/two-sided custody-transfer flow/)
      expect(block).toMatch(/D-29/)
    })

    it('exempts exactly one role literal, postgres, via a non-empty current_user NOT IN (...) construct', () => {
      // Structural guard against a future edit accidentally emptying or
      // widening the exemption to a bare boolean (e.g. `current_user IS NOT
      // NULL`, which would refuse nothing, or an empty `NOT IN ()`, which
      // would refuse everything including the legitimate transfer path).
      const block = extractBlock('CREATE OR REPLACE FUNCTION public.guard_vault_projects_user_id_immutable()')
      const match = block.match(/current_user\s+NOT\s+IN\s*\(([^)]*)\)/)
      expect(match).not.toBeNull()
      const roleList = match ? match[1] : ''
      // Non-empty, and every entry is a single-quoted string literal.
      expect(roleList.trim().length).toBeGreaterThan(0)
      const entries = roleList.split(',').map((entry) => entry.trim())
      expect(entries.length).toBeGreaterThan(0)
      for (const entry of entries) {
        expect(entry).toMatch(/^'[a-z_]+'$/)
      }
      // The exemption identity matches D-PF-01 (resolved 2026-09-06): the
      // database superuser role confirmed by 38.0.1-PREFLIGHT.md P1.
      expect(entries).toEqual(["'postgres'"])
    })

    it('does NOT use a role allow-list naming service_role, authenticated or anon directly in the guard condition', () => {
      // D-PF-01's binding rejection: the exemption must not be "permit
      // service_role" or "block authenticated/anon" — see this migration's
      // header. The guard function body must name none of those three role
      // literals; only 'postgres' (asserted above) may appear as a
      // current_user comparison target.
      const block = extractBlock('CREATE OR REPLACE FUNCTION public.guard_vault_projects_user_id_immutable()')
      expect(block).not.toMatch(/current_user[^;]*'service_role'/)
      expect(block).not.toMatch(/current_user[^;]*'authenticated'/)
      expect(block).not.toMatch(/current_user[^;]*'anon'/)
    })
  })

  // ══ The trigger itself ═══════════════════════════════════════════════
  describe('trg_guard_vault_projects_user_id_immutable — BEFORE UPDATE, FOR EACH ROW', () => {
    it('is idempotent: DROP TRIGGER IF EXISTS then CREATE TRIGGER', () => {
      const dropIndex = sql.indexOf(
        'DROP TRIGGER IF EXISTS trg_guard_vault_projects_user_id_immutable ON public.vault_projects;'
      )
      const createIndex = sql.indexOf('CREATE TRIGGER trg_guard_vault_projects_user_id_immutable')
      expect(dropIndex).toBeGreaterThanOrEqual(0)
      expect(createIndex).toBeGreaterThan(dropIndex)
    })

    it('fires BEFORE UPDATE ON public.vault_projects, FOR EACH ROW', () => {
      const createIndex = sql.indexOf('CREATE TRIGGER trg_guard_vault_projects_user_id_immutable')
      const triggerBlock = normalizeWhitespace(sql.slice(createIndex, sql.indexOf('NOTIFY pgrst')))
      expect(triggerBlock).toContain(
        'CREATE TRIGGER trg_guard_vault_projects_user_id_immutable BEFORE UPDATE ON public.vault_projects'
      )
      expect(triggerBlock).toContain('FOR EACH ROW')
      expect(triggerBlock).toContain(
        'EXECUTE FUNCTION public.guard_vault_projects_user_id_immutable()'
      )
    })

    it('revokes EXECUTE on the guard function from PUBLIC, anon and authenticated', () => {
      expect(sql).toContain(
        'REVOKE EXECUTE ON FUNCTION public.guard_vault_projects_user_id_immutable()\n  FROM PUBLIC, anon, authenticated;'
      )
    })
  })

  // ══ The structural exemption function ═══════════════════════════════
  describe('transfer_vault_project_custody — the SECURITY DEFINER exemption path', () => {
    it('is created with CREATE OR REPLACE FUNCTION, RETURNS UUID', () => {
      expect(sql).toContain(
        'CREATE OR REPLACE FUNCTION public.transfer_vault_project_custody('
      )
      const block = extractBlock('CREATE OR REPLACE FUNCTION public.transfer_vault_project_custody(')
      expect(block).toMatch(/RETURNS\s+UUID/)
    })

    it('IS SECURITY DEFINER with an empty search path — this is what makes the exemption structural', () => {
      const block = normalizeWhitespace(
        extractBlock('CREATE OR REPLACE FUNCTION public.transfer_vault_project_custody(')
      )
      expect(block).toContain('SECURITY DEFINER')
      expect(block).toContain("SET search_path = ''")
      expect(block).toContain('LANGUAGE plpgsql')
    })

    it('performs the update filtered by both project id and the current custodian (stale-custodian guard)', () => {
      const block = extractBlock('CREATE OR REPLACE FUNCTION public.transfer_vault_project_custody(')
      expect(block).toMatch(/UPDATE\s+public\.vault_projects/)
      expect(block).toMatch(/SET\s+user_id\s*=\s*p_to_user_id/)
      expect(block).toMatch(/WHERE\s+id\s*=\s*p_project_id/)
      expect(block).toMatch(/AND\s+user_id\s*=\s*p_from_user_id/)
      expect(block).toMatch(/RETURNING\s+id\s+INTO\s+v_updated_id/)
    })

    it('revokes EXECUTE from PUBLIC, anon and authenticated (service_role keeps its default grant)', () => {
      expect(sql).toContain(
        'REVOKE EXECUTE ON FUNCTION public.transfer_vault_project_custody(UUID, UUID, UUID)\n  FROM PUBLIC, anon, authenticated;'
      )
      // Deliberately does NOT revoke from service_role — see 38.0.1-
      // PREFLIGHT.md S1: REVOKE ... FROM PUBLIC alone never touches
      // service_role's directly-granted privileges, and the boundary here
      // is "did the call go through this function", not "which role
      // connected".
      expect(sql).not.toMatch(/REVOKE[^;]*service_role/)
    })
  })

  // ══ Negative structural guarantees ═══════════════════════════════════
  describe('additive only — no policy, no check clause, no other table', () => {
    it('creates or drops no policy anywhere in the file', () => {
      expect(sql).not.toMatch(/CREATE POLICY/i)
      expect(sql).not.toMatch(/DROP POLICY/i)
    })

    it('contains no WITH CHECK clause anywhere in the file', () => {
      expect(sql).not.toMatch(/WITH CHECK/i)
    })

    it('never disables row level security or alters any table', () => {
      expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i)
      expect(sql).not.toMatch(/ALTER TABLE/i)
    })

    it('creates exactly two functions and one trigger', () => {
      const functionMatches = sql.match(/CREATE OR REPLACE FUNCTION/g) ?? []
      expect(functionMatches).toHaveLength(2)
      const triggerMatches = sql.match(/CREATE TRIGGER/g) ?? []
      expect(triggerMatches).toHaveLength(1)
    })

    it('names no table other than public.vault_projects', () => {
      expect(sql).not.toMatch(/\btracks\b/)
      expect(sql).not.toMatch(/vault_assets/)
      expect(sql).not.toMatch(/vault_documents/)
      expect(sql).not.toMatch(/tool_outputs/)
      expect(sql).not.toMatch(/project_members/)
      expect(sql).not.toMatch(/workspace_custody_transfers/)
      expect(sql).not.toMatch(/capability_grants/)
    })
  })

  // ══ Housekeeping ═════════════════════════════════════════════════════
  describe('housekeeping', () => {
    it('warns that supabase db push must never be run by an executor agent', () => {
      expect(migration).toMatch(/HUMAN-GATED/)
      expect(migration).toMatch(/never runs.*supabase db push/)
    })

    it('documents the migration numbering (188/189 already claimed elsewhere, this phase now 191-194)', () => {
      expect(migration).toContain('190')
      expect(migration).toContain('188')
      expect(migration).toContain('189')
      expect(migration).toContain('191-194')
    })

    it('documents the D-PF-01 structural-exemption decision and rejects a role allow-list', () => {
      expect(migration).toMatch(/D-PF-01/)
      expect(migration).toMatch(/STRUCTURAL/)
      expect(migration).toMatch(/role allow-list/)
    })

    it('documents the required companion change to the custody-transfers route as a pre-push condition', () => {
      expect(migration).toMatch(/COMPANION APPLICATION CHANGE/)
      expect(migration).toMatch(/app\/api\/vault\/custody-transfers\/route\.ts/)
      expect(migration).toMatch(/transfer_vault_project_custody/)
    })

    it('cites the PostgreSQL WITH CHECK / OLD-NEW limitation', () => {
      expect(migration).toMatch(/postgresql\.org\/message-id\/20151216231504\.GJ26804/)
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
