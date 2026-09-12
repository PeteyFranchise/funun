import { readFileSync } from 'fs'
import path from 'path'

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('Team and Personal account-switch integration', () => {
  it('wraps both protected workspace layouts in the per-tab identity guard', () => {
    const artistLayout = source('app/(artist)/layout.tsx')
    const adminLayout = source('app/(admin)/layout.tsx')
    expect(artistLayout).toContain('<SessionIdentityGuard')
    expect(artistLayout).toContain("context: 'personal'")
    expect(adminLayout).toContain('<SessionIdentityGuard')
    expect(adminLayout).toContain("context: 'team'")
  })

  it('requires target-class verification after an intentional switch sign-in', () => {
    const signIn = source('app/(auth)/signin/page.tsx')
    expect(signIn).toContain('signedInContext !== switchTo')
    expect(signIn).toContain("supabase.auth.signOut({ scope: 'local' })")
    expect(signIn).toContain('accountWorkspaceHome(switchTo)')
    expect(signIn).toContain('window.location.assign(')
  })

  it('accepts an intentional ordinary sign-in as the new identity for that tab', () => {
    const signIn = source('app/(auth)/signin/page.tsx')
    const finalizeAt = signIn.indexOf('finishAccountSwitch({')
    const navigateAt = signIn.indexOf('window.location.assign(')

    expect(finalizeAt).toBeGreaterThan(-1)
    expect(navigateAt).toBeGreaterThan(finalizeAt)
    expect(signIn).toContain('context: signedInContext')
    expect(signIn).toContain('userId: data.user.id')
  })

  it('clears the tab identity marker only after ordinary sign-out succeeds', () => {
    const signOut = source('components/auth/SignOutButton.tsx')
    const providerSignOutAt = signOut.indexOf("signOut({ scope: 'local' })")
    const clearMarkerAt = signOut.indexOf('clearTabIdentity()')

    expect(providerSignOutAt).toBeGreaterThan(-1)
    expect(clearMarkerAt).toBeGreaterThan(providerSignOutAt)
    expect(signOut).toContain('`/signin?error=signout&ref=${reference}`')
  })

  it('preserves the account-switch intent and exposes a stable cleanup failure', () => {
    const accountSwitch = source('components/auth/AccountContextSwitch.tsx')
    const beginAt = accountSwitch.indexOf('beginAccountSwitch(targetContext)')
    const signOutAt = accountSwitch.indexOf("signOut({ scope: 'local' })")

    expect(beginAt).toBeGreaterThan(-1)
    expect(signOutAt).toBeGreaterThan(beginAt)
    expect(accountSwitch).toContain('error=switch-signout')
  })
})
