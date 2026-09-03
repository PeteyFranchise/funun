import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/158_rights_setup_companion.sql'),
  'utf8'
)

const sqlOnly = migration
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

describe('migration 158 — rights setup companion', () => {
  it('adds a nullable reminder timestamp with no automatic default', () => {
    expect(sqlOnly).toContain('ADD COLUMN rights_setup_remind_at TIMESTAMPTZ')
    expect(sqlOnly).not.toMatch(/rights_setup_remind_at\s+TIMESTAMPTZ\s+DEFAULT/i)
  })

  it('does not expose the private timestamp through browser grants', () => {
    expect(sqlOnly).not.toMatch(/GRANT\s+(SELECT|UPDATE)[\s\S]*rights_setup_remind_at/i)
  })

  it('reloads the PostgREST schema cache last', () => {
    expect(sqlOnly.trimEnd().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
