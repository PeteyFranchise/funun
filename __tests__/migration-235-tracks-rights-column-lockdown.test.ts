import fs from 'fs'
import path from 'path'

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/235_tracks_rights_column_lockdown.sql'),
  'utf8'
)

function stripLineComments(fileSql: string): string {
  return fileSql
    .split('\n')
    .map((line) => {
      let inString = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === "'") { inString = !inString; continue }
        if (!inString && ch === '-' && line[i + 1] === '-') return line.slice(0, i)
      }
      return line
    })
    .join('\n')
}

const code = stripLineComments(sql)

// A text assertion cannot prove Postgres enforces any of this -- migrations
// 230 and 233 both shipped passing text-locks on controls that did nothing.
// The proof is the owner-run behavioural probes in the migration's footer.
// These assertions stop the fix being silently undone, and specifically
// encode the NULL-safety that migration 233 got wrong.

describe('migration 235 — tracks rights-column lockdown (Pass 6 C-2)', () => {
  it('defines the per-column guard as a BEFORE UPDATE row trigger', () => {
    expect(code).toMatch(
      /CREATE OR REPLACE FUNCTION public\.tracks_guard_rights_columns\(\)\s*\nRETURNS TRIGGER/
    )
    expect(code).toMatch(
      /CREATE TRIGGER tracks_guard_rights_columns\s*\n\s*BEFORE UPDATE ON public\.tracks\s*\n\s*FOR EACH ROW/
    )
  })

  it('forces every gating boolean non-NULL — the exact defect of migration 233', () => {
    // project_member_role() returns NULL for a non-member. A bare `=` against
    // it yields NULL, NOT v_x is then NULL, and PL/pgSQL skips the THEN
    // branch -- which is how 233's guard became inert in production.
    expect(code).toMatch(/v_full_authority BOOLEAN := COALESCE\(/)
    expect(code).toMatch(/OR COALESCE\(\s*\(SELECT public\.project_member_role\(OLD\.project_id, v_uid\)\) = 'co-owner', FALSE\s*\)/)
    expect(code).not.toMatch(/v_full_authority BOOLEAN :=\s*\(SELECT public\.is_project_owner[^\n]*\n\s*OR \(SELECT public\.project_member_role[^\n]*= 'co-owner';/)
  })

  it('protects exactly the owner-decided column set, using IS DISTINCT FROM', () => {
    for (const col of [
      'isrc', 'writers', 'producers', 'featuring_artists',
      'mixing_engineer', 'mastering_engineer', 'metadata', 'project_id',
    ]) {
      expect(code).toMatch(new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`))
    }
  })

  it('leaves the editor-writable working columns out of the protected set', () => {
    const guard = code.match(/v_protected_changed :=[\s\S]*?;/)?.[0] ?? ''
    expect(guard).not.toBe('')
    for (const col of ['title', 'lyrics', 'bpm', 'key_signature', 'explicit', 'audio_file_url', 'track_number', 'duration_seconds', 'has_sample', 'sample_details']) {
      expect(guard).not.toMatch(new RegExp(`\\b${col}\\b`))
    }
  })

  it('refuses user_id reassignment by every client caller, owner included', () => {
    const body = code.match(/IF NEW\.user_id IS DISTINCT FROM OLD\.user_id THEN[\s\S]*?END IF;/)?.[0] ?? ''
    expect(body).toMatch(/RAISE EXCEPTION/)
    // Must sit BEFORE the v_full_authority early return, or owners bypass it.
    expect(code.indexOf('NEW.user_id IS DISTINCT FROM OLD.user_id'))
      .toBeLessThan(code.indexOf('IF v_full_authority THEN'))
  })

  it('does not touch work_id — migration 231 already owns that column', () => {
    expect(code).not.toMatch(/NEW\.work_id/)
    expect(code).not.toMatch(/DROP TRIGGER IF EXISTS tracks_guard_work_id_write/)
  })

  it('replaces the FOR ALL policy with per-command policies and drops editor from DELETE', () => {
    expect(code).toContain('DROP POLICY IF EXISTS "tracks_write_project_owner_or_editor" ON public.tracks')
    expect(code).toMatch(/CREATE POLICY "tracks_insert_project_owner_or_editor" ON public\.tracks\s*\n\s*FOR INSERT/)
    expect(code).toMatch(/CREATE POLICY "tracks_update_project_owner_or_editor" ON public\.tracks\s*\n\s*FOR UPDATE/)
    const del = code.match(/CREATE POLICY "tracks_delete_project_owner_or_coowner"[\s\S]*?;/)?.[0] ?? ''
    expect(del).toMatch(/FOR DELETE/)
    expect(del).not.toMatch(/'editor'/)
    expect(code).not.toMatch(/FOR ALL TO authenticated[\s\S]{0,400}public\.tracks/)
  })

  it('stamps INSERT rows with the caller’s own user_id', () => {
    const ins = code.match(/CREATE POLICY "tracks_insert_project_owner_or_editor"[\s\S]*?;\n/)?.[0] ?? ''
    expect(ins).toMatch(/user_id = \(SELECT auth\.uid\(\)\)/)
  })

  it('is SECURITY INVOKER and trigger-internal only', () => {
    const header = code.match(/CREATE OR REPLACE FUNCTION public\.tracks_guard_rights_columns\(\)[\s\S]*?AS \$\$/)?.[0] ?? ''
    expect(header).toMatch(/SECURITY INVOKER/)
    expect(header).not.toMatch(/SECURITY DEFINER/)
    expect(code).toMatch(/REVOKE EXECUTE ON FUNCTION public\.tracks_guard_rights_columns\(\) FROM PUBLIC, anon, authenticated/)
  })

  it('carries owner-run probes covering both refusal AND the must-succeed paths', () => {
    expect(sql).toMatch(/OWNER-RUN BEHAVIORAL VERIFICATION/)
    expect(sql).toMatch(/MUST SUCCEED -- editor changes title and lyrics/)
    expect(sql).toMatch(/MUST SUCCEED -- owner changes writers and isrc/)
    expect((sql.match(/MUST FAIL/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })
})
