import { readFileSync } from 'fs'
import path from 'path'

const migration198 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/198_playbook_anr_core_responsibilities.sql'),
  'utf8'
)

const sqlOnly = migration198
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

describe('migration 198 — A&R core responsibilities Playbook doctrine', () => {
  it('activates the A&R room and creates a dedicated doctrine subgroup', () => {
    expect(sqlOnly).toContain("WHERE key = 'ar'")
    expect(sqlOnly).toContain("'role-doctrine', 'Role Doctrine'")
    expect(sqlOnly).toMatch(/ON CONFLICT \(room_id, key\) DO UPDATE/)
  })

  it('publishes a start-here card and all thirteen responsibility cards', () => {
    expect(sqlOnly).toContain('A&R Core Responsibilities — Start Here')
    for (let i = 1; i <= 13; i += 1) {
      expect(sqlOnly).toContain(`${String(i).padStart(2, '0')} —`)
    }
    expect(sqlOnly).toContain("'sop'")
    expect(sqlOnly).toContain("'published'")
  })

  it('locks the AE relationship and broad relevant circulation doctrine', () => {
    expect(sqlOnly).toContain('Internal AE Partnership & Opportunity Circulation')
    expect(sqlOnly).toContain('Cultivate active, trusted working relationships with Funūn Account Executives')
    expect(sqlOnly).toContain('Search across the relevant, permissioned Funūn network for every credible match')
    expect(sqlOnly).toContain('as many genuinely suitable artists and songwriters as practical')
    expect(sqlOnly).toContain('Reach should be broad, but relevance must remain real')
  })

  it('preserves the current responsibility doctrine boundaries', () => {
    expect(sqlOnly).toContain("without taking ownership of the creator''s voice")
    expect(sqlOnly).toContain('not a promise of selection, placement or compensation')
    expect(sqlOnly).toContain('not unnecessary surveillance or private speculation')
    expect(sqlOnly).toContain('not a replacement for judgment, empathy or direct human communication')
  })

  it('is idempotent and does not rewrite or delete Playbook history', () => {
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
