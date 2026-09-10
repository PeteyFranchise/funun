# Playbook Production Migration Promotion

## Objective

Promote Playbook migration candidates 201, 202, 204, 205, 206, and 207 into the active migration directory without renumbering or applying them, and prepare owner-run read-only pre-apply and post-apply verification plus a dependency-safe paste sequence.

The production portion was subsequently authorized and completed by Peter on
2026-09-10. The historical objective above describes the promotion stage; the
production outcome and remaining behavioral UAT are recorded in `SUMMARY.md`.

## Scope

- Reconfirm candidate search-path hardening and independence from migrations 200 and 208–210.
- Reconfirm migration numbers immediately before promotion; preserve retired number 203.
- Move the six candidate SQL files into `supabase/migrations/` and update migration contract tests to read the promoted paths.
- Add a production pre-apply gate using object identity lookups.
- Add an owner-run apply sequence with explicit dependency and pause guidance.
- Add a read-only post-apply verification covering table existence, RLS, grants, functions, routes, and the storage bucket.
- Repair the production browser-role table-grant defect discovered after 204:
  harden unapplied migrations 205–207 and add migration 213 for the twelve
  tables already created by 201, 202, and 204.
- Check every promoted migration and SQL verification artifact for the Supabase SQL Editor's false-positive `INTO <word>` pattern.

## Files Expected to Change

- `supabase/migrations/201_playbook_rich_documents.sql`
- `supabase/migrations/202_playbook_reading_operations.sql`
- `supabase/migrations/204_playbook_review_threads.sql`
- `supabase/migrations/205_playbook_change_broadcasts.sql`
- `supabase/migrations/206_playbook_enablement_platform.sql`
- `supabase/migrations/207_playbook_operational_v1.sql`
- The six former candidate paths under `.planning/quick/`
- `__tests__/migration-201-202-playbook.test.ts`
- `__tests__/migration-204-playbook-reviews.test.ts`
- `__tests__/migration-205-playbook-updates.test.ts`
- `__tests__/migration-206-playbook-enablement.test.ts`
- `__tests__/migration-207-playbook-operational-v1.test.ts`
- `.planning/quick/260909-playbook-production-promotion/PRE-APPLY-GATE.sql`
- `.planning/quick/260909-playbook-production-promotion/APPLY-SEQUENCE.md`
- `.planning/quick/260909-playbook-production-promotion/POST-APPLY-VERIFY.sql`
- `.planning/quick/260909-playbook-production-promotion/SUMMARY.md`
- `supabase/migrations/213_playbook_browser_table_grant_hardening.sql`
- `.planning/quick/260909-playbook-production-promotion/PRE-APPLY-GATE-213.sql`
- `__tests__/migration-213-playbook-browser-grants.test.ts`
- `.planning/quick/260909-playbook-production-promotion/VERIFY-202.sql`
- `.planning/quick/260909-playbook-production-promotion/VERIFY-204.sql`
- `.planning/quick/260909-playbook-production-promotion/VERIFY-204-GRANTS.sql`
- `.planning/quick/260909-playbook-production-promotion/VERIFY-201-204-GRANTS.sql`
- `.planning/quick/260909-playbook-production-promotion/VERIFY-205.sql`
- `.planning/quick/260909-playbook-production-promotion/VERIFY-206.sql`
- `.planning/quick/260909-playbook-production-promotion/VERIFY-207-ROLLBACK.sql`
- `.planning/quick/260909-playbook-production-promotion/VERIFY-207.sql`
- `.planning/phases/38.0.3-rls-helper-api-exposure/38.0.3-VERIFY-A2-NO-BLOCK.sql`

## Validation

- Verify candidate checksums/content are unchanged by promotion.
- Run the Playbook migration contract tests, `npx tsc --noEmit`, and the full Jest suite.
- Run `git diff --check`.
- Confirm migration 203 remains absent and migrations 200/208/209/210 are untouched.
- Report the case-insensitive `into\s+[a-z]` scan verbatim and eliminate every non-SQL occurrence.

## Risks and Coordination

- Do not open a database connection or run any Supabase command.
- Do not apply, push, or deploy anything.
- Do not edit migrations 200, 208, 209, or 210 or the parallel-session protected application areas.
- Because production already has 208–210, migration-history reconciliation remains an owner responsibility before any CLI-based database workflow.
- The SQL files remain human-gated even after promotion.
