# Migration Push Handoff — 062 + 063 (Phase 17)

**For:** an agent with live database access (Codex), acting on Pete's behalf.
**Why this file exists:** both migrations carry an explicit "an executor agent must NEVER run `supabase db push`" instruction, mirroring the 058 convention. This handoff is the sanctioned path — it does not override that rule for a *plan executor*; it defines a separate, deliberate, human-initiated push task.

**Order is mandatory: 062 first, then 063.** They are independent in content, but 062 widens the `split_sheets.status` CHECK constraint that later phase code depends on, and 063's comments reference 062 as already applied.

---

## Prompt 1 — Migration 062

```
Push migration 062 to the Funūn Supabase database.

FILE: supabase/migrations/062_split_sheet_esign_envelopes.sql
REPO: /Users/peterzora/Desktop/funun
BRANCH: codex/phase-11-presence-messaging

Read the whole file before doing anything. The header says an executor agent
must never push it — that rule is for plan executors. This is a deliberate,
human-initiated push and you are authorized for this one migration.

WHAT IT DOES:
  1. CREATE TABLE esign_envelopes + esign_envelope_signers (new, empty)
  2. REVOKE INSERT/UPDATE/DELETE from authenticated+anon on both, ENABLE RLS,
     add 4 SELECT policies (server-owned write doctrine, per migrations 040/056/058)
  3. Widen the split_sheets.status CHECK to add 'esign_pending' and 'executed'
  4. ADD COLUMN split_sheet_parties.first_viewed_at
  5. CREATE OR REPLACE calculate_vault_readiness() — redefines a function
     originally from migration 016
  6. UPDATE every row in vault_projects, recomputing vault_readiness_score

Steps 5 and 6 are the only risky parts. Everything else is additive.

BEFORE PUSHING — capture rollback state. Do not skip this:
  a. Snapshot current scores:
       COPY (SELECT id, vault_readiness_score FROM vault_projects ORDER BY id)
       TO STDOUT WITH CSV HEADER;
     Save to .planning/phases/17-split-sheet-esign/rollback/062-scores-before.csv
  b. Snapshot the current function body so it can be restored:
       SELECT pg_get_functiondef('public.calculate_vault_readiness(uuid)'::regprocedure);
     Save to .planning/phases/17-split-sheet-esign/rollback/062-readiness-fn-before.sql
  c. Confirm the two new tables do NOT already exist:
       SELECT to_regclass('public.esign_envelopes'),
              to_regclass('public.esign_envelope_signers');
     Both must be NULL. If either is non-null, STOP and report — the migration
     uses bare CREATE TABLE (not IF NOT EXISTS) and will error.

PUSH:
  supabase db push

AFTER PUSHING — verify, and report actual output for each:
  1. Tables exist with RLS on:
       SELECT relname, relrowsecurity FROM pg_class
       WHERE relname IN ('esign_envelopes','esign_envelope_signers');
     Expect: both rows, relrowsecurity = true.

  2. Write privileges are actually revoked (this is the security-critical check
     — do not accept "the migration ran" as proof):
       SELECT grantee, privilege_type FROM information_schema.role_table_grants
       WHERE table_name IN ('esign_envelopes','esign_envelope_signers')
         AND grantee IN ('authenticated','anon');
     Expect: NO rows with INSERT, UPDATE, or DELETE. SELECT may appear.

  3. Four SELECT policies exist:
       SELECT tablename, policyname, cmd FROM pg_policies
       WHERE tablename IN ('esign_envelopes','esign_envelope_signers');
     Expect: 4 rows, all cmd = SELECT.

  4. Status constraint accepts the new values:
       SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conname = 'split_sheets_status_check';
     Expect: both 'esign_pending' and 'executed' present.

  5. NO READINESS SCORE DECREASED. This is the key invariant. The only scoring
     change is a new ELSIF branch that awards points where none were awarded
     before, so every project's score should be unchanged or higher. Compare
     against 062-scores-before.csv and report:
       - how many projects changed
       - the min and max delta
     If ANY delta is negative, that is a real regression — stop and report it
     with the affected project ids. Do not "fix" it yourself.

  6. Run the repo's assertion test:
       npx jest __tests__/migration-062.test.ts

ROLLBACK if anything above fails:
  DROP TABLE esign_envelope_signers; DROP TABLE esign_envelopes;
  ALTER TABLE split_sheets DROP CONSTRAINT split_sheets_status_check;
  ALTER TABLE split_sheets ADD CONSTRAINT split_sheets_status_check
    CHECK (status IN ('draft','pending_approval','approved','countered'));
  -- then restore the function from 062-readiness-fn-before.sql and re-run:
  UPDATE vault_projects SET vault_readiness_score = calculate_vault_readiness(id);
  -- first_viewed_at may be left in place; it is nullable and harmless.

  -- MANDATORY FINAL STEP — clear the migration ledger. Dropping the objects
  -- does NOT remove the schema_migrations row. If it is left behind, the
  -- ledger claims 062 is applied while the schema says otherwise, and
  -- `supabase db push` silently reports "Remote database is up to date" and
  -- refuses to re-apply. This happened on 2026-07-20. Run:
  supabase migration repair --status reverted 062
  -- then confirm the row is gone:
  SELECT version FROM supabase_migrations.schema_migrations WHERE version = '062';
  -- Expect zero rows.

Do not proceed to migration 063 until every check above passes. Report results
before continuing.
```

