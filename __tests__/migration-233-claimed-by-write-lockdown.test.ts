import fs from 'fs'
import path from 'path'
import { readdirSync } from 'fs'

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase/migrations/233_claimed_by_write_lockdown.sql'
)
const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')

/**
 * Strips `--` line comments, respecting single-quoted string literals (this
 * repo's COMMENT ON bodies are full of prose dashes). Mirrors
 * __tests__/migration-231-tracks-work-id-trigger-lockdown.test.ts's own
 * stripLineComments so this file's "does it actually DO the thing"
 * assertions check executable SQL, not this migration's own header prose
 * explaining the defect or why auth.role() alone would be insufficient.
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
// This file proves the SQL in migration 233 was WRITTEN with the intended
// guards: the right function shape, the right role check, the right GUC
// gate, the right trigger attachment, and no repeat of migration 230's
// grant-dance. It does NOT and CANNOT prove Postgres ENFORCES any of it --
// migration 230 shipped a passing text-lock test
// (__tests__/migration-230-track-work-direct-link.test.ts:22-24, a single
// `toContain` on a REVOKE line) on SQL that enforced nothing in production.
// A text assertion cannot distinguish a trigger that works from one that
// does not; only a live database can. The actual proof for migration 233 is
// the OWNER-RUN BEHAVIORAL VERIFICATION block embedded in the migration
// file's own trailing comment (asserted present below, in a later test) --
// to be run by hand, once, after the owner pushes this migration. No
// database connection (local or production) is reachable from this test's
// environment. This migration also issues zero GRANT/REVOKE statements
// against the collaborators table itself, so -- unlike migration 231 --
// there is no grant-state re-check analogous to 231's; the four embedded
// probes are the entire proof.

describe('migration 233 — collaborators.claimed_by write lockdown', () => {
  it('defines collaborators_guard_claimed_by_write() returning TRIGGER, checking both INSERT and UPDATE changes to claimed_by', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.collaborators_guard_claimed_by_write\(\)\s*\nRETURNS TRIGGER/
    )
    expect(sql).toContain("TG_OP = 'INSERT' AND NEW.claimed_by IS NOT NULL")
    expect(sql).toContain("TG_OP = 'UPDATE' AND NEW.claimed_by IS DISTINCT FROM OLD.claimed_by")
  })

  it('gates on auth.role() / service_role, and does NOT gate on current_user -- the specific mistake migration 231 already rules out', () => {
    expect(sql).toMatch(/\(SELECT auth\.role\(\)\)/)
    expect(sql).toContain("v_role = 'service_role'")
    // Checked against comment-stripped code, not raw text: the header
    // deliberately discusses current_user in prose (why it would be wrong).
    // The guard's actual executable body must never contain that comparison.
    expect(code).not.toMatch(/current_user\s*=\s*'service_role'/)
  })

  it('treats a NULL role (direct database session) as privileged, alongside service_role', () => {
    expect(sql).toMatch(/v_privileged[\s\S]{0,80}v_role IS NULL OR v_role = 'service_role'/)
  })

  it('gates on the transaction-local GUC funun.collaborators_claimed_by_write = \'verified_claim\', not on auth.role() alone', () => {
    expect(sql).toContain("current_setting('funun.collaborators_claimed_by_write', TRUE)")
    expect(sql).toMatch(/v_verified_claim[\s\S]{0,40}v_write_mode = 'verified_claim'/)
    expect(sql).toMatch(
      /IF v_changing AND NOT v_privileged AND NOT v_verified_claim THEN/
    )
  })

  it('raises with RAISE EXCEPTION and ERRCODE 42501 when a non-privileged, non-verified-claim caller changes claimed_by', () => {
    expect(sql).toMatch(/RAISE EXCEPTION[\s\S]{0,300}USING ERRCODE = '42501'/)
  })

  it('attaches the trigger BEFORE INSERT OR UPDATE ON public.collaborators FOR EACH ROW', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER collaborators_guard_claimed_by_write\s*\n\s*BEFORE INSERT OR UPDATE ON public\.collaborators\s*\n\s*FOR EACH ROW\s*\n\s*EXECUTE FUNCTION public\.collaborators_guard_claimed_by_write\(\)/
    )
  })

  it('drops any prior version of the trigger before recreating it (idempotent re-apply)', () => {
    expect(sql).toContain('DROP TRIGGER IF EXISTS collaborators_guard_claimed_by_write ON public.collaborators')
  })

  it('is SECURITY INVOKER, not SECURITY DEFINER, for the guard function', () => {
    const fnMatch = sql.match(
      /CREATE OR REPLACE FUNCTION public\.collaborators_guard_claimed_by_write\(\)[\s\S]*?AS \$\$/
    )
    expect(fnMatch).not.toBeNull()
    const header = fnMatch?.[0] ?? ''
    expect(header).toMatch(/SECURITY INVOKER/)
    expect(header).not.toMatch(/SECURITY DEFINER/)
  })

  it('claim_collaborators(): sets the verified-claim GUC before its claimed_by UPDATE, and stays SECURITY DEFINER with no re-added EXECUTE grant', () => {
    const fnMatch = sql.match(
      /CREATE OR REPLACE FUNCTION public\.claim_collaborators\([\s\S]*?\$\$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';/
    )
    expect(fnMatch).not.toBeNull()
    const body = fnMatch?.[0] ?? ''
    const gucIndex = body.indexOf(
      "PERFORM set_config('funun.collaborators_claimed_by_write', 'verified_claim', TRUE);"
    )
    const updateIndex = body.indexOf('UPDATE public.collaborators')
    expect(gucIndex).toBeGreaterThan(-1)
    expect(updateIndex).toBeGreaterThan(-1)
    expect(gucIndex).toBeLessThan(updateIndex)
    expect(body).toContain('SET claimed_by = p_user_id')

    // No grant line re-added for this function anywhere in the file
    // (comment-stripped): CREATE OR REPLACE preserves migration 075's
    // service_role-only EXECUTE lockdown automatically.
    expect(code).not.toMatch(/(GRANT|REVOKE)\s+EXECUTE[^;]*claim_collaborators/i)
  })

  it('link_existing_member_collaborator(): sets the verified-claim GUC before assigning NEW.claimed_by, and stays SECURITY DEFINER with no re-added grant', () => {
    const fnMatch = sql.match(
      /CREATE OR REPLACE FUNCTION public\.link_existing_member_collaborator\(\)[\s\S]*?\nAS \$\$[\s\S]*?\n\$\$;/
    )
    expect(fnMatch).not.toBeNull()
    const body = fnMatch?.[0] ?? ''
    expect(body).toMatch(/SECURITY DEFINER/)
    const gucIndex = body.indexOf(
      "PERFORM set_config('funun.collaborators_claimed_by_write', 'verified_claim', TRUE);"
    )
    const selectIndex = body.indexOf('SELECT account.id')
    expect(gucIndex).toBeGreaterThan(-1)
    expect(selectIndex).toBeGreaterThan(-1)
    expect(gucIndex).toBeLessThan(selectIndex)
    expect(body).toContain('INTO NEW.claimed_by')

    // No grant/revoke statement naming this function anywhere in the file
    // (comment-stripped): CREATE OR REPLACE preserves migration 179's own
    // REVOKE ALL automatically. Anchored to the actual SQL keyword shape
    // (GRANT|REVOKE followed directly by ALL/EXECUTE, bounded distance) so
    // this does not false-positive on prose elsewhere in the file that
    // happens to use the English word "revokes" (e.g. the corrected
    // sync_work_membership_on_claim() comment, which legitimately discusses
    // migration 136 "revok[ing] all client writes" on an unrelated table).
    expect(code).not.toMatch(/\b(GRANT|REVOKE)\s+(ALL|EXECUTE)\b[^;]{0,120}link_existing_member_collaborator/)
  })

  it('corrects both false "exclusively" comments via refreshed COMMENT ON FUNCTION text naming both legitimate writers, without repeating the false claim', () => {
    expect(sql).toContain('COMMENT ON FUNCTION public.sync_project_membership_for_sheet()')
    expect(sql).toContain('COMMENT ON FUNCTION public.sync_work_membership_on_claim()')

    const projectCommentMatch = sql.match(
      /COMMENT ON FUNCTION public\.sync_project_membership_for_sheet\(\) IS\s*\n\s*'([\s\S]*?)';/
    )
    const workCommentMatch = sql.match(
      /COMMENT ON FUNCTION public\.sync_work_membership_on_claim\(\) IS\s*\n\s*'([\s\S]*?)';/
    )
    expect(projectCommentMatch).not.toBeNull()
    expect(workCommentMatch).not.toBeNull()

    for (const match of [projectCommentMatch, workCommentMatch]) {
      const body = match?.[1] ?? ''
      expect(body).toContain('claim_collaborators')
      expect(body).toContain('link_existing_member_collaborator')
      expect(body).not.toMatch(/exclusively/i)
    }
  })

  it('scope guard: issues no GRANT/REVOKE statement naming collaborators as a bare table target', () => {
    // Table-form GRANT/REVOKE only -- excludes `... ON FUNCTION ...`, which
    // this migration legitimately uses for the new guard function.
    expect(code).not.toMatch(/\b(GRANT|REVOKE)\b(?:(?!ON FUNCTION)[\s\S]){0,120}\bON\s+(public\.)?collaborators\b(?!_)/i)
  })

  it('scope guard: does not redefine any function this migration does not name in Parts B/C', () => {
    const untouchedFunctions = [
      'handle_new_user',
      'complete_verified_signup_claim',
      'detach_lyric_block_with_text',
      'enforce_lyric_text_write_path',
      'tracks_guard_work_id_write',
      'backfill_claimed_collaborators',
      'collaborators_claimed_implies_confirmed',
      'sync_project_membership_for_sheet',
      'sync_work_membership_on_claim',
      'accept_collaborator_invites_on_claim',
    ]
    for (const fn of untouchedFunctions) {
      expect(code).not.toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`))
    }
  })

  it('carries the owner-run behavioral verification block with four non-destructive probes, two MUST-FAIL (42501) and two MUST-SUCCEED', () => {
    expect(sql).toMatch(/OWNER-RUN BEHAVIORAL VERIFICATION/)
    expect((sql.match(/42501/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect((sql.match(/'verified_claim'/g) ?? []).length).toBeGreaterThanOrEqual(3)
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
// single-quoted string literals), the same discipline migration 231's own
// test already establishes for this corpus.

describe('migration 233 — standing corpus invariant', () => {
  it('the trigger is created at least as many times as it is dropped, across every migration', () => {
    const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations')
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))

    let createCount = 0
    let dropCount = 0

    for (const file of files) {
      const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      const stripped = stripLineComments(raw)
      createCount += (stripped.match(/CREATE (OR REPLACE )?TRIGGER collaborators_guard_claimed_by_write/g) ?? []).length
      dropCount += (stripped.match(/DROP TRIGGER[^;]*collaborators_guard_claimed_by_write/g) ?? []).length
    }

    expect(createCount).toBeGreaterThan(0)
    expect(createCount).toBeGreaterThanOrEqual(dropCount)
  })
})
