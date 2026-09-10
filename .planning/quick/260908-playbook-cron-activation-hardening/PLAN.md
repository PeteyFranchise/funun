# Playbook Cron Activation Hardening

## Objective

Make the Playbook review and reading reminder RPCs fail closed before the Release 27 activation schema exists and notify only recipients covered by an enabled, non-emergency-stopped feature and an active, unexpired beta-cohort grant.

## Scope

- Revise candidate 201 review reminders in place.
- Revise candidate 202 reading reminders in place.
- Add dedicated reminder feature controls to candidate 207.
- Align every function in candidates 201–202 and 204–206 to `SET search_path = ''` with schema-qualified relations.
- Revoke browser execution from candidate trigger functions in 201 and 204–207.
- Strengthen migration contract tests for installation-window safety, recipient cohort gating, search-path posture, and grants.

## Files expected to change

- `.planning/quick/260907-playbook-doctrine-publication-uat/201_playbook_rich_documents.sql`
- `.planning/quick/260907-playbook-doctrine-publication-uat/202_playbook_reading_operations.sql`
- `.planning/quick/260908-playbook-releases-27-31/207_playbook_operational_v1.sql`
- `.planning/quick/260908-playbook-review-notes/204_playbook_review_threads.sql`
- `.planning/quick/260908-playbook-change-broadcast/205_playbook_change_broadcasts.sql`
- `.planning/quick/260908-playbook-releases-17-26/206_playbook_enablement_platform.sql`
- `__tests__/migration-201-202-playbook.test.ts`
- `__tests__/migration-204-playbook-reviews.test.ts`
- `__tests__/migration-205-playbook-updates.test.ts`
- `__tests__/migration-206-playbook-enablement.test.ts`
- `__tests__/migration-207-playbook-operational-v1.test.ts`
- This plan and its summary

## Validation

- Migration contract tests for candidates 201–202 and 207.
- Search for mutable function search paths and missing browser-role revocations.
- `git diff --check`.

## Coordination and safety

- Keep all candidates outside `supabase/migrations`.
- Do not apply, promote, rename, renumber, commit, push, or deploy.
- Preserve Claude's Phase 38.0.3 work and the reconciled migration ledger.
- A missing activation schema must return zero before any reminder or notification write.
