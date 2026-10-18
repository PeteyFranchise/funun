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

  it('drops hand-made storage.objects policies that mention the bucket', () => {
    expect(code).toMatch(/FROM pg_policies/)
    expect(code).toMatch(/schemaname = 'storage'/)
    expect(code).toMatch(/tablename = 'objects'/)
    expect(code).toMatch(/ILIKE '%release-documents%'/)
    expect(code).toMatch(/EXECUTE format\('DROP POLICY %I ON storage\.objects'/)
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
    expect(sql).not.toContain('—')
  })
})
