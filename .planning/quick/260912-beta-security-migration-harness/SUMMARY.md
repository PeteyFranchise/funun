# Beta Security Migrations 214–217 Harness — Summary

## Completed

- Wrapped migrations 214–217 in explicit transactions.
- Removed collision-silent target DDL so an unexpected existing table, column,
  or unique index aborts instead of being accepted implicitly.
- Explicitly revoked direct execution of the trigger-only
  `public.handle_new_user()` function.
- Added one-statement, read-only pre-apply, post-apply, and failed-apply SQL
  probes.
- Added a checksum-pinned owner runbook with a dry-run gate, exact migration
  order, failure stop conditions, and no manual-ledger-repair rule.
- Added a one-command static verifier and Jest regression coverage.
- Deferred provider and production behavior tests to a named pending TODO.

## Initial authoring safety outcome

No production database connection, migration application, migration repair,
Supabase Auth configuration change, provider call, deployment, commit, or push
was performed during the original authoring session. The later owner-approved
production window is recorded below.

## Verification

- `npm run security:migrations:verify` — passed.
- Focused migration/harness tests — 5 suites, 20 tests passed.
- `npm run typecheck:strict` — passed.
- `npm run lint` — passed.
- Full Jest suite — 576 suites, 7,066 tests passed.
- `npm run build` — passed (Next.js production build, 147 static pages).
- `git diff --check` — passed.

## Originally deferred

The production preflight, owner apply, and post-apply verification were
originally deferred and were completed in the production window below. Auth
setting coordination and live behavior checks remain deferred. See
`.planning/todos/pending/2026-09-12-beta-security-migrations-live-verification.md`.

## Production recovery note — 2026-09-12

Migration 214 was applied directly but not registered after an incorrect
operator instruction. Definition-level review confirmed the table, trigger,
functions, token binding, and function ACLs, but exposed an inherited Supabase
default grant: `service_role` retained full table privileges on the intended
append-only claim ledger. Migration 214 now revokes from `service_role` before
granting only `INSERT` and `SELECT`. The package includes a read-only exact-state
gate and a narrow ACL-only recovery script. Migration 214 remained
unregistered and migration 215 remained unapplied until that recovery and the
full definition-level verifier both passed.

## Production outcome — 2026-09-12

- The ACL-only migration-214 recovery passed its four-row preflight and made no
  application-row changes.
- Migration 214 passed seven definition-level checks before its ledger entry
  was repaired to match the already-applied production state.
- A recovery-aware preflight for 215–217 passed all eight checks.
- The guarded dry run listed exactly 215, 216, and 217; migration 218 was held
  outside the CLI scan and restored automatically.
- Migrations 215–217 were applied through `supabase db push` and registered by
  the CLI.
- The complete 214–217 post-apply verifier passed every row, including exact
  service-role table privileges and all function ACL/search-path checks.
- The final migration ledger showed local and remote versions aligned through
  217. Provider/live behavior checks remain deferred to the named human TODO.
