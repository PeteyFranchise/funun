import { readFileSync } from 'fs'
import path from 'path'

const migration189 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/189_playbook_bdt_foundation_doctrine.sql'),
  'utf8'
)

const sqlOnly = migration189
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

describe('migration 189 — BDT foundation doctrine Playbook room', () => {
  it('creates and activates a dedicated Business Development room', () => {
    expect(sqlOnly).toContain("('business-development', 'Business Development', 3, false, false)")
    expect(sqlOnly).toContain("WHERE room.key = 'business-development'")
    expect(sqlOnly).toContain("'role-doctrine', 'Role Doctrine'")
  })

  it('preserves the existing transparent non-sensitive room access model', () => {
    for (const role of ['ae', 'bd', 'anr', 'it', 'legal', 'tms', 'accounting', 'marketing']) {
      expect(sqlOnly).toContain(`('${role}')`)
    }
    expect(sqlOnly).toContain('ON CONFLICT (room_id, role) DO NOTHING')
  })

  it('publishes the approved scope and cross-team ownership boundaries', () => {
    expect(sqlOnly).toContain('BDT opens and qualifies the buyer relationship')
    expect(sqlOnly).toContain('A&Rs connect qualified demand to artists, songwriters and catalogue')
    expect(sqlOnly).toContain('Record labels, publishers, distributors')
    expect(sqlOnly).toContain('Technology partnerships, platform integrations')
    expect(sqlOnly).toContain('Sponsorships, corporate strategic partnerships')
  })

  it('locks the six-month sponsor and AE day-to-day ownership model', () => {
    expect(sqlOnly).toContain('approximately six months')
    expect(sqlOnly).toContain('The receiving AE becomes the primary client contact immediately')
    expect(sqlOnly).toContain('Origin credit is permanent. Operational ownership is transferable')
    expect(sqlOnly).toContain('30-, 90- and 180-day transition reviews')
  })

  it('locks recommendation, senior verifier and organic-buyer boundaries', () => {
    expect(sqlOnly).toContain('recommend verification')
    expect(sqlOnly).toContain('senior BDT Team Member may verify only when explicitly granted')
    expect(sqlOnly).toContain('Organic Buyer Fast Path')
    expect(sqlOnly).toContain('Verify the privilege at the level where it is needed')
    expect(sqlOnly).toContain('pre-authorized the exact song and recording version')
  })

  it('is idempotent and preserves existing Playbook entry history', () => {
    expect(sqlOnly).toMatch(/ON CONFLICT \(key\) DO UPDATE/)
    expect(sqlOnly).toMatch(
      /WHERE NOT EXISTS \([\s\S]*existing\.room_id = room\.id[\s\S]*existing\.title = entry\.title/
    )
    expect(sqlOnly).not.toMatch(/UPDATE public\.playbook_entries/i)
    expect(sqlOnly).not.toMatch(/DELETE FROM public\.playbook_entries/i)
    expect(sqlOnly).not.toMatch(/DROP TABLE/i)
  })

  it('reloads the PostgREST schema cache last', () => {
    expect(sqlOnly.trimEnd().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
