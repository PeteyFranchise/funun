# Playbook Production Migration Promotion — Summary

## Outcome

Playbook migrations 201, 202, 204, 205, 206, and 207 are promoted and applied
to production under their original numbers. Migration 213 repaired residual
browser table grants from 201, 202, and 204. Migration 203 remains permanently
retired. All seven applied rows are registered in the remote migration ledger;
no feature control was enabled.

## Changes

- Moved all six migration candidates from their `.planning/quick/` locations to the active migration directory without renumbering.
- Preserved the hardened empty search path and explicit browser-role revokes on all 21 functions.
- Added explicit `BEGIN` and `COMMIT` boundaries to migrations 201 and 202; migrations 204–207 were already transactional.
- Reworded the only two non-SQL phrases matching the Supabase SQL Editor's naïve `INTO` scanner.
- Updated migration contract tests to read the promoted files.
- Added a promotion contract test that cross-checks all created tables and functions, all eight deployed route mappings, transaction boundaries, retired migration 203, and the apply-manifest hashes.
- Updated the authoritative migration ledger in `.planning/ROADMAP.md` to say promoted but unapplied.
- Added `PRE-APPLY-GATE.sql`, `APPLY-SEQUENCE.md`, and `POST-APPLY-VERIFY.sql` for the owner-run production window.

## Verification

- `npx tsc --noEmit` passed.
- `npx jest --runInBand` passed: 563 suites, 6,982 tests.
- Targeted promotion and migration-contract run passed: 6 suites, 40 tests.
- `git diff --check` passed.
- Static dependency scan found no reference from migrations 201–207 to any helper changed by migrations 200 or 208–210, including either form of `no_block`.
- Function audit: 21 created functions, 21 empty search paths, and an explicit `REVOKE ALL ... FROM PUBLIC, authenticated, anon` for every function.
- Transaction audit: exactly one `BEGIN` and one `COMMIT` in each promoted migration.
- The pre-apply and post-apply SQL artifacts contain zero `into\s+[a-z]` matches.
- Every remaining match in the six promoted migrations is a real SQL `INSERT INTO`, `SELECT ... INTO`, or `RETURNING ... INTO` clause.

## Unanticipated Finding

Migrations 201 and 202 lacked explicit transaction boundaries. That was unsafe for manual SQL Editor application because a later-statement failure could leave a partial schema. Both are now independently atomic.

## Human Gates

- Completed: pre-apply gate, supervised migration sequence, focused stage
  checks, post-apply verification, Phase 38 structural recheck, and migration
  ledger reconciliation.
- Deferred by owner: signed-in behavioral UAT across the eight Playbook route
  families with both authorized and denied Team Member states.
- Still gated: feature controls remain default-off and emergency-disabled until
  Peter approves a named beta cohort.

## Production Window Update — 2026-09-10

- Reconciled manually applied migration-history rows 199, 200, 208, 209, and
  210 after live-object verification.
- Corrected an ambiguous `column_name` reference in the read-only pre-apply
  gate; the rerun completed with 279/279 PASS and zero STOP rows.
- Applied, behaviorally checkpointed, and registered migrations 201 and 202.
  Both reminder functions returned zero while activation controls were absent.
- Migration 204 committed and passed its table/function/trigger/RLS checks, but
  the browser-grant check stopped: all twelve tables created by 201, 202, and
  204 retained direct `REFERENCES`, `TRIGGER`, and `TRUNCATE` grants for both
  `anon` and `authenticated`. RLS does not govern `TRUNCATE`.
- Stopped before registering 204 or applying 205. Migration 213 is the approved
  privilege-only repair; pending migrations 205–207 now revoke all table
  privileges from browser roles at creation time.
- Migration 213 passed its 38-row pre-apply gate, committed, and left zero
  browser-role table grants. Migrations 204 and 213 were then registered.
- Migrations 205 and 206 committed, passed their focused production verifiers,
  and were registered.
- Migration 207's first transaction failed on misplaced `NULLS NOT DISTINCT`
  index syntax. The rollback probe proved all fourteen tables and all three
  functions absent and version 207 unregistered. The index syntax was corrected,
  a regression assertion was added, and the retry committed successfully.
- Migration 207 passed all seven focused production checks: tables, RLS, zero
  browser grants, hardened functions, triggers, fail-closed controls, and the
  corrected SLA unique index.
- `POST-APPLY-VERIFY.sql` passed **114/114** with zero `STOP` or `FAIL` rows.
- The remote ledger now aligns locally and remotely for 199–202, 204–210, and
  213. Migration 203 remains intentionally absent and retired.
- The post-migration-210 Phase 38 A2 structural verifier remained clean after
  the Playbook apply: exposed public definers stayed at 48, all eleven
  `private.no_block` policy references remained qualified, both body callers
  remained retargeted, and no new browser-exposed definer appeared. Total
  public definers rose from the verifier's pre-Playbook expectation of 107 to
  114 because this workstream installed seven internal/service-only functions;
  the exposed count did not rise.
- Updated that verifier's total-definer baseline to 114 while preserving its
  security-sensitive exposed-definer target of 48, and added a regression test
  so future service-only additions cannot be mistaken for new browser exposure.
- Post-fix local verification passed: `npx tsc --noEmit`, four focused migration
  suites (26 tests), the complete `npx jest --runInBand` suite, and
  `git diff --check`.

## Remaining Verification

- Exercise the eight Playbook route families with an authorized Team Member
  and a revoked or unauthorized Team Member.
- Keep all six migration-207 feature controls disabled and emergency-disabled
  until Peter explicitly approves a named beta cohort.
