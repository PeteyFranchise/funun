import { readFileSync } from 'fs'
import path from 'path'

const memberRoute = readFileSync(
  path.join(process.cwd(), 'app/api/works/[workId]/members/route.ts'),
  'utf8'
)
const signupPage = readFileSync(
  path.join(process.cwd(), 'app/(auth)/signup/page.tsx'),
  'utf8'
)
const migration214 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/214_verified_invite_claim_hardening.sql'),
  'utf8'
)

describe("Writer's Room invitation destination", () => {
  it('mints the invitation with the exact room as its post-signup destination', () => {
    expect(memberRoute).toContain('nextPath: `/vault/works/${workId}`')
  })

  it('requires a genuine Member account before checking Writer\'s Room access', () => {
    const memberGate = memberRoute.indexOf('requireMemberApiAccount(supabase, authUser)')
    const workAccess = memberRoute.indexOf('resolveWorkAccess(')
    expect(memberGate).toBeGreaterThan(-1)
    expect(workAccess).toBeGreaterThan(memberGate)
  })

  it('uses the guarded destination for both active-session and email-confirmation signup paths', () => {
    expect(signupPage).toContain('const destination = postSignInPath')
    expect(signupPage).toContain('next: inviteStillMatches ? next : null')
    expect(signupPage).toContain("callbackUrl.searchParams.set('next', destination)")
    expect(signupPage).toContain('router.replace(destination)')
  })

  it('creates the user profile at signup but defers collaborator identity until verified redemption', () => {
    const profileInsert = migration214.indexOf('INSERT INTO public.user_profiles (id, handle)')
    const completionFunction = migration214.indexOf(
      'CREATE OR REPLACE FUNCTION public.complete_verified_signup_claim'
    )
    const claim = migration214.indexOf('PERFORM public.claim_collaborators(p_user_id, v_email)')
    expect(profileInsert).toBeGreaterThan(-1)
    expect(completionFunction).toBeGreaterThan(profileInsert)
    expect(claim).toBeGreaterThan(completionFunction)
  })

  it('asks only for the account identity needed to write and defers rights-profile details', () => {
    expect(signupPage).toContain("'Create your account to join the song'")
    expect(signupPage).toContain(
      'You can fill in your profile and rights details later—we’ll help you stay on top of it. For now, let’s write.'
    )
    expect(signupPage).toContain('handle: handle.trim()')
    expect(signupPage).toContain('signup_invite_token: deepLink.token')
    expect(signupPage).not.toContain('legal_name:')
    expect(signupPage).not.toContain('ipi:')
  })
})
