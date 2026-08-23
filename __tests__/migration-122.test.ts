import { readFileSync } from 'fs'
import path from 'path'

const sql = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/122_identifier_unique_indexes.sql'),
  'utf8'
)
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')

describe('migration 122 — identifier unique-index backstop (audit #3)', () => {
  it('adds a partial unique index on tracks.isrc', () => {
    expect(sql).toContain('tracks_isrc_unique')
    expect(sql).toContain('ON public.tracks (isrc) WHERE isrc IS NOT NULL')
  })

  it('adds global partial unique indexes on vault_projects.upc and .grid', () => {
    expect(sql).toContain('ON public.vault_projects (upc) WHERE upc IS NOT NULL')
    expect(sql).toContain('ON public.vault_projects (grid) WHERE grid IS NOT NULL')
  })

  it('scopes catalog_number uniqueness PER artist (label-scoped, not global)', () => {
    expect(sql).toContain(
      'ON public.vault_projects (user_id, catalog_number) WHERE catalog_number IS NOT NULL'
    )
    // Must NOT be a global catalog_number index — two labels may reuse a number.
    expect(sql).not.toMatch(/ON public\.vault_projects \(catalog_number\)/)
  })

  it('is idempotent (IF NOT EXISTS) and reloads the PostgREST schema cache', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS')
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'")
  })
})
