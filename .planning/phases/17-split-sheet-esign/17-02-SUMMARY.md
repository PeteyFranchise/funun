---
phase: 17-split-sheet-esign
plan: 02
subsystem: database
tags: [supabase, migration, rls, readiness, split-sheets, postgres]

requires:
  - phase: 17-split-sheet-esign (17-01)
    provides: SplitSheetStatus type, lib/split-sheets/envelopes.ts cap helpers
  - phase: wave-1 (migration 018)
    provides: split_sheets / split_sheet_parties schema and their RLS policies
provides:
  - "esign_envelopes + esign_envelope_signers: one row per DocuSeal submission ATTEMPT and per party per attempt, so a void→re-mint cycle preserves the voided attempt as its own row rather than overwriting audit history"
  - "Server-owned write doctrine on both tables: RLS enabled, INSERT/UPDATE/DELETE/TRUNCATE revoked from authenticated+anon, 4 SELECT policies scoped to sheet initiator and named party"
  - "split_sheets.status widened with esign_pending and executed"
  - "split_sheet_parties.first_viewed_at for P17-04 nudge tracking"
  - "calculate_vault_readiness() redefined with pessimistic-MIN 5/10/15 split-sheet tiering, preserving the legacy signed-vault_documents path to 15"
  - "SPLIT_SHEET_TIER_MAP in lib/vault/readiness-tiers.ts — the single source both the SQL trigger and the TS twin derive from"
affects: [17-06, 17-07, 18-01, 18-04]

tech-stack:
  added: []
  patterns:
    - "Server-owned writes (migrations 040/056/058) extended to signing-state tables"
    - "Dual implementation with a shared fixture parity test — SQL trigger and readinessItemsForProject() assert the SAME scenario table so they cannot silently drift (RESEARCH Pitfall 3)"
---

## What shipped

Migration **062** (`supabase/migrations/062_split_sheet_esign_envelopes.sql`) with its 19-assertion string test, the TS readiness twin, and a shared-fixture parity suite. Both implementations read tier values from one map:

```
draft 0 · pending_approval 5 · countered 5 · approved 10 · esign_pending 10 · executed 15
```

Scoring uses a pessimistic MIN across every sheet tied to a project, so one draft sheet holds the whole project at the draft tier. The legacy signed-`vault_documents` branch is preserved unchanged as an equally valid route to 15 points, keeping AM-1's wet-sign upload fallback intact.

## Verification

- `npx jest __tests__/migration-062.test.ts __tests__/readiness.test.ts lib/vault/readiness-tiers.test.ts` — 55/55
- `npx tsc --noEmit` and `npm run lint` clean
- Full suite green at every gate

## Human checkpoint — closed 2026-07-20, after three failed attempts

The blocking checkpoint took four sessions and surfaced three separate defects. Recording them because each was invisible to the checks that preceded it.

**1. `uuid_generate_v4()` did not resolve.** The uuid-ossp extension exists but lives in the `extensions` schema, which is not on the migration session's `search_path`. Migrations 001–058 all use the unqualified call and 058 applied successfully, so something changed in CLI behaviour between those pushes. Fixed by switching to `gen_random_uuid()` (PostgreSQL core, `pg_catalog`, always resolvable). Any future migration using `uuid_generate_v4()` will fail the same way — noted in 062's header, including for Phase 16's drafted migrations.

**2. `TRUNCATE` survived the REVOKE.** `REVOKE INSERT, UPDATE, DELETE` leaves Supabase's default TRUNCATE grant in place, and TRUNCATE is **not** subject to RLS — a role holding it can empty a table regardless of policy. For `esign_envelope_signers`, which holds signature audit linkage, that is the exact loss the table exists to prevent. Fixed in 062. **No other migration in the repo revokes TRUNCATE** (042/056/057/058 all have the same gap), so 062 is deliberately stricter than the surrounding doctrine; the repo-wide sweep is tracked separately.

**3. A rollback left the ledger row behind.** Dropping the objects does not remove the `schema_migrations` entry, so `db push` reported "Remote database is up to date" and silently refused to re-apply. Fixed with `supabase migration repair --status reverted 062`. Both rollback blocks in the push handoff now require this step.

**Step 4 — the adversarial write check — was never satisfiable until migration 064.** Every write returned `42P17 infinite recursion detected in policy for relation "split_sheet_parties"` instead of the expected `42501`. Root cause was a mutually recursive RLS policy pair created in **migration 018**, long before this plan; 062's policies query `split_sheet_parties`, which made a dormant cycle reachable. PostgREST always emits `RETURNING`, which puts a read into the query tree, so RLS expansion at rewrite time preempted the executor's table-ACL check. **062's REVOKE was in force the whole time — masked, not absent.**

The cycle also broke the core vault write path: 062 taught `calculate_vault_readiness()` to read `split_sheets`, that function is SECURITY INVOKER, and four triggers from migration 001 fire it on INSERT to `tracks`, `vault_documents`, `vault_assets`, and `tool_outputs`. See `.planning/debug/split-sheet-rls-recursion.md`.

After 064: all six write probes return **42501**, non-party SELECT returns **[]**, blast-radius canaries on both base tables are clean, and a normal authenticated user can create a project and insert a track (both HTTP 201). Checkpoint closed.

## Deviations

- 062 revokes TRUNCATE, which the plan did not specify and no prior migration does. Justified above.
- 062 uses `gen_random_uuid()`, breaking the repo's `uuid_generate_v4()` convention. Justified above.
- The plan assumed its checkpoint would pass on first push. It took four attempts and produced migration 064 as a prerequisite; 064 is not in this plan's `files_modified` and is tracked as its own debug session.

## Follow-ups

- **Repo-wide privilege sweep** — TRUNCATE (and possibly TRIGGER) still granted on `capability_grants`, `green_room_placements`, `reports`, `dm_threads`, `dm_messages`. Tracked separately.
- **`calculate_vault_readiness()` is SECURITY INVOKER while reading a table the caller may not be able to read.** Any future RLS on a table it touches re-arms the 42P17 class of failure. Making it SECURITY DEFINER would close it permanently — a security decision, not a recursion fix, so deliberately left alone.
- **Readiness tiering is applied but unproven against real data.** All three projects scored zero delta across every push because none has split sheets attached. The tiering branch has never fired in production; 17-06 is the first opportunity to exercise it.
