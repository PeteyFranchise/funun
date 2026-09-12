# Auth Context Regression Automation — Summary

## Outcome

Member/Team account-context protection now runs through deterministic pure
decision functions with direct regression coverage. Real-account and
production-browser checks were moved to a separate deferred human-testing TODO
and were not performed in this build.

## What changed

- Added `resolveInitialSessionIdentity` for protected-layout startup decisions.
- Added `resolveObservedSessionIdentity` for auth events and focus-time checks.
- Centralized fresh switch-intent validation and reject future-dated intent.
- Updated `SessionIdentityGuard` to consume the tested decisions instead of
  maintaining duplicate inline branches.
- Added coverage for:
  - first load and same-account refresh;
  - a valid Member-to-Team switch;
  - wrong-target, expired, and future-dated switch intent;
  - the intentional intermediate sign-out event;
  - unexpected sign-out;
  - cross-tab account replacement;
  - same-account observation; and
  - ordinary sign-out after the tab marker is cleared.
- Added the deferred production test checklist at
  `.planning/todos/pending/2026-09-11-member-team-auth-human-smoke-test.md`.

## Validation

- Focused authentication suite: 3 suites, 19 tests passed.
- Full Jest suite: 575 suites, 7,062 tests passed.
- `npm run typecheck:strict`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; 147 static pages generated and auth pages remained
  dynamically server-rendered.
- `git diff --check`: passed.

## Remaining follow-ups

- Run the deferred human checklist at a later owner-selected time.
- No migration, production deployment, real-account operation, or external
  setting change was part of this build.
