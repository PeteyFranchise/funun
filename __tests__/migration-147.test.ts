import { readFileSync } from 'fs'
import path from 'path'

const migration147 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/147_artist_capability_on_signup.sql'),
  'utf8'
)

const sqlOnly = migration147
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

describe('migration 147 — artist capability on signup', () => {
  it('runs after the existing auth-user provisioning trigger', () => {
    expect(sqlOnly).toContain('CREATE TRIGGER zz_grant_artist_capability_on_signup')
    expect('zz_grant_artist_capability_on_signup' > 'on_auth_user_created').toBe(true)
    expect(sqlOnly).toContain('AFTER INSERT ON auth.users')
  })

  it('grants approved artist access only to the self-serve artist lane', () => {
    expect(sqlOnly).toContain("NEW.raw_user_meta_data->>'handle'")
    expect(sqlOnly).toContain("NEW.raw_user_meta_data->>'provision_intent_id'")
    expect(sqlOnly).toContain("NEW.raw_app_meta_data->>'role'")
    expect(sqlOnly).toContain("NEW.raw_app_meta_data->>'staff_role'")
    expect(sqlOnly).toContain("profile.member_type = 'artist'")
    expect(sqlOnly).toMatch(/NEW\.id,[\s\S]*'artist',[\s\S]*'approved',[\s\S]*'signup'/)
  })

  it('backfills artist profiles that have no active artist grant', () => {
    expect(sqlOnly).toContain("'backfill'")
    expect(sqlOnly).toContain("grant_row.capability = 'artist'")
    expect(sqlOnly).toContain("grant_row.status IN ('pending', 'approved')")
    expect(sqlOnly).toContain('ON CONFLICT DO NOTHING')
  })

  it('does not weaken capability-table permissions or rewrite prior migrations', () => {
    expect(sqlOnly).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE)/i)
    expect(sqlOnly).not.toMatch(/UPDATE\s+public\.capability_grants/i)
    expect(sqlOnly).not.toMatch(/DELETE\s+FROM\s+public\.capability_grants/i)
  })
})
