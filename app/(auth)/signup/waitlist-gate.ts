// Pure gate logic, split out of page.tsx (D-12 Turnstile hardening) —
// Next.js's App Router forbids non-standard named exports from a page.tsx
// file (build-time type error), and this repo has no React
// component-testing infra (jest testEnvironment is 'node', no
// @testing-library/react) to exercise the widget directly, so this is
// kept as a small, independently unit-testable module.
//
// This gate exists for one reason: never offer a submit the server will
// refuse. The authority it mirrors is app/api/waitlist/route.ts (which
// hard-rejects an empty/missing token before any DB call) and
// lib/security/turnstile.ts's verifyTurnstileToken (fail-closed on a
// missing site configuration or a missing token). It is NOT a second
// description of that contract — __tests__/waitlist-turnstile-coherence.test.ts
// imports both this function and the real verifyTurnstileToken and fails
// if they ever disagree again (quick task 261002-wtl; see
// Skill("label-integrity-funun") for why a predicate that only *describes*
// a contract it doesn't enforce is itself a defect).
export type WaitlistSubmitReason = 'submitting' | 'verification-unavailable' | 'awaiting-verification' | null

export type WaitlistSubmitState = {
  disabled: boolean
  reason: WaitlistSubmitReason
}

export function waitlistSubmitState({
  submitting,
  siteKey,
  turnstileToken,
}: {
  submitting: boolean
  siteKey: string | undefined
  turnstileToken: string
}): WaitlistSubmitState {
  if (submitting) return { disabled: true, reason: 'submitting' }
  if (!siteKey) return { disabled: true, reason: 'verification-unavailable' }
  if (!turnstileToken) return { disabled: true, reason: 'awaiting-verification' }
  return { disabled: false, reason: null }
}
