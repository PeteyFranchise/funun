import { readFileSync } from 'fs'
import path from 'path'

const migration141 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/141_playbook_sound_vault_custody_doctrine.sql'),
  'utf8'
)

const sqlOnly = migration141
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

describe('migration 141 — publishes the Sound Vault custody doctrine', () => {
  it('activates the Company-wide room', () => {
    expect(sqlOnly).toMatch(/UPDATE public\.playbook_rooms[\s\S]*SET coming_soon = false[\s\S]*WHERE key = 'company-wide'/)
  })

  it('creates the Standards & Doctrine subgroup idempotently', () => {
    expect(sqlOnly).toContain("'standards-and-doctrine', 'Standards & Doctrine'")
    expect(sqlOnly).toMatch(/ON CONFLICT \(room_id, key\) DO UPDATE/)
  })

  it('publishes an overview and every locked doctrine D-01 through D-10', () => {
    expect(sqlOnly).toContain('Sound Vault Master Custody Doctrine — Overview')
    for (let i = 1; i <= 10; i += 1) {
      const id = String(i).padStart(2, '0')
      expect(sqlOnly).toContain(`D-${id} —`)
    }
    expect(sqlOnly).toContain("'published'")
  })

  it('does not duplicate a titled doctrine entry if rerun', () => {
    expect(sqlOnly).toMatch(/WHERE NOT EXISTS \([\s\S]*existing\.room_id = room\.id[\s\S]*existing\.title = entry\.title/)
  })

  it('does not rewrite existing entries or alter the Playbook schema', () => {
    expect(sqlOnly).not.toMatch(/UPDATE public\.playbook_entries/i)
    expect(sqlOnly).not.toMatch(/DELETE FROM public\.playbook_entries/i)
    expect(sqlOnly).not.toMatch(/ALTER TABLE/i)
    expect(sqlOnly).not.toMatch(/DROP TABLE/i)
  })

  it('reloads the PostgREST schema cache last', () => {
    expect(sqlOnly.trimEnd().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
