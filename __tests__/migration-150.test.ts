import { readFileSync } from 'fs'
import path from 'path'

const migration150 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/150_playbook_song_passport_doctrine.sql'),
  'utf8'
)

const sqlOnly = migration150
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

describe('migration 150 — Song Passport doctrine Playbook entry', () => {
  it('targets the existing Company-wide Standards & Doctrine room', () => {
    expect(sqlOnly).toContain("WHERE key = 'company-wide'")
    expect(sqlOnly).toContain("'standards-and-doctrine', 'Standards & Doctrine'")
    expect(sqlOnly).toMatch(/ON CONFLICT \(room_id, key\) DO UPDATE/)
  })

  it('publishes one explicitly versioned internal doctrine entry', () => {
    expect(sqlOnly).toContain('Song Passport Doctrine v1.0 — Definitions, Role and Operating Rules')
    expect(sqlOnly).toContain("'sop'")
    expect(sqlOnly).toContain("'published'")
    expect(sqlOnly).toContain("jsonb_build_object('items', to_jsonb(entry.items))")
  })

  it('locks every approved SP-01 through SP-25 rule into the entry', () => {
    for (let i = 1; i <= 25; i += 1) {
      const id = String(i).padStart(2, '0')
      expect(sqlOnly).toContain(`SP-${id} —`)
    }
  })

  it('states the definition, product role and capability truth boundaries', () => {
    expect(sqlOnly).toContain('The Song Passport is the living, versioned record')
    expect(sqlOnly).toContain('the Passport lives with the song inside Sound Vault')
    expect(sqlOnly).toContain('Capability status — shipped foundation')
    expect(sqlOnly).toContain('Capability status — planned Phase 37.3')
    expect(sqlOnly).toContain('Capability status — partner-dependent')
    expect(sqlOnly).toContain('must not claim DDEX certification')
  })

  it('includes the approved operational edge cases', () => {
    expect(sqlOnly).toContain("Final mix outside the Writer''s Room")
    expect(sqlOnly).toContain('Master sale example')
    expect(sqlOnly).toContain('Distributor example')
    expect(sqlOnly).toContain('Completing a task never changes readiness by itself')
  })

  it('is idempotent by room and exact versioned title', () => {
    expect(sqlOnly).toMatch(
      /WHERE NOT EXISTS \([\s\S]*existing\.room_id = room\.id[\s\S]*existing\.title = entry\.title/
    )
  })

  it('does not rewrite or delete existing Playbook history', () => {
    expect(sqlOnly).not.toMatch(/UPDATE public\.playbook_entries/i)
    expect(sqlOnly).not.toMatch(/DELETE FROM public\.playbook_entries/i)
    expect(sqlOnly).not.toMatch(/ALTER TABLE/i)
    expect(sqlOnly).not.toMatch(/DROP TABLE/i)
  })

  it('reloads the PostgREST schema cache last', () => {
    expect(sqlOnly.trimEnd().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
