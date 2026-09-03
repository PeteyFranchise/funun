import { readFileSync } from 'fs'
import path from 'path'

const migration157 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/157_first_sign_in_experience.sql'),
  'utf8'
)

const sqlOnly = migration157
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

describe('migration 157 — first-sign-in experience', () => {
  it('adds private completion state without a default for future profiles', () => {
    expect(sqlOnly).toContain('ADD COLUMN first_sign_in_completed_at TIMESTAMPTZ')
    expect(sqlOnly).not.toMatch(/first_sign_in_completed_at\s+TIMESTAMPTZ\s+DEFAULT/i)
  })

  it('backfills every existing profile so established users are not re-onboarded', () => {
    expect(sqlOnly).toMatch(
      /UPDATE public\.user_profiles[\s\S]*SET first_sign_in_completed_at = now\(\)[\s\S]*WHERE first_sign_in_completed_at IS NULL/
    )
  })

  it('does not expose the private field through browser column grants', () => {
    expect(sqlOnly).not.toMatch(/GRANT\s+(SELECT|UPDATE)[\s\S]*first_sign_in_completed_at/i)
  })

  it('accepts pending collaborator invites when signup claims the roster profile', () => {
    expect(sqlOnly).toContain('CREATE TRIGGER collaborator_invites_accept_on_claim')
    expect(sqlOnly).toContain('AFTER UPDATE OF claimed_by ON public.collaborators')
    expect(sqlOnly).toMatch(
      /SET status = 'accepted',[\s\S]*accepted_user_id = NEW\.claimed_by,[\s\S]*WHERE collaborator_id = NEW\.id[\s\S]*status = 'pending'/
    )
  })

  it('reconciles pending invitations for collaborator profiles claimed before this trigger', () => {
    expect(sqlOnly).toMatch(
      /UPDATE public\.collaborator_invites invite[\s\S]*FROM public\.collaborators collaborator[\s\S]*collaborator\.claimed_by IS NOT NULL[\s\S]*invite\.status = 'pending'/
    )
  })

  it('locks down the claim trigger function', () => {
    expect(sqlOnly).toContain('SECURITY DEFINER')
    expect(sqlOnly).toContain("SET search_path = ''")
    expect(sqlOnly).toContain(
      'REVOKE ALL ON FUNCTION public.accept_collaborator_invites_on_claim() FROM PUBLIC'
    )
  })

  it('reloads the PostgREST schema cache last', () => {
    expect(sqlOnly.trimEnd().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
