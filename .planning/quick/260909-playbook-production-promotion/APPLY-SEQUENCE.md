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
| 4 | `supabase/migrations/205_playbook_change_broadcasts.sql` | `b018490f316eacb31856a5f87d874b9a9383cebc77d7e6abb376e26661090ba5` |
| 5 | `supabase/migrations/206_playbook_enablement_platform.sql` | `d338a03f31a051dd8e53120deb248bcd639c56cce80212ee2fe5b4682636274a` |
| 6 | `supabase/migrations/207_playbook_operational_v1.sql` | `835e1c9ccfd7995844ad8d7bdb5f64327dfb678ce0634abdcdf7d52fd589b502` |
| 7 | `supabase/migrations/213_playbook_browser_table_grant_hardening.sql` | `966691e818dd07b41273508b7722a8158fee3f2ffa97b97d914f5025a2cc417c` |

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

## 2026-09-10 Production Recovery Checkpoint

The production gate passed 279/279. Migrations 201 and 202 then committed,
passed their stage checks, and were registered. Migration 204 committed but its
stage check found that `anon` and `authenticated` retained the Supabase default
`REFERENCES`, `TRIGGER`, and `TRUNCATE` grants on all twelve tables created by
201, 202, and 204. The window stopped, migration 213 repaired the grants, and
the zero-grant verification passed before 204 and 213 were registered. Hardened
migrations 205–207 then committed and were registered. The first 207 attempt
failed on invalid `NULLS NOT DISTINCT` index syntax and rolled back completely;
the corrected retry passed its seven-part stage check. The complete post-apply
verifier then passed **114/114** with zero `STOP` or `FAIL` rows.

Recovery sequence:

1. Run `PRE-APPLY-GATE-213.sql`; require every row to say `PASS` with the exact
   observed residual grants.
2. Apply migration 213. It is one transaction and changes privileges only. An
   error rolls the entire repair back; stop rather than continuing.
3. Re-run `VERIFY-201-204-GRANTS.sql`; it must return zero browser-role rows.
4. Register migrations 204 and 213 as applied.
5. Apply the now-hardened 205, 206, and 207 individually. Each revokes every
   table privilege from `PUBLIC`, `anon`, and `authenticated` at creation time.
6. Run the complete post-apply verifier and behavioral route checks.

For a fresh database, normal numeric order remains correct: 205–207 create
their tables with the hardened posture, and 213 later makes the older-table
repair idempotent. The out-of-order 213 application is specific to this stopped
production window and is recorded here.

## Required Verification

After migration 207 commits:

1. Run `POST-APPLY-VERIFY.sql` unchanged.
2. Stop unless every row says `PASS`.
3. Run the Phase 38 public-schema definer sweep again.
4. Exercise all eight routes with an authorized Team Member and then with a revoked or unauthorized Team Member.
5. Reconcile `supabase_migrations.schema_migrations` before any future CLI migration workflow. Manual SQL Editor application does not safely establish that ledger by itself.
6. Keep all feature controls off until the named beta cohort is approved.