---

## Prompt 2 — Migration 063

```
Push migration 063 to the Funūn Supabase database. Migration 062 must already
be applied and verified.

FILE: supabase/migrations/063_split_sheet_legal_grade.sql
REPO: /Users/peterzora/Desktop/funun

Read the whole file first. Same note as 062: the "never push from an executor
agent" header is for plan executors; this is an authorized human-initiated push.

WHAT IT DOES — strictly additive, 8 nullable columns across 4 tables:
  split_sheet_parties: legal_name, publishing_designee, administrator
  split_sheets:        artist_name, album_project_title, record_label
  artist_profiles:     administrator
  collaborators:       administrator

All use ADD COLUMN IF NOT EXISTS. No existing column, constraint, policy, or
function is altered. The 100.000% split_percentage CHECK from migration 018 is
untouched. There is no data migration and no row is rewritten.

PUSH:
  supabase db push

AFTER PUSHING — verify:
  1. All 8 columns landed:
       SELECT table_name, column_name, is_nullable FROM information_schema.columns
       WHERE (table_name='split_sheet_parties' AND column_name IN ('legal_name','publishing_designee','administrator'))
          OR (table_name='split_sheets' AND column_name IN ('artist_name','album_project_title','record_label'))
          OR (table_name='artist_profiles' AND column_name='administrator')
          OR (table_name='collaborators' AND column_name='administrator')
       ORDER BY table_name, column_name;
     Expect: 8 rows, every is_nullable = YES.

  2. CRITICAL — artist_profiles.administrator must be private by construction.
     Migration 040 established a REVOKE-then-explicit-column-GRANT pattern, so
     any column absent from 040's GRANT lists has zero authenticated/anon
     privileges. This new column holds rights-registry PII of the same class as
     artist_profiles.publisher. Verify it actually inherited that posture rather
     than assuming it did:
       SELECT grantee, privilege_type FROM information_schema.column_privileges
       WHERE table_name='artist_profiles' AND column_name='administrator'
         AND grantee IN ('authenticated','anon');
     Expect: ZERO rows.
     Cross-check against the known-private column — these must match:
       SELECT grantee, privilege_type FROM information_schema.column_privileges
       WHERE table_name='artist_profiles' AND column_name='publisher'
         AND grantee IN ('authenticated','anon');
     If administrator has ANY grant that publisher does not, STOP and report.
     Do not add a REVOKE yourself — that would mean 040's doctrine does not work
     the way the migration comment claims, which Pete needs to know about.

  3. Pre-063 rows still render. The split-sheet PDF renderer has a degradation
     path for these nulls. Confirm existing production rows are intact:
       SELECT count(*) FROM split_sheets;
       SELECT count(*) FROM split_sheet_parties WHERE legal_name IS NULL;
     Existing parties having NULL legal_name is EXPECTED and correct.

  4. Run the assertion test:
       npx jest __tests__/migration-063.test.ts

ROLLBACK (safe — these columns hold no data yet):
  ALTER TABLE split_sheet_parties DROP COLUMN IF EXISTS legal_name,
    DROP COLUMN IF EXISTS publishing_designee, DROP COLUMN IF EXISTS administrator;
  ALTER TABLE split_sheets DROP COLUMN IF EXISTS artist_name,
    DROP COLUMN IF EXISTS album_project_title, DROP COLUMN IF EXISTS record_label;
  ALTER TABLE artist_profiles DROP COLUMN IF EXISTS administrator;
  ALTER TABLE collaborators DROP COLUMN IF EXISTS administrator;

  -- MANDATORY FINAL STEP — clear the migration ledger, same as 062:
  supabase migration repair --status reverted 063
  SELECT version FROM supabase_migrations.schema_migrations WHERE version = '063';
  -- Expect zero rows. Skipping this blocks any future re-push.

Report the output of every check. Do not summarize as "verified" — paste actual
query results.
```

