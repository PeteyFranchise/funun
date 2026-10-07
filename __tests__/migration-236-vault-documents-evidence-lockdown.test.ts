import fs from 'fs'
import path from 'path'

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/236_vault_documents_evidence_lockdown.sql'),
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

describe('migration 236 — vault_documents evidence lockdown (Pass 6 C-3)', () => {
  it('defines the evidence guard as a BEFORE UPDATE row trigger', () => {
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\.vault_documents_guard_evidence\(\)\s*\nRETURNS TRIGGER/)
    expect(code).toMatch(/CREATE TRIGGER vault_documents_guard_evidence\s*\n\s*BEFORE UPDATE ON public\.vault_documents\s*\n\s*FOR EACH ROW/)
  })

  it('forces the authority boolean non-NULL and handles the nullable project_id branch', () => {
    // vault_documents.project_id is NULLABLE (001). A personal document has
    // no project, so is_project_owner(NULL, uid) is not the right question --
    // and a NULL answer would disable the guard the way migration 233's did.
    expect(code).toMatch(/WHEN OLD\.project_id IS NULL THEN COALESCE\(OLD\.user_id = v_uid, FALSE\)/)
    expect(code).toMatch(/COALESCE\(\(SELECT public\.is_project_owner\(OLD\.project_id, v_uid\)\), FALSE\)/)
    expect(code).toMatch(/COALESCE\(\(SELECT public\.project_member_role\(OLD\.project_id, v_uid\)\) = 'co-owner', FALSE\)/)
  })

  it('makes the four verifier-produced columns unwritable on UPDATE by EVERY client, owner included', () => {
    for (const col of ['verification_status', 'verification_checks', 'verification_summary', 'verified_at']) {
      expect(code).toMatch(new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`))
    }
    // The check must precede the owner early-return, or an owner bypasses it.
    expect(code.indexOf('v_verification_changed THEN')).toBeLessThan(code.indexOf('IF v_full_authority THEN'))
  })

  it('protects every evidence field from a non-owner', () => {
    for (const col of ['status', 'signed_at', 'signed_by', 'file_url', 'document_data', 'source', 'type', 'project_id', 'track_id']) {
      expect(code).toMatch(new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`))
    }
  })

  it('stops an editor creating a row that arrives already signed or verified', () => {
    const ins = code.match(/CREATE POLICY "vault_documents_insert_project_owner_or_editor"[\s\S]*?\n\s*\);/)?.[0] ?? ''
    expect(ins).toMatch(/= 'editor'\s*\n\s*AND COALESCE\(status, 'pending'\) = 'pending'/)
    expect(ins).toMatch(/user_id = \(SELECT auth\.uid\(\)\)/)
  })

  it('preserves migration 078/186/193’s nullable project_id fallback on every policy', () => {
    const policies = code.match(/CREATE POLICY "vault_documents_[\s\S]*?\n\s*\);/g) ?? []
    expect(policies.length).toBe(3)
    for (const p of policies) {
      expect(p).toMatch(/project_id IS NULL AND user_id = \(SELECT auth\.uid\(\)\)|user_id = \(SELECT auth\.uid\(\)\)/)
    }
  })

  it('drops editor from DELETE', () => {
    const del = code.match(/CREATE POLICY "vault_documents_delete_project_owner_or_coowner"[\s\S]*?\n\s*\);/)?.[0] ?? ''
    expect(del).toMatch(/FOR DELETE/)
    expect(del).not.toMatch(/'editor'/)
  })

  it('states the owner-revert residue as an explicit non-goal rather than leaving it silent', () => {
    expect(sql).toMatch(/NOT closed here, deliberately and on the record/)
    expect(sql).toMatch(/2026-10-06-vault-documents-supersede-not-revert\.md/)
    expect(fs.existsSync(path.join(process.cwd(), '.planning/todos/pending/2026-10-06-vault-documents-supersede-not-revert.md'))).toBe(true)
  })

  it('keeps the live upload-only e-sign path as a must-succeed probe', () => {
    expect(sql).toMatch(/MUST SUCCEED -- owner uploads: pending -> signed/)
    expect(sql).toMatch(/MUST FAIL 42501 -- OWNER hand-sets verification_status/)
  })

  it('is SECURITY INVOKER and trigger-internal only', () => {
    const header = code.match(/CREATE OR REPLACE FUNCTION public\.vault_documents_guard_evidence\(\)[\s\S]*?AS \$\$/)?.[0] ?? ''
    expect(header).toMatch(/SECURITY INVOKER/)
    expect(header).not.toMatch(/SECURITY DEFINER/)
    expect(code).toMatch(/REVOKE EXECUTE ON FUNCTION public\.vault_documents_guard_evidence\(\) FROM PUBLIC, anon, authenticated/)
  })
})
