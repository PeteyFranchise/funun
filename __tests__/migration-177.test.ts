import fs from 'fs'
import path from 'path'

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/177_member_client_partner_coexistence.sql'),
  'utf8'
)

describe('migration 177 — Member and Client Partner coexistence', () => {
  it('uses a normalized auth.users lookup with a fixed search path', () => {
    expect(sql).toContain('public.find_auth_user_id_by_email')
    expect(sql).toContain('FROM auth.users')
    expect(sql).toContain("SET search_path = ''")
    expect(sql).toContain('pg_catalog.lower(account.email)')
    expect(sql).toContain('pg_catalog.btrim(p_email)')
  })

  it('keeps the identity lookup service-only', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated/i)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/i)
    expect(sql).not.toMatch(/TO authenticated\s*;/i)
  })

  it('does not mutate profiles, subscriptions, rights, or account metadata', () => {
    expect(sql).not.toMatch(/UPDATE\s+public\.user_profiles/i)
    expect(sql).not.toMatch(/DELETE\s+FROM/i)
    expect(sql).not.toContain('raw_app_meta_data')
  })
})
