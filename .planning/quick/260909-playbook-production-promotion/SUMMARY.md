# Playbook Production Migration Promotion — Summary

## Outcome

Playbook migrations 201, 202, 204, 205, 206, and 207 are promoted to `supabase/migrations/` under their original numbers. Migration 203 remains permanently retired. Nothing was applied to a database, pushed, or deployed.

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

## Remaining Human Gates

- Peter must run the read-only pre-apply gate and confirm every verdict is `PASS`.
- Peter must paste the six migrations individually in the documented order.
- No automated Supabase migration command should be used for this out-of-order production sequence.
- After application, Peter must run the post-apply verification and the Phase 38 public-schema definer sweep.
- The production migration ledger must be reconciled before any later `supabase db push`.
- Feature controls remain default-off and emergency-disabled until a named beta cohort is approved.
