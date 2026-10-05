import fs from 'fs'
import path from 'path'
import { readdirSync } from 'fs'

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase/migrations/231_tracks_work_id_trigger_lockdown.sql'
)
const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')

/**
 * Strips `--` line comments, respecting single-quoted string literals (this
 * repo's COMMENT ON bodies are full of prose dashes). Mirrors
 * __tests__/rls-helper-callsites.test.ts's own stripLineComments so this
 * file's "does it actually DO the thing" assertions check executable SQL,
 * not this migration's own header prose explaining what the broken 230
 * statement looked like or why current_user would have been wrong.
 */
function stripLineComments(fileSql: string): string {
  return fileSql
    .split('\n')
    .map((line) => {
      let inString = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === "'") {
          inString = !inString
          continue
        }
        if (!inString && ch === '-' && line[i + 1] === '-') {
          return line.slice(0, i)
        }
      }
      return line
    })
    .join('\n')
}

const code = stripLineComments(sql)

// ─── WHAT THIS FILE PROVES, AND WHAT IT DOES NOT ──────────────────────────
//
// This file proves the SQL in migration 231 was WRITTEN with the intended
// guard: the right function shape, the right role check, the right trigger
// attachment, and no repeat of migration 230's grant-dance. It does NOT and
// CANNOT prove Postgres ENFORCES any of it -- migration 230 shipped a
// passing text-lock test (__tests__/migration-230-track-work-direct-link.
// test.ts:22-24, a single `toContain` on the REVOKE line) on SQL that
// enforced nothing in production. A text assertion cannot distinguish a
// REVOKE that works from one that is a silent no-op; only a live database
// can. The actual proof for migration 231 is the OWNER-RUN BEHAVIORAL
// VERIFICATION block embedded in the migration file's own trailing comment
// (asserted present below, in the last test) -- to be run by hand, once,
// after the owner pushes this migration. No database connection (local or
// production) is reachable from this test's environment.

describe('migration 231 — tracks.work_id trigger lockdown', () => {
  it('defines tracks_guard_work_id_write() returning TRIGGER, checking both INSERT and UPDATE changes to work_id', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.tracks_guard_work_id_write\(\)\s*\nRETURNS TRIGGER/
    )
    expect(sql).toContain("TG_OP = 'INSERT' AND NEW.work_id IS NOT NULL")
    expect(sql).toContain("TG_OP = 'UPDATE' AND NEW.work_id IS DISTINCT FROM OLD.work_id")
  })

  it('gates on auth.role() / service_role, and does NOT gate on current_user -- the specific mistake this fix rules out', () => {
    expect(sql).toMatch(/\(SELECT auth\.role\(\)\)/)
    expect(sql).toContain("v_role = 'service_role'")
    // Checked against comment-stripped code, not raw text: the header
    // deliberately NAMES current_user = 'service_role' as the anti-pattern
    // this migration avoids, in prose. The guard's actual executable body
    // must never contain that comparison.
    expect(code).not.toMatch(/current_user\s*=\s*'service_role'/)
  })

  it('treats a NULL role (direct database session) as privileged, alongside service_role', () => {
    expect(sql).toMatch(/v_privileged[\s\S]{0,80}v_role IS NULL OR v_role = 'service_role'/)
  })

  it('raises with RAISE EXCEPTION and ERRCODE 42501 when a non-privileged caller changes work_id', () => {
    expect(sql).toMatch(/RAISE EXCEPTION[\s\S]{0,200}USING ERRCODE = '42501'/)
  })

  it('attaches the trigger BEFORE INSERT OR UPDATE ON public.tracks FOR EACH ROW', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER tracks_guard_work_id_write\s*\n\s*BEFORE INSERT OR UPDATE ON public\.tracks\s*\n\s*FOR EACH ROW\s*\n\s*EXECUTE FUNCTION public\.tracks_guard_work_id_write\(\)/
    )
  })

  it('drops any prior version of the trigger before recreating it (idempotent re-apply)', () => {
    expect(sql).toContain('DROP TRIGGER IF EXISTS tracks_guard_work_id_write ON public.tracks')
  })

  it('does not repeat migration 230s grant-dance -- no GRANT/REVOKE statement naming work_id anywhere in this file', () => {
    // Checked against comment-stripped code: the header deliberately quotes
    // migration 230's broken `REVOKE INSERT (work_id), UPDATE (work_id)`
    // statement verbatim, in prose, to explain what this migration replaces.
    // That quotation must not be mistaken for this file reissuing it.
    expect(code).not.toMatch(/REVOKE[^;]*work_id/i)
    expect(code).not.toMatch(/GRANT[^;]*work_id/i)
  })

  it('does not touch graduate_song_passport_to_release -- confirms this fix changes nothing migration 230 already shipped', () => {
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.graduate_song_passport_to_release')
  })

  it('is SECURITY INVOKER, not SECURITY DEFINER, for the guard function', () => {
    const fnMatch = sql.match(
      /CREATE OR REPLACE FUNCTION public\.tracks_guard_work_id_write\(\)[\s\S]*?AS \$\$/
    )
    expect(fnMatch).not.toBeNull()
    const header = fnMatch?.[0] ?? ''
    expect(header).toMatch(/SECURITY INVOKER/)
    expect(header).not.toMatch(/SECURITY DEFINER/)
  })

  it('carries the owner-run behavioral verification block, referencing both information_schema.column_privileges and request.jwt.claims', () => {
    expect(sql).toMatch(/OWNER-RUN BEHAVIORAL VERIFICATION/)
    expect(sql).toContain('information_schema.column_privileges')
    expect(sql).toContain('request.jwt.claims')
    // The probe itself must be structured to leave no trace.
    expect(sql).toMatch(/BEGIN;[\s\S]*SAVEPOINT probe_1;[\s\S]*ROLLBACK TO SAVEPOINT probe_1;[\s\S]*ROLLBACK;/)
  })

  it('ends with a schema-cache reload before the trailing comment block', () => {
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema';/)
  })
})

// ─── Standing corpus invariant ─────────────────────────────────────────────
//
// Guards against a future migration quietly dropping this trigger without
// replacing it. Reuses the same stripLineComments defined above (respecting
// single-quoted string literals, since this repo's COMMENT ON bodies are
// full of prose dashes), the same discipline
// __tests__/rls-helper-callsites.test.ts already establishes for this
// corpus.

describe('migration 231 — standing corpus invariant', () => {
  it('the trigger is created at least as many times as it is dropped, across every migration', () => {
    const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations')
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))

    let createCount = 0
    let dropCount = 0

    for (const file of files) {
      const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      const stripped = stripLineComments(raw)
      createCount += (stripped.match(/CREATE (OR REPLACE )?TRIGGER tracks_guard_work_id_write/g) ?? []).length
      dropCount += (stripped.match(/DROP TRIGGER[^;]*tracks_guard_work_id_write/g) ?? []).length
    }

    expect(createCount).toBeGreaterThan(0)
    expect(createCount).toBeGreaterThanOrEqual(dropCount)
  })
})
