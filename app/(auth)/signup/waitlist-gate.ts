// Pure gate logic, split out of page.tsx (D-12 Turnstile hardening) —
// Next.js's App Router forbids non-standard named exports from a page.tsx
// file (build-time type error), and this repo has no React
// component-testing infra (jest testEnvironment is 'node', no
// @testing-library/react) to exercise the widget directly, so this is
// kept as a small, independently unit-testable module.
//
// Submit stays disabled while a request is in flight; when a site key IS
// configured (the widget will render) it also stays disabled until a
// token exists. When no site key is configured the widget never renders,
// so a missing token must NOT permanently disable submit.
export function isWaitlistSubmitDisabled(
  wlSubmitting: boolean,
  siteKey: string | undefined,
  turnstileToken: string
): boolean {
  return wlSubmitting || (!!siteKey && !turnstileToken)
}
