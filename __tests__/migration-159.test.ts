import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/159_lyric_block_vocal_direction.sql'),
  'utf8'
)

describe('migration 159 — lyric block vocal direction', () => {
  it('adds an optional bounded direction field without changing performers or membership', () => {
    expect(migration).toContain('ADD COLUMN vocal_direction TEXT')
    expect(migration).toContain('char_length(vocal_direction) BETWEEN 1 AND 160')
    expect(migration).not.toMatch(/ALTER TABLE public\.work_members/i)
    expect(migration).not.toMatch(/ALTER TABLE public\.split_sheet_parties/i)
  })

  it('records that direction is not a person or rights fact', () => {
    expect(migration).toContain('Never a performer identity')
    expect(migration.trimEnd().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
