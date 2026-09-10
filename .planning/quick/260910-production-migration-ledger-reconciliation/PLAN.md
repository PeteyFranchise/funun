# Production migration ledger reconciliation

## Objective

Reconcile Supabase's remote migration history with the production objects that
were applied manually through the SQL editor for migrations 199, 200, 208, 209,
and 210. Do not execute migration bodies again.

## Scope

- Add a read-only SQL probe for the live definitions and grants introduced by
  migrations 199 and 200.
- Reuse the existing Phase 38.0.3 structural verification for migrations
  208–210.
- If every live check passes, mark only 199, 200, 208, 209, and 210 as applied
  in Supabase migration history.
- Leave Playbook migrations 201, 202, and 204–207 unapplied until their own
  pre-apply gate and behavioral checks pass.

## Files expected to change

- `.planning/quick/260910-production-migration-ledger-reconciliation/PLAN.md`
- `.planning/quick/260910-production-migration-ledger-reconciliation/VERIFY-LIVE.sql`
- `.planning/quick/260910-production-migration-ledger-reconciliation/SUMMARY.md`

## Validation plan

1. Run `VERIFY-LIVE.sql` against the linked production project.
2. Require every verdict to read `PASS`; stop on any `STOP`.
3. Confirm the existing Phase 38.0.3 A2 structural verifier has no failing or
   stopping row verdict.
4. Repair only the five confirmed history versions.
5. Re-run `supabase migration list` and confirm those five versions align while
   the six Playbook versions remain pending.

## Risks and coordination notes

- A migration-history repair does not execute SQL, but a false applied marker
  could hide a missing production change. Live-object verification is therefore
  mandatory first.
- Migration 203 is retired and must remain absent.
- D-56 is outside this task and remains an owner decision.
