import { readFileSync } from 'fs'
import path from 'path'

const sql = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/120_staff_name_fields.sql'),
  'utf8'
)
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')

describe('migration 120 — staff name fields', () => {
  it('adds first_name and last_name columns (additive, IF NOT EXISTS)', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS first_name TEXT')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS last_name TEXT')
  })

  it('reloads the PostgREST schema cache', () => {
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'")
  })
})
