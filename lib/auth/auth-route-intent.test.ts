import { isAccountTransitionSignIn } from '@/lib/auth/auth-route-intent'

describe('account transition sign-in intent', () => {
  it.each(['personal', 'team'])('allows an explicit %s workspace switch to reach sign-in', switchTo => {
    expect(
      isAccountTransitionSignIn({
        pathname: '/signin',
        switchTo,
        accountChanged: null,
      })
    ).toBe(true)
  })

  it('allows account-change recovery to reach sign-in', () => {
    expect(
      isAccountTransitionSignIn({
        pathname: '/signin',
        switchTo: null,
        accountChanged: '1',
      })
    ).toBe(true)
  })

  it.each([
    { pathname: '/signin', switchTo: null, accountChanged: null },
    { pathname: '/signin', switchTo: 'admin', accountChanged: null },
    { pathname: '/signup', switchTo: 'personal', accountChanged: null },
  ])('does not treat ordinary or malformed auth URLs as account transitions', input => {
    expect(isAccountTransitionSignIn(input)).toBe(false)
  })
})
