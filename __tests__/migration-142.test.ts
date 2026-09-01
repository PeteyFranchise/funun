import { readFileSync } from 'fs'
import path from 'path'

const migration142 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/142_metadata_delivery_exports.sql'),
  'utf8'
)

const sqlOnly = migration142
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

describe('migration 142 — delivery-safe metadata export evidence', () => {
  it('stores source, artifact, metadata, manifest and receipt evidence', () => {
    expect(sqlOnly).toMatch(/CREATE TABLE public\.metadata_delivery_exports/)
    for (const column of [
      'source_path',
      'source_sha256',
      'artifact_path',
      'artifact_sha256',
      'metadata_snapshot',
      'manifest',
      'receipt',
    ]) {
      expect(sqlOnly).toContain(column)
    }
  })

  it('accepts only the two currently implemented delivery artifact kinds', () => {
    expect(sqlOnly).toMatch(/kind IN \('tagged_mp3', 'metadata_sidecar'\)/)
  })

  it('makes generated artifact paths unique and hashes structurally valid', () => {
    expect(sqlOnly).toMatch(/artifact_path\s+TEXT NOT NULL UNIQUE/)
    expect(sqlOnly.match(/\^\[0-9a-f\]\{64\}\$/g)).toHaveLength(2)
  })

  it('keeps the evidence ledger server-only', () => {
    expect(sqlOnly).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(sqlOnly).toMatch(
      /REVOKE ALL ON TABLE public\.metadata_delivery_exports FROM PUBLIC, anon, authenticated/
    )
    expect(sqlOnly).not.toMatch(/CREATE POLICY/i)
  })

  it('does not define an application update or delete path', () => {
    expect(sqlOnly).not.toMatch(/UPDATE public\.metadata_delivery_exports/i)
    expect(sqlOnly).not.toMatch(/DELETE FROM public\.metadata_delivery_exports/i)
  })

  it('reloads the PostgREST schema cache last', () => {
    expect(sqlOnly.trimEnd().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
