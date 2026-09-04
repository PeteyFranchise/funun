import fs from 'fs'
import path from 'path'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/178_playbook_one_identity_many_roles.sql'),
  'utf8'
)

describe('migration 178 — One Identity, Many Roles Playbook doctrine', () => {
  it('publishes the entry in Company-wide Standards & Doctrine', () => {
    expect(migration).toContain("WHERE key = 'company-wide'")
    expect(migration).toContain("'standards-and-doctrine'")
    expect(migration).toContain(
      "'One Identity, Many Roles — The Funūn Account, Workspace & Access Model v1.0'"
    )
    expect(migration).toMatch(/'sop',[\s\S]*'published'/)
  })

  it('records the three account classes and the relationship-based access boundary', () => {
    expect(migration).toContain('Member Account, Client Partner Account and Funūn Team Member Account')
    expect(migration).toContain('Professional roles describe the person')
    expect(migration).toContain('workspace relationships grant access')
    expect(migration).toContain('never unlocks The Crate')
  })

  it('preserves identity continuity and staff separation', () => {
    expect(migration).toContain('without replacing its login or deleting its profile')
    expect(migration).toContain('revoke only the Client Partner organization relationship')
    expect(migration).toContain('Staff separation')
  })

  it('is idempotent by title', () => {
    expect(migration).toContain('WHERE NOT EXISTS')
    expect(migration).toContain('existing.title = entry.title')
  })
})
