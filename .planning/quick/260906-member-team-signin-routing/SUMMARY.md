# Member/Team sign-in routing fix — summary

## Completed

- Added a narrowly scoped account-transition detector for `/signin?switchTo=personal`, `/signin?switchTo=team`, and account-change recovery.
- Updated middleware so an existing session cannot redirect an intentional switch back into the old workspace before credentials are entered.
- Changed successful sign-in to a full browser navigation so protected server layouts read the replacement auth session immediately.
- Added regression coverage for valid switch intents, account-change recovery, malformed values, and ordinary sign-in behavior.

## Verification

- `npx jest __tests__/middleware-auth.test.ts lib/auth/auth-route-intent.test.ts components/auth/account-switch-integration.test.ts lib/auth/session-identity.test.ts --runInBand` — 4 suites, 14 tests passed.
- `npm run typecheck` — passed.
- Targeted ESLint on all changed TypeScript files — passed with zero warnings.
- `git diff --check` — passed.

## Deployment notes

- No database migration or environment variable change is required.
- The application must be deployed before the production sign-in flow receives this fix.
