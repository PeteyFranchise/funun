import fs from 'node:fs'
import path from 'node:path'

const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/207_playbook_operational_v1.sql'), 'utf8')

describe('Playbook operational-v1 migration 207', () => {
  it('is explicitly human-gated and depends on the complete migration chain', () => {
    expect(migration).toContain('HUMAN-GATED')
    expect(migration).toContain('201, 202, 204, 205, and 206')
  })

  it('defaults every feature off with emergency disable winning by default', () => {
    expect(migration).toContain('enabled BOOLEAN NOT NULL DEFAULT false')
    expect(migration).toContain('emergency_disabled BOOLEAN NOT NULL DEFAULT true')
    expect(migration).toContain("('review_reminders', 'Playbook Doctrine Review Reminders')")
    expect(migration).toContain("('reading_reminders', 'Playbook Required Reading Reminders')")
    expect(migration).not.toMatch(/rollout_percentage|random\(\)/)
  })

  it('pins dependencies, simulations, and certifications to doctrine revisions', () => {
    expect(migration.match(/source_revision_number INTEGER NOT NULL CHECK \(source_revision_number > 0\)/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('reviews and certifies a simulation atomically through a service-only function', () => {
    expect(migration).toContain('review_playbook_simulation_attempt')
    expect(migration).toContain('FOR NO KEY UPDATE OF a')
    expect(migration).toContain('TO service_role')
  })

  it('uses the hardened empty search path for every candidate function', () => {
    expect(migration).not.toContain('SET search_path = pg_catalog, public')
    expect(migration.match(/SET search_path = ''/g)).toHaveLength(3)
  })

  it('keeps operational links internal and constrained to supported record types', () => {
    expect(migration).toContain("entity_href TEXT NOT NULL CHECK (entity_href ~ '^/')")
    expect(migration).toContain("'member_onboarding','client_partner','deal','release','workspace','buyer_brief','call_log'")
    expect(migration).toContain('link_playbook_operational_record')
  })

  it('enables RLS, revokes browser CRUD, and protects all event ledgers', () => {
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('REVOKE SELECT, INSERT, UPDATE, DELETE')
    expect(migration.match(/BEFORE UPDATE OR DELETE/g)).toHaveLength(3)
  })

  it('does not expose the operational event trigger to browser roles', () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.prevent_playbook_operational_event_mutation\(\)[\s\S]*FROM PUBLIC, authenticated, anon;/)
  })
})
