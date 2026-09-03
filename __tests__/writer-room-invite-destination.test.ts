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
const migration133 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/133_handle_identity.sql'),
  'utf8'
)

describe("Writer's Room invitation destination", () => {
  it('mints the invitation with the exact room as its post-signup destination', () => {
    expect(memberRoute).toContain('nextPath: `/vault/works/${workId}`')
  })

  it('uses the guarded destination for both active-session and email-confirmation signup paths', () => {
    expect(signupPage).toContain('const destination = postSignInPath')
    expect(signupPage).toContain('next: inviteStillMatches ? next : null')
    expect(signupPage).toContain("callbackUrl.searchParams.set('next', destination)")
    expect(signupPage).toContain('router.replace(destination)')
  })

  it('creates the user profile before claiming the collaborator identity', () => {
    const profileInsert = migration133.indexOf('INSERT INTO public.user_profiles (id, handle)')
    const claim = migration133.indexOf('PERFORM public.claim_collaborators(NEW.id, NEW.email)')
    expect(profileInsert).toBeGreaterThan(-1)
    expect(claim).toBeGreaterThan(profileInsert)
  })

  it('asks only for the account identity needed to write and defers rights-profile details', () => {
    expect(signupPage).toContain("'Create your account to join the song'")
    expect(signupPage).toContain(
      'You can fill in your profile and rights details later—we’ll help you stay on top of it. For now, let’s write.'
    )
    expect(signupPage).toContain('data: { handle: handle.trim() }')
  })
})
