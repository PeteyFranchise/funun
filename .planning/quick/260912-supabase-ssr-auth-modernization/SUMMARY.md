# Supabase SSR Auth Modernization — Summary

## Completed

- Replaced the deprecated `@supabase/auth-helpers-nextjs` package with
  `@supabase/ssr` across the shared browser, server, API, and middleware
  clients.
- Preserved the existing `createClient`, `createServerClient`,
  `createApiClient`, and `createServiceClient` exports to avoid a broad caller
  rewrite.
- Implemented the current `getAll` / `setAll` cookie contract in middleware.
  Refreshed cookies are applied to both the forwarded request and browser
  response, and Supabase-provided cache headers are retained.
- Preserved CSP nonce propagation and carried refreshed auth state onto early
  unauthorized and redirect responses.
- Kept the service-role client separate, server-only, and configured without
  session persistence or automatic token refresh.
- Added focused regression coverage and recorded real-browser checks as a
  deferred human TODO.

## Dependency decision

Funūn CI currently runs Node.js 20. The latest Supabase SSR dependency line
pulls a Supabase JS version requiring Node.js 22, so this change deliberately
pins the newest pair verified compatible with Node.js 20:

- `@supabase/ssr`: `0.10.0`
- `@supabase/supabase-js`: `2.109.0`

The exact pins prevent a later install from silently crossing the runtime
boundary before CI and production are upgraded together.

## Verification

- Focused Supabase/auth/middleware tests: passed (8 tests).
- Full Jest suite: passed (577 suites, 7,072 tests).
- Strict TypeScript: passed.
- ESLint with zero warnings: passed; ESLint emitted only its existing legacy
  configuration deprecation notice.
- Production dependency audit at moderate severity: 0 vulnerabilities.
- Full dependency audit at high severity: 0 vulnerabilities.
- Beta migration safety verifier: passed.
- Production build: completed compilation, static generation, optimization,
  and emitted `.next/BUILD_ID`. It retains the existing Supabase Edge Runtime
  `process.version` compatibility warning; no build error was reported.
- `git diff --check`: passed.
- Deprecated helper imports in application/shared auth code: none.

## Deferred

Live Member, Team Member, context-switching, session-refresh, sign-out,
recovery, email-confirmation, CSP, and cache-header browser checks are recorded
in `.planning/todos/pending/2026-09-12-supabase-ssr-auth-browser-verification.md`.

## Production impact

No database migration, Supabase Auth setting change, deployment, or push was
performed as part of this build.
