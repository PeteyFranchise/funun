# Owner Apply Sequence — Beta Security Migrations 214–217

> **HUMAN-GATED PRODUCTION CHANGE.** An agent, CI job, preview deployment, or
> unattended process must not run these commands. The repository work in this
> package prepares and verifies the release; only Peter may authorize and run
> the production apply window.

## Frozen migration chain

Apply only this exact order. The SHA-256 values pin the reviewed bytes; any
digest change requires a new review and a fresh preflight.

| Version | File | SHA-256 |
| --- | --- | --- |
| `214` | `supabase/migrations/214_verified_invite_claim_hardening.sql` | `d6e8d41383974d8e6b0913762d0d8b3f252b6ea6437b037dadfe1c5a2d467b77` |
| `215` | `supabase/migrations/215_atomic_checkout_creation.sql` | `526d2238d3f4166e2ceecefeaf260cc675d030f05fd105ea8f8db83c7ea6a4f7` |
| `216` | `supabase/migrations/216_atomic_esign_mint_claims.sql` | `86481b95e155419dc72aab579066f02c57c61695472753c7ca5619ae59f494fa` |
| `217` | `supabase/migrations/217_atomic_playbook_operations.sql` | `eab4e299caec26b96ef3de15b842bcbbedbd1f61f5cf150e126b13ba5dc495f2` |

Migration `203` remains retired. Versions `211` and `212` remain reserved for
Phase 38.2. Do not rename, renumber, or fill those slots during this release.

## Before opening the apply window

1. Work from a clean checkout of the reviewed production commit.
2. Take or confirm the production recovery point required by the release
   process.
3. Coordinate migration 214 with the Supabase Auth email-confirmation change.
   Do not alter Auth behavior before the migration is ready to apply.
4. Run the local static guard:

   ```bash
   npm run security:migrations:verify
   ```

5. Run the read-only production preflight. Every returned row must have
   `ok=true`; any `blocking=true, ok=false` result is a hard stop.

   ```bash
   SUPABASE_ACCESS_TOKEN="$FUNUN_SUPABASE_PAT" npx supabase db query --linked --file .planning/quick/260912-beta-security-migration-harness/PRE-APPLY-GATE.sql --output csv
   ```

6. Preview the migration list without changing production:

   ```bash
   SUPABASE_ACCESS_TOKEN="$FUNUN_SUPABASE_PAT" npx supabase db push --linked --dry-run
   ```

   The dry run must list exactly `214`, `215`, `216`, and `217`, in that order.
   If it lists any other migration, stop. Do not use `--include-all`, migration
   repair, or a direct SQL apply as a shortcut.

## Apply

After Peter explicitly approves the open window, apply the exact dry-run set:

```bash
SUPABASE_ACCESS_TOKEN="$FUNUN_SUPABASE_PAT" npx supabase db push --linked
```

Each migration has its own explicit transaction. Supabase records a version
only after that file succeeds. Do not manually repair the migration ledger.

## If the apply fails

Do not rerun the apply command. Run the read-only state classifier:

```bash
SUPABASE_ACCESS_TOKEN="$FUNUN_SUPABASE_PAT" npx supabase db query --linked --file .planning/quick/260912-beta-security-migration-harness/FAILED-APPLY-CHECK.sql --output csv
```

- `NOT_APPLIED_CLEAN`: the candidate left no target objects and no ledger row.
- `APPLIED_CLEAN`: the candidate's target objects and ledger row are present.
- `APPLIED_UNREGISTERED`: a direct/manual apply created the expected object
  count without a ledger row. Stop for definition-level review; do not repair
  the ledger from this count alone.
- `PARTIAL_OR_LEDGER_MISMATCH`: hard stop. Preserve the output and investigate.

No rollback, cleanup, migration repair, or Auth setting change is authorized by
this runbook after a failure.

## After a successful apply

Run the full read-only verifier. Every row must report `ok=true`:

```bash
SUPABASE_ACCESS_TOKEN="$FUNUN_SUPABASE_PAT" npx supabase db query --linked --file .planning/quick/260912-beta-security-migration-harness/POST-APPLY-VERIFY.sql --output csv
```

Then confirm the ledger visibly lists `214` through `217` on both sides:

```bash
SUPABASE_ACCESS_TOKEN="$FUNUN_SUPABASE_PAT" npx supabase migration list --linked
```

Only after both checks pass should the coordinated email-confirmation setting
be changed and the deferred human behavior tests begin. Those tests are listed
in `.planning/todos/pending/2026-09-12-beta-security-migrations-live-verification.md`.
