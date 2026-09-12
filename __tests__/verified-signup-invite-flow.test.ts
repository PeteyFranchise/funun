import { readFileSync } from 'fs'
import path from 'path'

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('verified signup invitation flow', () => {
  it('enables confirmation-first auth defaults and a stronger password floor', () => {
    const config = read('supabase/config.toml')
    expect(config).toContain('minimum_password_length = 10')
    expect(config).toContain('enable_confirmations = true')
    expect(config).toContain('secure_password_change = true')
  })

  it('threads the resolved invite capability into signup metadata', () => {
    const signup = read('app/(auth)/signup/page.tsx')
    expect(signup).toContain('body: JSON.stringify({ email: candidateEmail, inviteToken })')
    expect(signup).toContain('signup_invite_token: deepLink.token')
    expect(signup).toContain("fetch('/api/claim-collaborators', { method: 'POST' })")
  })

  it('preserves the invite for an existing member sign-in and redeems it after auth', () => {
    const signup = read('app/(auth)/signup/page.tsx')
    const signin = read('app/(auth)/signin/page.tsx')
    expect(signup).toContain('&invite=${encodeURIComponent(deepLink.token)}')
    expect(signin).toContain("const inviteToken = searchParams.get('invite')")
    expect(signin).toContain('body: JSON.stringify({ inviteToken })')
  })

  it('completes claims from the verified auth callback', () => {
    const callback = read('app/auth/callback/route.ts')
    expect(callback).toContain('completeSignupClaim(createServiceClient(), data.user.id)')
    expect(callback).toContain("signin?error=invite-claim")
  })
})
