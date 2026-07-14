---
quick: 260714-phase-11-adversarial-fixes
status: complete
completed: 2026-07-14
---

# Phase 11 Adversarial Review Fixes Summary

## What Changed

- Added migration `056_harden_dm_write_privileges.sql` to revoke direct authenticated `INSERT`/`UPDATE` access on `dm_threads` and `dm_messages`.
- Moved `/api/dm/send` thread creation and message insertion onto the service client after session auth, block checks, connection checks, rate-limit checks, and request-state decisions.
- Moved accept/decline/block thread-status transitions onto service-client updates with explicit participant and requester-exclusion predicates.
- Tightened `/api/dm/read/[threadId]` so read markers require a valid UUID and a visible participant thread before upsert.
- Filtered declined threads out of `buildThreadViews()` and cleared stale active thread state when a refresh no longer returns the selected thread.
- Added `migration-056.test.ts` and updated Phase 11 regression tests for the service-owned write boundary.

## Validation Run

```text
npm test -- --runInBand __tests__/migration-056.test.ts __tests__/dm-send-gate.test.ts __tests__/dm-request-routes-review-fixes.test.ts __tests__/dm-request.test.ts __tests__/dm-unread.test.ts __tests__/presence.test.ts
PASS: 6 suites, 52 tests
```

```text
npm run lint
PASS

npx tsc --noEmit
PASS

npm test -- --runInBand
PASS: 24 suites, 163 tests

npm run build
PASS

npm run db:push
PASS: applied 056_harden_dm_write_privileges.sql

npx supabase migration list
PASS: 056 present in LOCAL and REMOTE
```

## Remaining Risks Or Follow-Ups

- Human UAT remains required for two-session presence and browser messaging flows.
