import fs from 'fs'
import path from 'path'
import { readdirSync } from 'fs'

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations')
const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '239_rights_ledger_write_lockdown.sql'), 'utf8')

function stripLineComments(fileSql: string): string {
  return fileSql.split('\n').map((line) => {
    let inString = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === "'") { inString = !inString; continue }
      if (!inString && ch === '-' && line[i + 1] === '-') return line.slice(0, i)
    }
    return line
  }).join('\n')
}

const code = stripLineComments(sql)

// These assertions prove the SQL was written as intended and nothing more.
// Three controls in this corpus have passed a text-lock while enforcing
// nothing (230's column REVOKE, 233's NULL condition, 070's revoke breaking
// the path it protected). The proof is the owner-run probe block.

describe('migration 239 — ai_entries append-only', () => {
  it('revokes UPDATE and DELETE at TABLE level, never column level', () => {
    expect(code).toMatch(/REVOKE UPDATE, DELETE ON public\.ai_entries FROM authenticated, anon/)
    // A column-level revoke cannot remove a table-level privilege -- migration
    // 230 shipped exactly that and it was a silent no-op.
    expect(code).not.toMatch(/REVOKE[^;]*\([a-z_, ]+\)[^;]*\bON\s+public\.ai_entries\b/)
  })

  it('narrows the FOR ALL policy to INSERT with the identical owner-or-member condition', () => {
    expect(code).toContain('DROP POLICY IF EXISTS "ai_entries_write_owner_or_member" ON public.ai_entries')
    const ins = code.match(/CREATE POLICY "ai_entries_insert_owner_or_member"[\s\S]*?\n\s*\);/)?.[0] ?? ''
    expect(ins).toMatch(/FOR INSERT/)
    expect(ins).toMatch(/is_work_owner\(work_id/)
    expect(ins).toMatch(/work_member_tier\(work_id[\s\S]*?IS NOT NULL/)
  })

  it('leaves INSERT grants and the SELECT policy alone', () => {
    expect(code).not.toMatch(/REVOKE[^;]*INSERT[^;]*ON public\.ai_entries/)
    expect(code).not.toMatch(/DROP POLICY[^;]*ai_entries_select_owner_or_member/)
  })
})

describe('migration 239 — lyric_blocks author columns', () => {
  it('authorises BOTH detach AND suggestion_accept — the plan named only detach', () => {
    // The plan this implements claimed detach_lyric_block_with_text() was the
    // only path that rewrites these columns. Migration 161:287-291 is a
    // second one, and it sets the GUC to 'suggestion_accept' (161:283). A
    // guard requiring 'detach' alone would break accepting a lyric
    // suggestion -- a live Writer's Room feature.
    expect(code).toMatch(/v_mode IN \('detach', 'suggestion_accept'\)/)
  })

  it('does NOT authorise locked_save or restore, which never touch these columns', () => {
    const decl = code.match(/v_authorised BOOLEAN :=[^;]*;/)?.[0] ?? ''
    expect(decl).not.toMatch(/locked_save/)
    expect(decl).not.toMatch(/restore/)
  })

  it('forces the authorisation boolean non-NULL — migration 233’s exact defect', () => {
    // `NULL IN (...)` is NULL, and a NULL in the IF condition skips the THEN
    // branch, which is how 233's guard came to be inert in production.
    expect(code).toMatch(/v_authorised BOOLEAN := COALESCE\(v_mode IN \(/)
    expect(code).toMatch(/v_mode TEXT := NULLIF\(current_setting\('funun\.lyric_text_write', TRUE\), ''\)/)
  })

  it('is column-scoped with a WHEN guard, and touches no grant or policy on the table', () => {
    expect(code).toMatch(/BEFORE UPDATE OF author_user_id, author_kind ON public\.lyric_blocks/)
    expect(code).toMatch(/WHEN \(\s*\n\s*NEW\.author_user_id IS DISTINCT FROM OLD\.author_user_id/)
    // INSERT and DELETE of blocks must keep working -- adding and removing
    // sections is core Writer's Room work.
    expect(code).not.toMatch(/REVOKE[^;]*\bON\s+public\.lyric_blocks\b/)
    expect(code).not.toMatch(/DROP POLICY[^;]*\bON\s+public\.lyric_blocks\b/)
  })
})

describe('migration 239 — work_versions provenance', () => {
  it('revokes DELETE at table level and removes DELETE from the policy set', () => {
    expect(code).toMatch(/REVOKE DELETE ON public\.work_versions FROM authenticated, anon/)
    expect(code).toContain('DROP POLICY IF EXISTS "work_versions_write_owner_or_member" ON public.work_versions')
    expect(code).toMatch(/CREATE POLICY "work_versions_insert_owner_or_member"[\s\S]*?FOR INSERT/)
    expect(code).toMatch(/CREATE POLICY "work_versions_update_owner_or_member"[\s\S]*?FOR UPDATE/)
    expect(code).not.toMatch(/CREATE POLICY[^;]*ON public\.work_versions\s*\n\s*FOR DELETE/)
    expect(code).not.toMatch(/CREATE POLICY[^;]*ON public\.work_versions\s*\n\s*FOR ALL/)
  })

  it('guards all seven provenance columns plus work_id', () => {
    for (const col of ['user_id', 'source', 'audio_path', 'audio_ext', 'audio_size', 'duration_seconds', 'performers', 'work_id']) {
      expect(code).toMatch(new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`))
    }
  })

  it('leaves the three columns the application actually updates writable', () => {
    const guard = code.match(/v_changing BOOLEAN :=[\s\S]*?;\nBEGIN/)?.[1] ?? code.match(/work_versions_guard_provenance[\s\S]*?v_changing BOOLEAN :=([\s\S]*?);/)?.[1] ?? ''
    expect(guard).not.toBe('')
    for (const col of ['label', 'peaks', 'archived_at', 'archived_by']) {
      expect(guard).not.toMatch(new RegExp(`\\b${col}\\b`))
    }
  })
})

describe('migration 239 — shared posture', () => {
  it('both guards are SECURITY INVOKER and trigger-internal only', () => {
    for (const fn of ['lyric_blocks_guard_author_write', 'work_versions_guard_provenance']) {
      const header = code.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(\\)[\\s\\S]*?AS \\$\\$`))?.[0] ?? ''
      expect(header).toMatch(/SECURITY INVOKER/)
      expect(header).not.toMatch(/SECURITY DEFINER/)
      expect(code).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\(\\) FROM PUBLIC, anon, authenticated`))
    }
  })

  it('both use the auth.role() privileged idiom established by 231 and 234', () => {
    expect((code.match(/v_privileged BOOLEAN := v_role IS NULL OR v_role = 'service_role'/g) ?? []).length).toBe(2)
  })

  it('records why it is 239 and not the plan’s 232', () => {
    expect(sql).toMatch(/That number is a gap, not a vacancy/)
    expect(sql).toMatch(/This is 239/)
  })

  it('carries probes asking whether the privilege is GONE, not whether the statement ran', () => {
    expect(sql).toMatch(/information_schema\.role_table_grants/)
    expect(sql).toMatch(/whether the privilege is GONE, not whether the statement ran/)
    expect(sql).toMatch(/L5\s+MUST SUCCEED -- author change with 'suggestion_accept'/)
    expect((sql.match(/MUST SUCCEED/g) ?? []).length).toBeGreaterThanOrEqual(8)
  })
})

describe('migration 239 — standing corpus invariant', () => {
  it('no FOR ALL write policy survives on the three rights-ledger tables', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
    const latest = files.filter((f) => Number(f.slice(0, 3)) >= 239)
    for (const file of latest) {
      const stripped = stripLineComments(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))
      for (const table of ['public.ai_entries', 'public.work_versions']) {
        const re = new RegExp(`CREATE POLICY[^;]*ON ${table.replace('.', '\\.')}\\s*\\n\\s*FOR ALL`, 'g')
        expect(stripped.match(re)).toBeNull()
      }
    }
  })
})
