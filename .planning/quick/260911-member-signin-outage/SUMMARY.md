# Member Sign-In Outage — Summary

## Outcome

The local application fix is complete and verified. It is not live until the application is committed and deployed.

## Root cause

Two independent session safeguards combined into an account-switch trap:

1. Middleware redirected an already-authenticated browser away from `/signin`, so a stale Team session could prevent a Member from reaching the credential form that would replace it.
2. After a successful ordinary sign-in, the page navigated before updating the tab-scoped identity marker. `SessionIdentityGuard` could then interpret the intentional Member sign-in as an unexpected cross-tab identity change.

Production read-only checks established that the reported Member identity itself was healthy: confirmed, not banned, backed by a profile, and not classified as staff. The outage was routing/session state, not missing Member data.

## Changes

- `/signin` remains reachable even when the browser has an existing session.
- A successful sign-in records the newly authenticated user and account context before hard navigation.
- Explicit Team/Member account switching still validates that the entered credentials belong to the requested account class.
- Obsolete query-string-only account-transition code and its test were removed.
- Middleware regression tests and account-switch integration tests cover the repaired boundary.

## Verification

- Full Jest: 574 suites, 7,052 tests, all passing.
- ESLint: pass with zero warnings.
- TypeScript: normal and strict checks pass.
- Next.js production build: pass; 151 static pages generated.

## Rollout

Deploy the application, then smoke-test in a clean/incognito window with one real Member account and one Team account. No database migration is required for this specific sign-in repair.
