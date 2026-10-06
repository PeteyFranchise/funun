import fs from 'fs'
import path from 'path'
import { readdirSync } from 'fs'

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/237_split_sheets_executed_immutability.sql'),
  'utf8'
)

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

describe('migration 237 — split_sheets executed immutability (Pass 6 C-4)', () => {
  it('defines the guard as a BEFORE UPDATE row trigger', () => {
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\.split_sheets_guard_execution\(\)\s*\nRETURNS TRIGGER/)
    expect(code).toMatch(/CREATE TRIGGER split_sheets_guard_execution\s*\n\s*BEFORE UPDATE ON public\.split_sheets\s*\n\s*FOR EACH ROW/)
  })

  it('freezes a sheet already at esign_pending or executed against every client write', () => {
    expect(code).toMatch(/v_was_locked BOOLEAN := OLD\.status IN \('esign_pending', 'executed'\)/)
    // Must be the first check after the privileged early-return, so no other
    // branch can let a locked sheet through.
    expect(code.indexOf('IF v_was_locked THEN')).toBeLessThan(code.indexOf('NEW.initiator_user_id IS DISTINCT FROM'))
  })

  it('refuses the four columns the service-side endpoints own', () => {
    for (const col of ['initiator_user_id', 'all_approved_at', 'track_id', 'work_id']) {
      expect(code).toMatch(new RegExp(`NEW\\.${col} IS DISTINCT FROM OLD\\.${col}`))
    }
  })

  it('refuses a client asserting an e-sign status it cannot back with an envelope', () => {
    expect(code).toMatch(/NEW\.status IS DISTINCT FROM OLD\.status\s*\n\s*AND NEW\.status IN \('esign_pending', 'executed'\)/)
  })

  it('recreates the SELECT policy that 018’s implicit FOR ALL was silently providing', () => {
    // The quietest possible regression: drop the FOR ALL, forget SELECT, and
    // the initiator's own sheets simply stop appearing. Nothing raises.
    expect(code).toContain('DROP POLICY IF EXISTS "Initiator manages split sheet" ON public.split_sheets')
    expect(code).toMatch(/CREATE POLICY "split_sheets_select_initiator" ON public\.split_sheets\s*\n\s*FOR SELECT/)
    expect(sql).toMatch(/MUST SUCCEED\s+-- initiator SELECTs their own sheet/)
  })

  it('constrains INSERT to a draft with no approval timestamp', () => {
    const ins = code.match(/CREATE POLICY "split_sheets_insert_initiator_draft"[\s\S]*?\n\s*\);/)?.[0] ?? ''
    expect(ins).toMatch(/status = 'draft'/)
    expect(ins).toMatch(/all_approved_at IS NULL/)
    expect(ins).toMatch(/initiator_user_id = \(SELECT auth\.uid\(\)\)/)
  })

  it('restricts UPDATE to unlocked sheets and DELETE to drafts', () => {
    const upd = code.match(/CREATE POLICY "split_sheets_update_initiator_unlocked"[\s\S]*?\n\s*WITH CHECK[\s\S]*?;/)?.[0] ?? ''
    expect(upd).toMatch(/status NOT IN \('esign_pending', 'executed'\)/)
    const del = code.match(/CREATE POLICY "split_sheets_delete_initiator_draft_only"[\s\S]*?\n\s*\);/)?.[0] ?? ''
    expect(del).toMatch(/FOR DELETE/)
    expect(del).toMatch(/status = 'draft'/)
  })

  it('is SECURITY INVOKER and trigger-internal only', () => {
    const header = code.match(/CREATE OR REPLACE FUNCTION public\.split_sheets_guard_execution\(\)[\s\S]*?AS \$\$/)?.[0] ?? ''
    expect(header).toMatch(/SECURITY INVOKER/)
    expect(header).not.toMatch(/SECURITY DEFINER/)
    expect(code).toMatch(/REVOKE EXECUTE ON FUNCTION public\.split_sheets_guard_execution\(\) FROM PUBLIC, anon, authenticated/)
  })
})

// ─── Standing corpus invariant, covering all three Pass 6 lockdowns ────────

describe('Pass 6 criticals — standing corpus invariant', () => {
  const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations')
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()

  it.each([
    ['tracks_guard_rights_columns', 'public.tracks'],
    ['vault_documents_guard_evidence', 'public.vault_documents'],
    ['split_sheets_guard_execution', 'public.split_sheets'],
  ])('%s is created at least as often as it is dropped, across every migration', (fn, table) => {
    let created = 0
    let dropped = 0
    for (const file of files) {
      const stripped = stripLineComments(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))
      created += (stripped.match(new RegExp(`CREATE (OR REPLACE )?TRIGGER ${fn}`, 'g')) ?? []).length
      dropped += (stripped.match(new RegExp(`DROP TRIGGER[^;]*${fn}`, 'g')) ?? []).length
    }
    expect(created).toBeGreaterThan(0)
    expect(created).toBeGreaterThanOrEqual(dropped)
    expect(table).toBeTruthy()
  })

  it('no FOR ALL write policy is reintroduced on the three hardened tables', () => {
    // The shape Pass 6 named: "FOR ALL to a role, on a table holding
    // rights-bearing facts, with the protection asserted in a comment rather
    // than enforced by the database."
    const latest = files.filter((f) => Number(f.slice(0, 3)) >= 235)
    for (const file of latest) {
      const stripped = stripLineComments(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))
      for (const table of ['public.tracks', 'public.vault_documents', 'public.split_sheets']) {
        const re = new RegExp(`CREATE POLICY[^;]*ON ${table.replace('.', '\\.')}\\s*\\n\\s*FOR ALL`, 'g')
        expect(stripped.match(re)).toBeNull()
      }
    }
  })
})
