import fs from 'fs'
import path from 'path'

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/245_release_documents_private_bucket.sql'),
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

describe('migration 245 - release-documents bucket', () => {
  it('inserts exactly one bucket row: private, 20 MB, PDF only', () => {
    const inserts = code.match(/INSERT INTO storage\.buckets/g) ?? []
    expect(inserts).toHaveLength(1)
    expect(code).toMatch(
      /VALUES\s*\(\s*'release-documents',\s*'release-documents',\s*false,\s*20971520,\s*ARRAY\['application\/pdf'\]\s*\)/
    )
  })

  it('forces public = false as a literal on conflict, so a hand-made public bucket flips private', () => {
    const conflict = code.match(/ON CONFLICT \(id\) DO UPDATE SET([\s\S]*?);/)?.[1] ?? ''
    expect(conflict).toMatch(/public\s*=\s*false/)
    expect(conflict).not.toMatch(/EXCLUDED\.public/)
    expect(conflict).toMatch(/file_size_limit\s*=\s*EXCLUDED\.file_size_limit/)
    expect(conflict).toMatch(/allowed_mime_types\s*=\s*EXCLUDED\.allowed_mime_types/)
  })

  it('creates no policy and grants nothing to anon or authenticated', () => {
    expect(code).not.toMatch(/CREATE POLICY/i)
    expect(code).not.toMatch(/\bGRANT\b/i)
    expect(code).not.toMatch(/TO\s+(anon|authenticated)\b/i)
  })

  it('does not drop or alter any storage.objects policy', () => {
    // Production was read on 2026-10-18: storage.objects carries only
    // vault_assets_* and vault_contracts_* policies. The migration must not
    // run a catalog-driven DROP over policies it did not create.
    expect(code).not.toMatch(/DROP POLICY/i)
    expect(code).not.toMatch(/ALTER POLICY/i)
    expect(code).not.toMatch(/FOR r IN/i)
  })

  it('lists any policy that mentions the bucket in the verification footer', () => {
    expect(sql).toMatch(/FROM pg_policies/)
    expect(sql).toMatch(/ILIKE '%release-documents%'/)
  })

  it('documents vault_documents.file_url as a path in either bucket', () => {
    const comment = code.match(/COMMENT ON COLUMN public\.vault_documents\.file_url IS\s+'([\s\S]*?)';/)?.[1] ?? ''
    expect(comment).toMatch(/path/i)
    expect(comment).toContain('vault-contracts')
    expect(comment).toContain('release-documents')
  })

  it('does not touch the vault-contracts bucket or its policies', () => {
    expect(code).not.toMatch(/INSERT INTO storage\.buckets[\s\S]*'vault-contracts'/)
    expect(code).not.toMatch(/vault_contracts_/)
  })

  it('carries no em dashes', () => {
    expect(sql).not.toContain(String.fromCharCode(0x2014))
  })
})

describe('migration 245 - vault_documents file_url / source write guard', () => {
  const fn = code.match(/CREATE OR REPLACE FUNCTION public\.vault_documents_guard_file_url\(\)([\s\S]*?)\$\$;/)?.[1] ?? ''

  it('defines a guard function with a pinned search_path', () => {
    expect(fn).not.toBe('')
    expect(fn).toMatch(/RETURNS TRIGGER/)
    expect(fn).toMatch(/SET search_path = ''/)
  })

  it('uses the auth.role() idiom from 209/231, never current_user', () => {
    expect(fn).toMatch(/\(SELECT auth\.role\(\)\)/)
    expect(fn).toMatch(/v_role IS NULL OR v_role = 'service_role'/)
    expect(code).not.toMatch(/current_user/i)
  })

  it('rejects a non-null file_url on INSERT and any file_url or source change on UPDATE', () => {
    expect(fn).toMatch(/TG_OP = 'INSERT' AND NEW\.file_url IS NOT NULL/)
    expect(fn).toMatch(/TG_OP = 'UPDATE' AND \(\s*NEW\.file_url IS DISTINCT FROM OLD\.file_url\s+OR NEW\.source IS DISTINCT FROM OLD\.source\s*\)/)
    expect(fn).toMatch(/ERRCODE = '42501'/)
    expect(fn).toMatch(/NOT v_privileged/)
  })

  it('fires BEFORE INSERT OR UPDATE for each row, and is not callable by clients', () => {
    expect(code).toMatch(
      /CREATE TRIGGER vault_documents_guard_file_url\s+BEFORE INSERT OR UPDATE ON public\.vault_documents\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.vault_documents_guard_file_url\(\)/
    )
    expect(code).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.vault_documents_guard_file_url\(\) FROM PUBLIC, anon, authenticated/
    )
  })

  it('does not replace 236 guard or its policies', () => {
    expect(code).not.toMatch(/vault_documents_guard_evidence/)
    expect(code).not.toMatch(/CREATE POLICY/i)
  })
})
