# Auth Health production readiness summary

## Completed

- Kept migration 218 human-gated and unapplied during implementation; it was
  later applied only in the owner-approved production window recorded below.
- Added a hardened `prune_auth_diagnostic_events()` definer with an empty search path, an exact 30-day boundary, and execute permission restricted to `service_role`.
- Removed direct diagnostic-table deletion permission and per-sign-in cleanup work; service access is now insert/select only.
- Added a protected daily retention route that fails closed on authentication, returns stable errors, and safely reports inactive before migration 218 exists.
- Added time-period, failure-type, and workspace-intent filters to Auth Health.
- Added one-click copying of privacy-safe support correlation references.
- Added checksum-pinned owner instructions and read-only pre-apply, post-apply, and failed-apply probes.
- Extended the beta-security migration verifier through migration 218 and its cron wiring.
- Recorded production and accessibility checks in `HUMAN-TESTING-TODO.md` for a later session.

## Verification

- Final focused tests: 4 suites and 16 tests passed.
- Full suite: 585 suites and 7,114 tests passed; the subsequently added isolated storage regression test also passed in the final focused run.
- TypeScript: passed.
- ESLint: passed with only the repository's existing ESLintRC deprecation warning.
- Migration verifier: passed for migrations 214–218.
- Diff integrity: passed.
- Production bundle: passed. The initial sandboxed run exposed blocked DNS access to `fonts.googleapis.com`; a clean network-enabled build completed successfully after the repository's unusually long local compile. Next emitted only the existing Supabase Edge-runtime compatibility warning and webpack cache-size performance warnings.

## Production state — updated 2026-09-12

- The application package was committed, merged, and deployed before the
  database window.
- Migration 218 passed its four-row production preflight and exact dry run.
- Migration 218 was applied through `supabase db push`, registered by the CLI,
  and passed every row of the hardened post-apply verifier.
- The final ledger showed local and remote version 218 aligned.
- Live Auth Health console, cron-route, accessibility, and support-reference
  behavior checks remain deferred to `HUMAN-TESTING-TODO.md`.
