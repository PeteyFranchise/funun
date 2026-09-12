# Member sign-in CSP nonce recovery — summary

## Root cause

Production `/signin` was statically prerendered and served from Vercel's cache while middleware attached a fresh nonce-based Content Security Policy to every response. The cached HTML's Next.js script tags had no matching nonce. With `strict-dynamic` active, the browser refused those scripts, so the client-rendered sign-in form never appeared.

The affected Member record was healthy: its email was confirmed, it was not banned, its `user_profiles` row existed, and its auth metadata did not identify it as Funūn staff.

## Fix

- Marked the entire `(auth)` route group `force-dynamic` so Next.js renders authentication pages per request and propagates the middleware nonce to framework scripts.
- Preserved the strict CSP; no `unsafe-inline` script fallback or policy relaxation was added.
- Added a regression test that requires the dynamic-rendering declaration to remain present while middleware owns nonce generation.

## Verification

- Targeted authentication suites: 3 suites, 18 tests passed.
- Strict TypeScript check: passed.
- ESLint: passed; only the existing legacy-configuration deprecation notice remains.
- Production build: passed.
- Build output classifies `/signin`, `/signup`, `/forgot-password`, and `/update-password` as dynamic (`ƒ`) routes.

## Production verification required after deployment

- Confirm `/signin` no longer returns `x-nextjs-prerender: 1`.
- Confirm Next.js script tags carry the response nonce.
- Confirm the email/password form is visible and interactive.
- Complete a real Member sign-in and confirm landing in `/vault`.
