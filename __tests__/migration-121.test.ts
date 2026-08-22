import { readFileSync } from 'fs'
import path from 'path'

const sql = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/121_staff_roles_accounting_marketing.sql'),
  'utf8'
)
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')

describe('migration 121 — accounting + marketing staff roles', () => {
  it('widens the primary staff_role CHECK to include the two new roles', () => {
    expect(sql).toContain('funun_staff_staff_role_check')
    expect(sql).toContain("'accounting'")
    expect(sql).toContain("'marketing'")
  })

  it('widens the staff_roles[] set CHECK to include the two new roles', () => {
    expect(sql).toContain('funun_staff_staff_roles_valid')
    // The role set CHECK still requires at least one element and subset-validity.
    expect(sql).toContain('array_length(staff_roles, 1) >= 1')
    expect(sql).toContain('<@ ARRAY')
  })

  it('drops the old constraints first (idempotent DROP/ADD, like 119)', () => {
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS funun_staff_staff_role_check')
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS funun_staff_staff_roles_valid')
  })

  it('reloads the PostgREST schema cache', () => {
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'")
  })
})
