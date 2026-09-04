import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/174_membership_helper_privacy.sql'),
  'utf8'
)

describe('migration 174 — membership helper privacy', () => {
  it.each([
    'is_project_owner',
    'project_member_role',
    'is_buyer_org_member',
    'is_work_owner',
    'work_member_tier',
    'idea_access_level',
  ])('binds %s to the current caller while preserving internal execution', helper => {
    const start = migration.indexOf(`FUNCTION public.${helper}`)
    expect(start).toBeGreaterThan(-1)
    const body = migration.slice(start, migration.indexOf('$$;', start) + 3)
    expect(body).toContain('p_uid = auth.uid()')
    expect(body).toContain("auth.role() = 'service_role'")
    expect(body).toContain('pg_trigger_depth() > 0')
  })

  it('keeps authenticated execute only because RLS policies require it', () => {
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION public.work_member_tier(UUID, UUID) FROM PUBLIC, anon, authenticated;'
    )
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.work_member_tier(UUID, UUID) TO authenticated;'
    )
  })
})
