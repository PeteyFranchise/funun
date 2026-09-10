# Owner-Run Playbook Production Apply Sequence

## Absolute Rules

- Peter runs these steps manually in the production Supabase SQL Editor.
- Do not use `supabase db push`, `supabase migration up`, or any automated migration command.
- Run `PRE-APPLY-GATE.sql` first. Stop unless every row says `PASS`.
- Paste one migration file at a time, in the exact order below. Never concatenate files.
- Wait for a successful `COMMIT` before continuing.
- If any migration reports an error, stop. Do not retry a later migration and do not edit production manually.
- Migration 203 is permanently retired and must remain absent.

## Integrity Manifest

Verify each local file against this SHA-256 value immediately before copying it:

| Order | Migration file | SHA-256 |
|---:|---|---|
| 1 | `supabase/migrations/201_playbook_rich_documents.sql` | `1f20a14231f2a7d1dc874994f968981b332ec09bbd46584a510c94804ad22465` |
| 2 | `supabase/migrations/202_playbook_reading_operations.sql` | `f7d20a7fadf3c8b172ebc72e4566daa62f79d0aac34ab04aaf4318914b5f1259` |
| 3 | `supabase/migrations/204_playbook_review_threads.sql` | `f69564acf1e315f803d9908672b33aa9c80795719ff5806cfacc1c39f0666221` |
| 4 | `supabase/migrations/205_playbook_change_broadcasts.sql` | `5a0ea52baba52c0748ad4220cd3f16981f5dae04ab94fb1dc44ae5237080b6e4` |
| 5 | `supabase/migrations/206_playbook_enablement_platform.sql` | `09dfae2bc71fcc2e3e01a7234f8eb6b7696c83d69af2a245242c2af05a0aa0cd` |
| 6 | `supabase/migrations/207_playbook_operational_v1.sql` | `647490f77af96d90e2f46723fdd0acda3445de37edd7c5f3f49b229477052375` |

## Dependency Order and Pause Points

### 1. Migration 201 — rich documents and publication governance

Paste the complete contents of `supabase/migrations/201_playbook_rich_documents.sql`.

Technical pause: safe after its successful `COMMIT`. Review and reading routes remain incomplete.

### 2. Migration 202 — reading operations

Paste the complete contents of `supabase/migrations/202_playbook_reading_operations.sql`.

Technical pause: safe after its successful `COMMIT`. Both scheduled reminder functions return zero because migration 207's activation schema is not present. This is an intentional fail-closed state.

### 3. Migration 204 — review threads

Paste the complete contents of `supabase/migrations/204_playbook_review_threads.sql`.

Technical pause: safe after its successful `COMMIT`. The review API and review-backed pages now have their required tables.

### 4. Migration 205 — change broadcasts

Paste the complete contents of `supabase/migrations/205_playbook_change_broadcasts.sql`.

Operational pause: safe after its successful `COMMIT`. Migrations 201, 202, 204, and 205 are the minimum same-window bundle that closes the eight known deployed-route schema gaps. Do not intentionally end the maintenance window before this point.

### 5. Migration 206 — enablement platform

Paste the complete contents of `supabase/migrations/206_playbook_enablement_platform.sql`.

Technical pause: safe after its successful `COMMIT`. Release 17–26 storage exists, but Release 27 controls are not yet installed.

### 6. Migration 207 — operational controls

Paste the complete contents of `supabase/migrations/207_playbook_operational_v1.sql`.

Final pause: safe after its successful `COMMIT`. Every feature remains disabled and emergency-disabled by default. Do not enable a cohort or clear an emergency control during this apply window.

## What Must Stay Together

- No two files share a transaction; each migration is independently atomic.
- The order is strict. Migration 205 requires 202, and migration 207 requires all five earlier Playbook migrations.
- Treat 201 through 205 as one maintenance-window objective because production already serves the eight dependent admin routes.
- Prefer completing all six in one supervised window. A successful transaction boundary is a technically safe pause, but it is not feature-launch approval.

## Required Verification

After migration 207 commits:

1. Run `POST-APPLY-VERIFY.sql` unchanged.
2. Stop unless every row says `PASS`.
3. Run the Phase 38 public-schema definer sweep again.
4. Exercise all eight routes with an authorized Team Member and then with a revoked or unauthorized Team Member.
5. Reconcile `supabase_migrations.schema_migrations` before any future CLI migration workflow. Manual SQL Editor application does not safely establish that ledger by itself.
6. Keep all feature controls off until the named beta cohort is approved.
