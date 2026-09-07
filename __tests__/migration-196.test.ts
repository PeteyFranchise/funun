import { readFileSync } from 'fs'
import path from 'path'

// ─── migration 196 — the custody exemption migration 139 assumed it had ────
// Text-lock + structural test, in the established style of
// __tests__/migration-190.test.ts. This project's migrations are
// human-gated: an agent never pushes them, so this file IS the pre-push
// review evidence for migration 196.
//
// LIMITATION, STATED UP FRONT: a text-lock test proves what the SQL SAYS.
// It CANNOT prove the trigger behaves this way in a live Postgres — this
// repo has no live-Postgres test harness. That limitation is exactly how
// the bug 196 fixes reached production: migration 190's suite is green,
// its function exists, and the route calls it correctly, yet the sanctioned
// custody RPC still raised 42501 because a SECOND, differently-named
// trigger (migration 139's guard_owner_immutable) also fires on
// vault_projects and refused it. The behavioural proof for 196 is the
// owner-run custody transfer after push, not this suite.

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/196_owner_immutable_guard_custody_exemption.sql'),
  'utf8'
)

// Executable SQL only, with `--` comment lines stripped, so "the migration
// does not do X" assertions cannot be defeated (or falsely tripped) by
// prose. Mirrors migration-190's pattern.
const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

// The header prose, de-wrapped: `--` markers removed and whitespace
// collapsed to single spaces, so header assertions test what the header
// SAYS rather than where its 79-column line breaks happen to fall.
const prose = normalizeWhitespace(
  migration
    .split('\n')
    .filter((line) => line.trimStart().startsWith('--'))
    .map((line) => line.trimStart().replace(/^--\s?/, ''))
    .join(' ')
)

