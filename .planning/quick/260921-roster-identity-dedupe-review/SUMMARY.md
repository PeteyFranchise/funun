# Roster Identity Dedupe Review Summary

## What Changed

- Added `.planning/reviews/CODEX-RESPONSE-260921-roster-identity-dedupe.md` with the requested evidence-based review.
- Defined owner-scoped claimed identity as authoritative and normalized email as the unclaimed fallback.
- Recommended reusing/reactivating the existing row ID, database uniqueness on both identity axes, and a service-only transactional resolver RPC.
- Proposed human-gated constraint and preflight SQL without creating or applying a migration.
- Covered legacy duplicate consolidation across split-sheet parties, work members, Song Passport values, invitations, mutable JSON references, and historical diary payloads.
- Made no application-code or migration changes and applied no SQL.

## Validation Run

- `npx jest --runInBand app/api/collaborators/route.test.ts app/api/collaborators/quick-invite/route.test.ts __tests__/migration-148.test.ts __tests__/migration-179.test.ts __tests__/claim-collaborators-rpc.test.ts` — PASS: 5 suites, 30 tests.
- Confirmed the requested top-level headings are present in order.
- Confirmed the report and planning files contain no trailing whitespace.
- Confirmed `.planning/reviews/CODEX-RESPONSE-260921-roster-identity-dedupe.md` is nonempty and persisted on disk.
- Preserved the pre-existing untracked prompt and made no branch, commit, push, deployment, or production changes.

## Remaining Risks Or Follow-Ups

- Production duplicate counts and field conflicts were not queried; the proposed migration intentionally stops until a privileged human-reviewed reconciliation is ready.
- Migration numbering remains unassigned because 228 is already discussed for deferred storage attribution and Phase 41 requires checking the live ledger at planning time.
- The exact mutable JSON inventory and the full duplicate-repair SQL must be refreshed against the implementation commit.
- Real concurrent database tests are required; current mocked route tests prove sequential behavior only.
