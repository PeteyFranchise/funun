# Auth Context Regression Automation — Plan

## Objective

Turn the recent Member sign-in and Member/Team account-context failures into
deterministic automated regression coverage, while moving all real-account and
production-browser verification into a deferred human-testing TODO.

## Scope

- Record a later human smoke-test checklist without running it this session.
- Extract the Session Identity Guard's initial and observed-session decisions
  into pure, testable functions.
- Cover ordinary refresh, intentional switching, expired/tampered switch
  intent, cross-tab account replacement, and sign-out behavior.
- Keep Supabase authentication, account classification, and protected-route
  authorization behavior unchanged.

## Files expected to change

- `.planning/todos/pending/2026-09-11-member-team-auth-human-smoke-test.md`
- `lib/auth/session-identity.ts`
- `lib/auth/session-identity.test.ts`
- `components/auth/SessionIdentityGuard.tsx`
- `.planning/quick/260911-auth-context-regression-automation/SUMMARY.md`

## Validation plan

- Run the focused authentication tests.
- Run strict TypeScript checking.
- Run ESLint on the changed TypeScript files.
- Run `git diff --check` and inspect repository status.

## Risks and coordination notes

- No production credentials, real-account login, browser smoke test, database
  write, migration apply, deployment, or GitHub setting change is in scope.
- The decision helpers must preserve the current user-facing account-change
  modal behavior while refusing malformed, expired, or future-dated intent.
