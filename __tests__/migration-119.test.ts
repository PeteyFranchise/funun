import { readFileSync } from 'fs'
import path from 'path'

// Structural assertions on migration 119 (Team Members redesign — multi-role).
const sql = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/119_staff_roles_multi.sql'),
  'utf8'
)
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')

describe('migration 119 — multi-role staff', () => {
  it('widens the primary staff_role CHECK to add legal + tms (DROP/ADD pattern)', () => {
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS funun_staff_staff_role_check')
    expect(sql).toContain('ADD CONSTRAINT funun_staff_staff_role_check')
    expect(sql).toMatch(/staff_role IN \('leadership', 'ae', 'bd', 'anr', 'it', 'legal', 'tms'\)/)
  })

  it('adds the authoritative staff_roles array column, backfilled + NOT NULL', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS staff_roles TEXT[]')
    expect(sql).toMatch(/UPDATE public\.funun_staff SET staff_roles = ARRAY\[staff_role\]/)
    expect(sql).toContain('ALTER COLUMN staff_roles SET NOT NULL')
  })

  it('constrains staff_roles to >=1 element, each one of the seven valid roles', () => {
    expect(sql).toContain('ADD CONSTRAINT funun_staff_staff_roles_valid')
    expect(sql).toMatch(/array_length\(staff_roles, 1\) >= 1/)
    expect(sql).toMatch(/staff_roles <@ ARRAY\['leadership', 'ae', 'bd', 'anr', 'it', 'legal', 'tms'\]::text\[\]/)
  })

  it('backfills staff_roles from staff_role on INSERT (deploy-window safety trigger)', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.funun_staff_default_roles()')
    expect(sql).toMatch(/NEW\.staff_roles := ARRAY\[NEW\.staff_role\]/)
    expect(sql).toMatch(/CREATE TRIGGER funun_staff_default_roles_trg\s+BEFORE INSERT ON public\.funun_staff/)
  })

  it('reloads the PostgREST schema cache', () => {
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'")
  })
})
