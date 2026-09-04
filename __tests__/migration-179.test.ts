import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/179_existing_member_collaborator_reconciliation.sql'),
  'utf8'
)

const sqlOnly = migration
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

describe('migration 179 — existing Member collaborator reconciliation', () => {
  it('links both new and email-edited collaborator rows automatically', () => {
    expect(sqlOnly).toContain('BEFORE INSERT OR UPDATE OF email ON public.collaborators')
    expect(sqlOnly).toContain('INTO NEW.claimed_by')
    expect(sqlOnly).toContain("NEW.status := 'confirmed'")
  })

  it('requires a confirmed auth identity with a canonical Member profile', () => {
    expect(sqlOnly).toContain('FROM auth.users account')
    expect(sqlOnly).toContain('JOIN public.user_profiles member_profile ON member_profile.id = account.id')
    expect(sqlOnly).toContain('account.email_confirmed_at IS NOT NULL')
    expect(sqlOnly).toContain('pg_catalog.lower(pg_catalog.btrim(account.email))')
    expect(sqlOnly).toContain('pg_catalog.lower(pg_catalog.btrim(NEW.email))')
  })

  it('never replaces an established claim', () => {
    expect(sqlOnly).toContain('IF NEW.claimed_by IS NULL')
    expect(sqlOnly).toContain('WHERE collaborator.claimed_by IS NULL')
  })

  it('repairs stale existing rows with the same verified identity rules', () => {
    expect(sqlOnly).toMatch(
      /UPDATE public\.collaborators collaborator[\s\S]*SET claimed_by = account\.id[\s\S]*FROM auth\.users account/
    )
    expect(sqlOnly).toContain('pg_catalog.lower(pg_catalog.btrim(collaborator.email))')
  })

  it('keeps the trigger function private and fixes its search path', () => {
    expect(sqlOnly).toContain('SECURITY DEFINER')
    expect(sqlOnly).toContain("SET search_path = ''")
    expect(sqlOnly).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated/i)
    expect(sqlOnly).not.toMatch(/GRANT EXECUTE[\s\S]*TO authenticated/i)
  })
})
