## What Changed

- Confirmed local checkout is up to date with `origin/codex/phase-11-presence-messaging`
- Confirmed commit `482a1b8` is present locally
- Confirmed `supabase/migrations/063_split_sheet_legal_grade.sql` was restored and tracked before migration work
- Fixed `.planning/phases/17-split-sheet-esign/rollback/062-readiness-fn-before.sql` by adding the missing trailing semicolon
- Committed the rollback artifact fix as `f6ba78a`
- Temporarily held `supabase/migrations/063_split_sheet_legal_grade.sql` out of the migrations folder to attempt a 062-only push, then restored it
- Attempted `supabase db push --linked --yes`, which returned `Remote database is up to date`
- Diagnosed remote drift: migration ledger shows `062` applied, but the live schema is still in pre-062 shape

## Validation Run

- `git pull origin codex/phase-11-presence-messaging`
- `git rev-parse --verify 482a1b8`
- `git ls-files --error-unmatch supabase/migrations/063_split_sheet_legal_grade.sql`
- `supabase db query --linked "SELECT to_regclass('public.esign_envelopes') AS esign_envelopes, to_regclass('public.esign_envelope_signers') AS esign_envelope_signers;"`
- `supabase db query --linked "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'split_sheets_status_check';"`
- `supabase db push --linked --yes`
- `supabase db query --linked "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version IN ('062','063') OR version LIKE '062_%' OR version LIKE '063_%' ORDER BY version;"`

## Remaining Risks Or Follow-Ups

- Remote migration ledger drift blocks a normal `supabase db push` re-application of 062
- `schema_migrations` records `062 split_sheet_esign_envelopes` as applied while:
  - `public.esign_envelopes` is absent
  - `public.esign_envelope_signers` is absent
  - `split_sheets_status_check` is still the pre-062 four-value version
- Do not proceed to 063 until the 062 ledger/schema mismatch is repaired
