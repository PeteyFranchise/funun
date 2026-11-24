# Buyer Song Unit Write Freeze Handback

## Baseline

- Branch: `phase46-finding-handoff`
- Baseline commit: `d476a82a`
- State: implementation remains in the working tree; no commit, push, migration or deployment was
  performed.

## What changed

- Added one shared fail-closed 503 response for project-shaped commercial writes. Its copy contains
  no timing promise or dash, and it no longer sends a guessed `Retry-After` horizon.
- Applied the write response after authentication and authorization, and before the first commercial
  mutation, in buyer requests, buyer shortlists, admin deal creation and progression, payment,
  execution, artist project licensing terms and Selects send.
- Completed the frozen admin-deals GET half: while the corresponding read flags are active, the
  route ignores the project-derived `matched` query filter, omits `matched_precleared`, and returns
  no project readiness figure. Its open-state behavior remains covered for eventual flag removal.
- Added route-response coverage for both withheld and open admin-deals states.
- Preserved the underlying executed-deal and Selects state-machine tests by mocking the temporary
  write guard open inside those suites; the guard itself is covered at its shared boundary and by
  per-route ordering locks.

## Released paths

Ownership is handed back to the Phase 50.5 executor for all ten declared frozen paths:

1. `lib/deals/buyer-song-unit-withholding.ts`
2. `app/api/buyer/requests/route.ts`
3. `app/api/buyer/shortlists/route.ts`
4. `app/api/admin/deals/route.ts`
5. `app/api/admin/deals/[id]/route.ts`
6. `app/api/admin/deals/[id]/pay/route.ts`
7. `app/api/admin/deals/[id]/executed/route.ts`
8. `app/api/vault/[projectId]/licensing/route.ts`
9. `app/api/admin/selects/[id]/send/route.ts`
10. `__tests__/buyer-song-unit-write-freeze.test.ts`

The following colocated or cross-cutting tests are also released with the implementation:

- `app/api/admin/deals/route.test.ts`
- `app/api/admin/deals/[id]/executed/route.test.ts`
- `app/api/admin/selects/[id]/send/route.test.ts`
- `__tests__/buyer-song-unit-withheld.test.ts` (stale ownership comment only)

## Validation run

- Focused non-bracketed suites: 4 suites, 78 tests, all passed.
- Literal bracketed route suites with `--runTestsByPath`: 2 suites, 10 tests, all passed.
- `npm run typecheck:strict`: passed.
- `npm run lint`: passed with zero warnings. ESLint printed its existing configuration deprecation
  notice.
- `npm run security:migrations:verify`: passed.
- `npm run marketing:verify`: passed after rerunning outside the filesystem sandbox so `tsx` could
  create its local IPC socket.
- `npm test -- --runInBand`: 681 suites, 8,565 tests, all passed.
- `npm audit --omit=dev --audit-level=moderate`: failed on the known dependency portfolio, reporting
  18 vulnerable packages.
- `npm run audit:gate`: failed on the four known high or critical advisories in `@sentry/nextjs`,
  `next` twice, and `zod`.

## Remaining risks and follow-ups

- The dependency repair remains the repository-wide merge blocker. This handback did not modify
  dependencies or audit policy.
- Browser UAT remains owner-run because the repository uses the Node Jest environment without
  jsdom.
- These guards are containment, not the captured-song implementation. Phase 50.5 must replace them
  with song-level reads and writes before lifting either flag.
- The dirty worktree contains unrelated user-owned changes that were preserved.