---

## After both land

- 17-06 (mint route, recipient-cap enforcement) and 17-07 (webhook) are unblocked.
- The `billed` column on `esign_envelopes` is intentionally nullable — it stays null until DocuSeal's void-billing behavior is confirmed live. The provider gate already verified voided envelopes do not bill (`VOIDED_ENVELOPES_COUNT_TOWARD_CAP = false`), so this is a belt-and-braces audit field, not an open question.

---

## Push outcome (2026-07-20) — both applied

**062 applied** after two aborted attempts. Three findings, all now fixed or tracked:

1. `uuid_generate_v4()` failed to resolve — uuid-ossp lives in the `extensions` schema, not on the migration session's search_path. Fixed by switching to `gen_random_uuid()` (core, `pg_catalog`). Commit `3c5484b`.
2. `TRUNCATE` remained granted to authenticated+anon after `REVOKE INSERT, UPDATE, DELETE`. Fixed in 062 (commit `482a1b8`); repo-wide sweep tracked separately.
3. Rollback left the `schema_migrations` ledger row in place, so `db push` reported "Remote database is up to date" and refused to re-apply. Fixed by `supabase migration repair --status reverted 062`; both rollback blocks above now require this step. Commit `89134f4`.

Final 062 state: both tables present with RLS, 4 SELECT policies, no INSERT/UPDATE/DELETE/TRUNCATE for authenticated/anon, constraint widened, readiness deltas all 0 (expected — no split sheets attached), 19/19 tests pass.

**063 applied** cleanly on the first attempt. All 8 columns nullable, 10/10 tests pass.

### Finding: migration 040's doctrine is narrower than 063's comment claims

063's header asserts `artist_profiles.administrator` inherits "zero privileges" from 040's REVOKE-then-column-GRANT pattern. The live check disproves the strong form of that claim. Actual grants on `administrator` (identical to `publisher`, the existing PII benchmark):

| Role | Privileges on `administrator` |
|---|---|
| `authenticated` | INSERT, REFERENCES |
| `anon` | INSERT, UPDATE, REFERENCES |

**The protection that matters did hold:** no SELECT for either role (client cannot read it), and no UPDATE for `authenticated` (logged-in user cannot write it). That is the full extent of what 040 revokes:

```sql
REVOKE SELECT ON artist_profiles FROM authenticated, anon;  -- then per-column GRANT
REVOKE UPDATE ON artist_profiles FROM authenticated;        -- then per-column GRANT
```

UPDATE is never revoked from `anon`, and INSERT is never revoked from anyone. Those are Supabase table-level defaults 040 does not address. Currently gated by RLS (`anon` has no `auth.uid()`), so not exploitable — but "private by construction" overstates it.

**Not a 063 regression.** `administrator` is exactly as protected as `publisher` and every other ungranted column on the table. This is the same class of gap as the TRUNCATE finding and belongs to the same repo-wide sweep: extend it to cover `REVOKE INSERT ... FROM authenticated, anon` and `REVOKE UPDATE ... FROM anon` on `artist_profiles`, and correct the doctrine comment wording wherever it claims columns are private by construction.
