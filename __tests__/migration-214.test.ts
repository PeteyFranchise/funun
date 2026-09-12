import { readFileSync } from 'fs'
import path from 'path'

const sql = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/214_verified_invite_claim_hardening.sql'),
  'utf8'
)

describe('migration 214 verified invite claim hardening', () => {
  it('requires the exact token and exact auth email at signup', () => {
    expect(sql).toContain("NEW.raw_user_meta_data->>'signup_invite_token'")
    expect(sql).toContain('invite_token = v_signup_token')
    expect(sql).toContain('lower(email) = lower(NEW.email)')
    expect(sql).toContain('lower(invited_email) = lower(NEW.email)')
    expect(sql).not.toContain('SELECT 1 FROM public.collaborators WHERE LOWER(email) = LOWER(NEW.email)')
  })

  it('does not accept invitations or claim collaborators in handle_new_user', () => {
    const triggerBody = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.handle_new_user'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.complete_verified_signup_claim')
    )
    expect(triggerBody).not.toContain("SET status = 'accepted'")
    expect(triggerBody).not.toContain('PERFORM public.claim_collaborators')
  })

  it('requires verified email and atomically records the exact claim', () => {
    expect(sql).toContain('email_confirmed_at IS NOT NULL')
    expect(sql).toContain('FOR UPDATE')
    expect(sql).toContain('verified_signup_invite_claims')
    expect(sql).toContain("extensions.digest(v_token, 'sha256')")
    expect(sql).toContain("raw_user_meta_data, '{}'::jsonb) - 'signup_invite_token'")
  })

  it('keeps the claim ledger and function unavailable to browser roles', () => {
    expect(sql).toContain(
      'REVOKE ALL ON public.verified_signup_invite_claims FROM PUBLIC, anon, authenticated, service_role'
    )
    expect(sql).toContain(
      'GRANT SELECT, INSERT ON public.verified_signup_invite_claims TO service_role'
    )
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.complete_verified_signup_claim\(UUID, TEXT\)[\s\S]*FROM PUBLIC, anon, authenticated/
    )
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.complete_verified_signup_claim\(UUID, TEXT\)[\s\S]*TO service_role/
    )
  })
})
