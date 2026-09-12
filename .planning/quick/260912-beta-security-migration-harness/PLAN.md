# Beta Security Migrations 214–217 Harness — Plan

## Objective

Prepare migrations 214–217 for a controlled future owner apply by adding a
single ordered runbook, read-only preflight/post-apply/failed-apply probes, and
static tests that keep the migration files and probes synchronized.

## Scope

- Harden all four candidate migrations with explicit transactions.
- Make security-object collisions fail closed rather than silently accepting
  a pre-existing object with an unknown definition.
- Add a read-only pre-apply gate for prerequisites, collisions, duplicate rows,
  ledger state, and migration ordering.
- Add a read-only post-apply verifier for schema, RLS, grants, function
  hardening, constraints, indexes, and migration ledger state.
- Add a read-only failed-apply verifier that detects partial schema residue.
- Add a checksum-pinned apply sequence and one-command static verifier.
- Record provider/live behavior checks as later human TODOs; do not run them.

## Files expected to change

- `supabase/migrations/214_verified_invite_claim_hardening.sql`
- `supabase/migrations/215_atomic_checkout_creation.sql`
- `supabase/migrations/216_atomic_esign_mint_claims.sql`
- `supabase/migrations/217_atomic_playbook_operations.sql`
- `scripts/verify-beta-security-migrations.mjs`
- `package.json`
- `__tests__/beta-security-migration-harness.test.ts`
- `.planning/quick/260912-beta-security-migration-harness/*.sql`
- `.planning/quick/260912-beta-security-migration-harness/APPLY-SEQUENCE.md`
- `.planning/quick/260912-beta-security-migration-harness/SUMMARY.md`
- `.planning/todos/pending/2026-09-12-beta-security-migrations-live-verification.md`

## Validation plan

- Run the static migration harness.
- Run migration 214–217 and harness Jest tests.
- Run strict TypeScript and ESLint.
- Run the full Jest suite and production build.
- Run `git diff --check` and inspect repository status.

## Risks and coordination notes

- Do not connect to production, invoke the linked Supabase CLI, apply or repair
  a migration, change Supabase Auth settings, call Stripe/DocuSeal, or deploy.
- Migration 214 and production email confirmation remain one coordinated owner
  release; neither is activated here.
- The production SQL probes contain SELECT statements only and are authored
  for later owner execution.
