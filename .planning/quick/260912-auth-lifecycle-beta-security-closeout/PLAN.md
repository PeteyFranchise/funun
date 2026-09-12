# Authentication Lifecycle and Beta-Security Closeout — Plan

## Objective

Complete two builds in order:

1. Harden Funūn's email/password authentication lifecycle after the Supabase
   SSR migration.
2. Reconcile the saved 2026-09-10 beta-security audit against current main and
   close any remaining code-level findings without applying owner-gated
   migrations or performing live human tests.

## Scope

### Build 1 — authentication lifecycle

- Fail closed when a callback exchanges no user or invitation claim completion
  fails, including clearing the newly created session before redirecting.
- Use stable public authentication errors rather than raw Supabase/provider
  messages on sign-in, password recovery, and password update surfaces.
- Handle sign-out/account-switch failures without pretending the prior session
  was cleared.
- Preserve role-aware and same-origin post-auth routing.
- Add focused regression tests for missing/malformed callbacks, claim failure,
  safe redirects, generic errors, and session-clearing behavior.
- Record production Auth-rate-limit/CAPTCHA review and real-browser flows as
  deferred owner verification. Supabase Auth already rate-limits its auth
  endpoints; this build will not add a second database dependency in front of
  password authentication.

### Build 2 — beta-security closeout

- Re-read every Critical, High, and Medium finding in the saved audit against
  current routes, libraries, migration candidates, tests, CI, and dependencies.
- Fix only confirmed residual code defects.
- Record rollout-only gates separately from code findings.
- Add a mechanical regression check if the audit-to-code status can otherwise
  silently drift.

## Files expected to change

- `app/auth/callback/route.ts` and focused tests
- `app/(auth)/signin/page.tsx`
- `app/(auth)/forgot-password/page.tsx`
- `app/(auth)/update-password/page.tsx`
- `components/auth/SignOutButton.tsx`
- `components/auth/AccountContextSwitch.tsx`
- focused auth lifecycle tests
- audit/security regression tests or documentation if warranted by evidence
- `.planning/quick/260912-auth-lifecycle-beta-security-closeout/SUMMARY.md`
- `.planning/todos/pending/` owner/live-verification TODOs

## Validation plan

- Focused authentication and security tests.
- Search for raw auth-provider error rendering and unsafe post-auth redirects.
- `npm run security:migrations:verify`.
- `npm run lint`.
- `npm run typecheck:strict`.
- Full Jest suite.
- Both npm dependency audits.
- Production build.
- `git diff --check` and explicit-path review.

## Risks and coordination notes

- Migrations 214–217 remain owner-gated and unapplied; this task will not run
  or repair migration history.
- Production email confirmation must still be coordinated atomically with
  migration 214.
- Stripe and e-sign sandbox concurrency exercises remain human/provider work.
- No push, deployment, Supabase Auth setting change, or production mutation is
  authorized by this build request.
- Native Claude `/gsd-quick` is not callable from Codex, so this directory is
  the required manual GSD fallback.
