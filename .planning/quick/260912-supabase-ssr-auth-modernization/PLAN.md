# Supabase SSR Auth Modernization — Plan

## Objective

Replace the deprecated `@supabase/auth-helpers-nextjs` integration with
`@supabase/ssr` while preserving Funūn's Member/Team session boundaries,
middleware refresh behavior, CSP nonce propagation, and server-only service
client.

## Scope

- Replace the shared browser, server-component/API, and middleware client
  factories.
- Preserve the existing exported factory names so downstream application code
  does not need a broad rewrite.
- Update dependencies and the lockfile.
- Add focused regression tests for cookie reads/writes, middleware response
  propagation, service-role isolation, and removal of deprecated imports.
- Record real-browser Member/Team session checks as a deferred human TODO.
- Do not change database schema, Supabase Auth settings, production state, or
  deploy.

## Files expected to change

- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `middleware.ts`
- `package.json`
- `package-lock.json`
- auth/Supabase regression tests
- `.planning/quick/260912-supabase-ssr-auth-modernization/{PLAN,SUMMARY}.md`
- `.planning/todos/pending/2026-09-12-supabase-ssr-auth-browser-verification.md`

## Validation plan

- Confirm no production import of `@supabase/auth-helpers-nextjs` remains.
- Run focused auth and middleware tests.
- Run strict TypeScript, ESLint, the full Jest suite, dependency audits, and a
  production build.
- Run `git diff --check` and inspect the exact dependency diff.

## Risks and coordination notes

- Middleware must return the same response that receives refreshed auth
  cookies; dropping those cookies can cause random sign-outs.
- Server components may be unable to persist cookie refreshes during render;
  that expected write failure must not break reads because middleware owns the
  refresh path.
- The browser client must not receive the service-role key.
- Human browser verification stays deferred per the owner's instruction for
  this coding session.