// `sql` above still contains the COMMENT ON FUNCTION statement, whose
// string literal quotes migration 139's prose verbatim -- including the
// phrase "passes WITH CHECK against the value they just wrote". That is
// documentation inside a string, not a clause this migration executes, so
// the "no policy / no check clause" assertions below run against a view
// with that one statement removed. Everything else stays in scope.
const executable = sql.replace(/COMMENT ON FUNCTION[\s\S]*?';\n/, '')

const FUNCTION_HEADER = 'CREATE OR REPLACE FUNCTION public.guard_owner_immutable()'

function guardBlock(): string {
  const start = sql.indexOf(FUNCTION_HEADER)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf('\n$$;', start)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('migration 196 — guard_owner_immutable gains a vault_projects-only custody exemption', () => {
  // ══ The replaced guard function ══════════════════════════════════════
  describe('guard_owner_immutable — replaced in place, signature unchanged', () => {
    it('is replaced with CREATE OR REPLACE FUNCTION, exactly once', () => {
      expect(sql).toContain(FUNCTION_HEADER)
      const matches = sql.match(/CREATE OR REPLACE FUNCTION/g) ?? []
      expect(matches).toHaveLength(1)
    })

    it('keeps RETURNS TRIGGER, plain LANGUAGE plpgsql, and an empty search path', () => {
      const block = normalizeWhitespace(guardBlock())
      expect(block).toContain('RETURNS TRIGGER')
      expect(block).toContain('LANGUAGE plpgsql')
      expect(block).toContain("SET search_path = ''")
      // NOT SECURITY DEFINER — it tests current_user itself; elevating it
      // would make that read meaningless (migration 139's posture, and
      // migration 190's identical reasoning for its own guard).
      expect(block).not.toContain('SECURITY DEFINER')
    })

    it('still compares NEW.user_id to OLD.user_id with IS DISTINCT FROM', () => {
      expect(guardBlock()).toMatch(/NEW\.user_id\s+IS\s+DISTINCT\s+FROM\s+OLD\.user_id/)
    })

    it('raises the unchanged insufficient_privilege exception when the guard trips', () => {
      const block = guardBlock()
      expect(block).toContain('RAISE EXCEPTION')
      expect(block).toContain(
        "RAISE EXCEPTION 'ownership is immutable; user_id cannot be changed by update'"
      )
      expect(block).toContain("USING ERRCODE = 'insufficient_privilege'")
    })
  })

  // ══ THE POINT OF THIS MIGRATION: the exemption, and its scoping ══════
  describe('the exemption is scoped to vault_projects by TG_TABLE_NAME', () => {
    it('locks the exact guard condition, including the TG_TABLE_NAME conjunct', () => {
      // The tightest lock available: the whole condition, verbatim. A
      // future edit that drops the TG_TABLE_NAME conjunct (widening the
      // exemption to public.works), flips AND to OR, or drops the NOT
      // (inverting the guard) fails HERE, loudly, rather than silently
      // shipping a weakened guard on a table with no transfer path.
      expect(normalizeWhitespace(guardBlock())).toContain(
        "IF NEW.user_id IS DISTINCT FROM OLD.user_id AND NOT (TG_TABLE_NAME = 'vault_projects' AND current_user IN ('postgres')) THEN"
      )
    })

    it('references TG_TABLE_NAME in the guard condition at all', () => {
      // Stated separately from the verbatim lock so the failure message
      // names the missing mechanism when the condition is rewritten.
      expect(guardBlock()).toMatch(/TG_TABLE_NAME/)
    })

    it("compares TG_TABLE_NAME to exactly one table literal, 'vault_projects'", () => {
      const block = guardBlock()
      const tables = [...block.matchAll(/TG_TABLE_NAME\s*=\s*'([a-z_]+)'/g)].map((m) => m[1])
      expect(tables).toEqual(['vault_projects'])
      // No IN-list form either — that would be a second way to widen the
      // table scope without tripping the equality assertion above.
      expect(block).not.toMatch(/TG_TABLE_NAME\s+IN\s*\(/i)
      // No inequality form — `TG_TABLE_NAME <> 'works'` would exempt
      // vault_projects AND every future table this shared function is
      // ever attached to.
      expect(block).not.toMatch(/TG_TABLE_NAME\s*(<>|!=)/)
    })

    it('never names works inside the guard function body — works has NO exemption', () => {
      // public.works keeps the absolute guard: no sanctioned transfer path
      // exists for it, so its ownership stays immutable to everyone,
      // superuser included. The function body must not mention it in any
      // form, in any comparison.
      const block = guardBlock()
      expect(block).not.toMatch(/'works'/)
      expect(block).not.toMatch(/\bworks\b/)
    })

    it('exempts exactly one role literal, postgres, matching migration 190 verbatim', () => {
      const block = guardBlock()
      const match = block.match(/current_user\s+IN\s*\(([^)]*)\)/)
      expect(match).not.toBeNull()
      const roleList = match ? match[1] : ''
      expect(roleList.trim().length).toBeGreaterThan(0)
      const entries = roleList.split(',').map((entry) => entry.trim())
      for (const entry of entries) {
        expect(entry).toMatch(/^'[a-z_]+'$/)
      }
      // D-PF-01 (resolved 2026-09-06): the database superuser role
      // confirmed by 38.0.1-PREFLIGHT.md P1, and the SECURITY DEFINER
      // owner of transfer_vault_project_custody().
      expect(entries).toEqual(["'postgres'"])
    })

    it('does NOT use a role allow-list naming service_role, authenticated or anon', () => {
      // D-PF-01's binding rejection, inherited from migration 190: the
      // exemption must not be "permit service_role" or "block
      // authenticated/anon". Only 'postgres' may appear as a current_user
      // comparison target.
      const block = guardBlock()
      expect(block).not.toMatch(/current_user[^;]*'service_role'/)
      expect(block).not.toMatch(/current_user[^;]*'authenticated'/)
      expect(block).not.toMatch(/current_user[^;]*'anon'/)
    })
  })

  // ══ Negative structural guarantees ═══════════════════════════════════
  describe('function body only — neither of migration 139 triggers is touched', () => {
    it('creates no trigger and drops no trigger', () => {
      // Both of migration 139's triggers (on public.works and on
      // public.vault_projects) must keep firing, unchanged. Only the
      // shared body they call is replaced.
      expect(sql).not.toMatch(/CREATE TRIGGER/i)
      expect(sql).not.toMatch(/DROP TRIGGER/i)
      expect(sql).not.toMatch(/ALTER TRIGGER/i)
      expect(sql).not.toMatch(/DISABLE TRIGGER/i)
    })

    it('creates or drops no policy, and contains no WITH CHECK clause', () => {
      expect(sql).not.toMatch(/CREATE POLICY/i)
      expect(sql).not.toMatch(/DROP POLICY/i)
      // See `executable` above: the only WITH CHECK in this file is inside
      // the COMMENT string literal, quoting migration 139 verbatim.
      expect(executable).not.toMatch(/WITH CHECK/i)
      expect(executable).not.toMatch(/COMMENT ON FUNCTION/)
      expect(guardBlock()).not.toMatch(/WITH CHECK/i)
    })

    it('never alters a table or disables row level security', () => {
      expect(sql).not.toMatch(/ALTER TABLE/i)
      expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i)
    })

    it('issues no DML and no DDL against public.works', () => {
      expect(sql).not.toMatch(/(UPDATE|INSERT INTO|DELETE FROM|GRANT[^;]*ON)\s+(public\.)?works/i)
    })

    it('does not redefine migration 190 guard or transfer function', () => {
      expect(sql).not.toContain('guard_vault_projects_user_id_immutable()')
      expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.transfer_vault_project_custody/)
    })

    it('restates the trigger-internal REVOKE, since CREATE OR REPLACE preserves grants', () => {
      expect(sql).toContain(
        'REVOKE EXECUTE ON FUNCTION public.guard_owner_immutable()\n  FROM PUBLIC, anon, authenticated;'
      )
      expect(sql).not.toMatch(/REVOKE[^;]*service_role/)
    })

    it('never uses uuid_generate_v4', () => {
      expect(sql).not.toContain('uuid_generate_v4')
    })
  })

  // ══ Header requirements ══════════════════════════════════════════════
  describe('header documents the production bug, the root cause, and the scoping', () => {
    it('warns that supabase db push must never be run by an executor agent', () => {
      expect(prose).toMatch(/HUMAN-GATED/)
      expect(prose).toMatch(/never runs.*supabase db push/)
    })

    it('records that this is a production bug found by behavioural verification, dated', () => {
      expect(prose).toMatch(/production/i)
      expect(prose).toMatch(/behavioural verification/)
      expect(prose).toMatch(/2026-09-07/)
      expect(prose).toMatch(/42501/)
      expect(prose).toMatch(/ownership is immutable; user_id cannot be changed by update/)
    })

    it('names migration 139 as the root cause and corrects its SECURITY DEFINER claim', () => {
      expect(prose).toMatch(/139/)
      expect(prose).toMatch(/root cause/i)
      // Quotes the wrong claim, then rebuts it.
      expect(prose).toContain(
        'a SECURITY DEFINER function owned by the table owner, which this trigger does not fire against'
      )
      expect(prose).toMatch(/does NOT bypass triggers/)
      expect(prose).toMatch(/fires on an UPDATE issued inside a SECURITY DEFINER function/i)
    })

    it('records that works deliberately keeps the absolute guard', () => {
      expect(prose).toContain('public.works DELIBERATELY KEEPS THE ABSOLUTE GUARD')
      expect(prose).toMatch(/no sanctioned ownership-transfer path for works/i)
      expect(prose).toMatch(/works\.user_id stays immutable to EVERYONE/)
    })

    it('explains the exemption is structural, not a role allow-list, citing D-PF-01 and 190', () => {
      expect(prose).toMatch(/D-PF-01/)
      expect(prose).toMatch(/STRUCTURAL EXEMPTION, NOT A ROLE ALLOW-LIST/)
      expect(prose).toMatch(/transfer_vault_project_custody/)
      expect(prose).toMatch(/190/)
      expect(prose).toMatch(/only this one function's execution context, and only on this one table/)
    })

    it('documents the renumbering: 196 taken, 38.0.2 to 197-198, 38.2 to 199-200', () => {
      expect(prose).toMatch(/196/)
      expect(prose).toMatch(/38\.0\.2 shifts to 197-198/)
      expect(prose).toMatch(/38\.2 to 199-200/)
      expect(prose).toMatch(/\.planning\/ROADMAP\.md is the authoritative record/)
      // 191/192/193 are text-locked and deliberately not edited.
      expect(prose).toMatch(/191, 192 and 193/)
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
