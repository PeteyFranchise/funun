import { callbackErrorMessage, publicAuthError } from '@/lib/auth/public-errors'

describe('public authentication errors', () => {
  it('never relays provider or database messages', () => {
    const provider = {
      status: 400,
      code: 'invalid_credentials',
      message: 'relation auth.users exposed internal detail',
    }

    expect(publicAuthError('sign-in', provider)).toBe(
      "We couldn't sign you in. Check your email and password and try again."
    )
    expect(publicAuthError('sign-up', provider)).not.toContain(provider.message)
    expect(publicAuthError('password-recovery', provider)).not.toContain(provider.message)
    expect(publicAuthError('password-update', provider)).not.toContain(provider.message)
  })

  it('gives rate limits stable, actionable copy without exposing account state', () => {
    expect(publicAuthError('sign-in', { status: 429 })).toContain('Too many attempts')
    expect(
      publicAuthError('password-recovery', { code: 'over_email_send_rate_limit' })
    ).toContain('Too many reset requests')
  })

  it('maps only known callback error codes', () => {
    expect(callbackErrorMessage('auth')).toContain('invalid or has expired')
    expect(callbackErrorMessage('invite-claim')).toContain('invitation')
    expect(callbackErrorMessage('signout')).toContain('signing out')
    expect(callbackErrorMessage('switch-signout')).toContain('previous account')
    expect(callbackErrorMessage('database relation leaked')).toBeNull()
    expect(callbackErrorMessage(null)).toBeNull()
  })
})
