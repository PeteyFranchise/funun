import { isWaitlistSubmitDisabled } from './waitlist-gate'

// Pure-logic coverage only (D-12 Turnstile hardening) — this repo has no
// React component-testing infra (jest testEnvironment is 'node', no
// @testing-library/react), so the widget itself is not rendered here.
// This asserts the submit-gate contract: disabled while submitting, and
// disabled on a missing token ONLY when a site key is actually configured
// (no site key means the widget never renders, so a missing token must not
// permanently block submit).
describe('isWaitlistSubmitDisabled', () => {
  it('is disabled while a submit is in flight, regardless of token/site key', () => {
    expect(isWaitlistSubmitDisabled(true, 'site-key', 'token')).toBe(true)
    expect(isWaitlistSubmitDisabled(true, undefined, '')).toBe(true)
  })

  it('is disabled when a site key is configured but no token exists yet', () => {
    expect(isWaitlistSubmitDisabled(false, 'site-key', '')).toBe(true)
  })

  it('is enabled once a site key is configured and a token exists', () => {
    expect(isWaitlistSubmitDisabled(false, 'site-key', 'a-real-token')).toBe(false)
  })

  it('is enabled with no token when no site key is configured (widget never renders)', () => {
    expect(isWaitlistSubmitDisabled(false, undefined, '')).toBe(false)
  })
})
