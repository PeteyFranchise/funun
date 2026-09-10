# Playbook Cron Activation Hardening — Summary

## Outcome

Candidates 201, 202, and 207 are revised locally so scheduled Playbook reminders fail closed across the migration window and notify only explicitly activated beta-cohort recipients. Nothing was promoted, applied, committed, pushed, or deployed.

## Changes

- Candidate 201's doctrine-review reminder RPC returns `0` when any Release 27 activation table is absent.
- Candidate 202's required-reading reminder RPC uses the same fail-closed installation guard.
- Candidate 207 seeds dedicated `review_reminders` and `reading_reminders` controls, both inheriting `enabled = false` and `emergency_disabled = true`.
- Review reminders require the entry owner to be in an active, unexpired, non-revoked cohort with a non-revoked feature grant.
- Reading reminders apply the same eligibility check to each resolved Team Member recipient.
- Every function authored by candidates 201–202 and 204–206 now uses `SET search_path = ''`; relation and row-type references remain schema-qualified.
- Candidate trigger functions in 201 and 204–207 have browser-role execution revoked explicitly.
- Candidates 204–206 now record the settled ledger truth: migration 200 is taken and 203 is permanently retired.
- Migration contract tests cover missing-schema safety, recipient-level cohort eligibility, feature defaults, hardened search paths, and function grants.

## Verification

- `npm test -- --runInBand __tests__/migration-201-202-playbook.test.ts __tests__/migration-204-playbook-reviews.test.ts __tests__/migration-205-playbook-updates.test.ts __tests__/migration-206-playbook-enablement.test.ts __tests__/migration-207-playbook-operational-v1.test.ts` — 5 suites and 34 tests passed.
- Search confirmed no `SET search_path = public` or `SET search_path = pg_catalog, public` remains in candidates 201, 202, 204, 205, 206, or 207.
- `git diff --check` passed.

## Remaining gates

- Production currently lacks the reminder RPCs, so the deployed cron handlers can still log `PGRST202` until the candidate chain is deliberately installed or the handlers receive a separate missing-schema response policy.
- Before promotion, validate candidates with a real PostgreSQL parser/test database and retain the production P1–P3 probes.
- Keep candidates outside `supabase/migrations` until Peter approves the complete sequence.
