# Migration 218 owner apply sequence

Migration 218 was human-approved, applied, and structurally verified on
2026-09-12. Retain this sequence as the release record and recovery reference.

## Candidate

| Version | File | SHA-256 |
| --- | --- | --- |
| `218` | `supabase/migrations/218_auth_diagnostic_events.sql` | `d37c34c69329721deb6e0391e72d9bed61210f3b5395a1bdb7c35bce35e50a03` |

## Owner sequence

1. Confirm the repository is clean and the checked-out commit is the intended production release.
2. Recompute the candidate SHA-256 and compare it with the pinned value above.
3. Run `PRE-APPLY-GATE.sql` against the linked production database. Stop unless every blocking row reports `ok=true`.
4. Apply only migration 218 during the approved window.
5. If the command reports failure, run `FAILED-APPLY-CHECK.sql` and stop on `PARTIAL_OR_LEDGER_MISMATCH`.
6. Run `POST-APPLY-VERIFY.sql`. Stop unless every blocking row reports `ok=true`.
7. Only after structural verification, verify the migration ledger and exercise the authorized retention route.

The verification queries are intentionally read-only. Migration application and any ledger repair remain human actions.
