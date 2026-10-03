import { waitlistSubmitState } from './waitlist-gate'

// Pure-logic coverage only (D-12 Turnstile hardening) — this repo has no
// React component-testing infra (jest testEnvironment is 'node', no
// @testing-library/react), so the widget itself is not rendered here.
//
// This asserts the submit-gate contract: disabled while submitting;
// disabled with no site key configured (verification is unavailable, not
// silently skippable — the previous version of this gate enabled submit in
// that state, which the server always rejected; see
// __tests__/waitlist-turnstile-coherence.test.ts for the regression test
// that binds this module to the real server-side verifier); disabled with
// a site key but no token yet; enabled only once both a site key and a
// token exist.
describe('waitlistSubmitState', () => {
  it('is disabled while a submit is in flight, regardless of token/site key', () => {
    expect(waitlistSubmitState({ submitting: true, siteKey: 'site-key', turnstileToken: 'token' })).toEqual({
      disabled: true,
      reason: 'submitting',
    })
    expect(waitlistSubmitState({ submitting: true, siteKey: undefined, turnstileToken: '' })).toEqual({
      disabled: true,
      reason: 'submitting',
    })
  })

  it('is disabled when a site key is configured but no token exists yet', () => {
    expect(waitlistSubmitState({ submitting: false, siteKey: 'site-key', turnstileToken: '' })).toEqual({
      disabled: true,
      reason: 'awaiting-verification',
    })
  })

  it('is enabled once a site key is configured and a token exists', () => {
    expect(
      waitlistSubmitState({ submitting: false, siteKey: 'site-key', turnstileToken: 'a-real-token' })
    ).toEqual({ disabled: false, reason: null })
  })

  it('is disabled with no token when no site key is configured (verification is unavailable, not skippable)', () => {
    expect(waitlistSubmitState({ submitting: false, siteKey: undefined, turnstileToken: '' })).toEqual({
      disabled: true,
      reason: 'verification-unavailable',
    })
  })
})
