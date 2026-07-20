---
status: awaiting_human_verify
trigger: "Authenticated (anon key + user JWT) requests against esign_envelopes / esign_envelope_signers return HTTP 500 SQLSTATE 42P17 'infinite recursion detected in policy for relation split_sheet_parties'. Expected 42501 on writes (062 revoked INSERT/UPDATE/DELETE) and [] on a non-party SELECT."
created: 2026-07-20
updated: 2026-07-20
---

## Current Focus

hypothesis: Migration 018 creates a mutually recursive RLS policy pair between `split_sheets` and `split_sheet_parties`. Any query whose rewrite pulls in the SELECT policies of either table (directly, or transitively via 062's esign_* policies) hits PostgreSQL's RLS recursion guard at query-rewrite time and fails 42P17.
test: Rebuild the exact schema (actual text of migrations 018 + 062) on real PostgreSQL under Supabase-shaped roles/grants and run the reported probes.
expecting: 42P17 naming `split_sheet_parties` on esign_* probes, 42P17 on direct split_sheets/split_sheet_parties SELECTs (blast radius), and 42501 on a write shape that does NOT pull SELECT policies into the rewrite (proving the privilege check is merely preempted, not absent).
next_action: Assess app-layer blast radius (which routes use anon-key client vs service client on these tables), then author migration 064.

## Symptoms

expected: writes → 42501 insufficient_privilege; non-party SELECT → [] (empty array)
actual: HTTP 500, SQLSTATE 42P17, `infinite recursion detected in policy for relation "split_sheet_parties"`
errors: 42P17 on POST/PATCH/DELETE /rest/v1/esign_envelopes, POST/PATCH/DELETE /rest/v1/esign_envelope_signers, GET /rest/v1/esign_envelopes?select=*
reproduction: any authenticated (anon key + signed-in user JWT, NOT service role) request against the above endpoints
started: surfaced when migration 062 landed; the underlying policy cycle has existed since migration 018

## Eliminated

- hypothesis: A later migration dropped or replaced one of 018's policies, and the cycle is a regression introduced by 062/063.
  evidence: `grep -rn "split_sheet_parties\|split_sheets" supabase/migrations/ | grep -i "policy\|drop"` returns policy statements ONLY in 018 (lines 52, 82, 89, 95). No DROP POLICY or ALTER POLICY anywhere in the tree. 062's only touch on split_sheets is the status CHECK constraint (line 135). The cycle is original to 018.
  timestamp: 2026-07-20

- hypothesis: 062's REVOKE of INSERT/UPDATE/DELETE failed to apply, which is why writes don't return 42501.
  evidence: Empirically disproved. On the reproduction, a BARE `INSERT INTO esign_envelopes (...) VALUES (...)` with no RETURNING clause returns `42501: permission denied for table esign_envelopes` for all three user classes. The REVOKE is in force. The 42501 is preempted, not absent.
  timestamp: 2026-07-20

- hypothesis: The recursion only affects non-party/outsider users (a visibility-scoping edge case).
  evidence: Empirically disproved. The 42P17 fires identically for the sheet INITIATOR, a named PARTY, and an unrelated OUTSIDER. The error is raised during query rewrite, before any row is examined, so it is user-independent.
  timestamp: 2026-07-20

## Evidence

- timestamp: 2026-07-20
  checked: supabase/migrations/018_collaborators_split_sheets.sql lines 82-101
  found: Two policies form a closed cycle. `"Initiator sees all parties"` ON split_sheet_parties (line 82) has `EXISTS (SELECT 1 FROM split_sheets WHERE id = split_sheet_parties.split_sheet_id AND initiator_user_id = auth.uid())`. `"Parties can view split sheets"` ON split_sheets (line 95) has `EXISTS (SELECT 1 FROM split_sheet_parties WHERE split_sheet_id = split_sheets.id AND user_id = auth.uid())`. Each policy body reads the other policy's table.
  implication: Confirms the structural cycle exists in source. Does NOT yet prove it is what produces the observed runtime error.

- timestamp: 2026-07-20
  checked: Grep for DROP POLICY / ALTER POLICY / policy creation on both tables across all 63 migrations
  found: Policies on these two tables are created only in 018. Nothing later drops, replaces, or alters them.
  implication: Cycle is live on the remote DB as of 063. Fix must be forward-only in 064.

- timestamp: 2026-07-20
  checked: Empirical reproduction on real PostgreSQL 18.3 (PGlite WASM), running the verbatim text of migration 018 and the table/grant/policy portion of 062, under a Supabase-shaped preamble (roles authenticated/anon/service_role, auth.uid() reading request.jwt.claim.sub, GRANT ALL then 062's REVOKE, seeded sheet with initiator + named party + unclaimed party)
  found: Every reported symptom reproduced with the exact SQLSTATE and the exact relation name. GET esign_envelopes → 42P17 "...for relation split_sheet_parties". INSERT/UPDATE/DELETE on esign_envelopes and esign_envelope_signers in PostgREST's `WITH pgrst_source AS (... RETURNING *) SELECT ...` shape → same 42P17. Identical for initiator, party, and outsider.
  implication: Root cause CONFIRMED by direct observation, not inference. The 018 cycle is the mechanism.

- timestamp: 2026-07-20
  checked: The privilege-vs-recursion ordering question — why a revoked write surfaces 42P17 instead of 42501
  found: A BARE `INSERT ... VALUES` (no RETURNING) returns 42501 permission denied. The SAME insert wrapped in PostgREST's `WITH pgrst_source AS (INSERT ... RETURNING *) SELECT * FROM pgrst_source` returns 42P17. The only difference is the RETURNING clause.
  implication: Mechanism established. RETURNING puts a read of esign_envelopes into the query tree, which makes the rewriter expand that table's SELECT policies, which transitively reach the 018 cycle. RLS expansion happens in the REWRITER (rewriteHandler.c fireRIRrules, which raises 42P17 = invalid_object_definition when a relation reappears in its activeRIRs stack). Table ACL checks happen later, at EXECUTOR startup (ExecCheckPermissions in InitPlan). Rewrite strictly precedes execution, so the recursion error preempts the 42501 the REVOKE would otherwise produce. PostgREST always emits RETURNING, so every client write shape hits 42P17.

- timestamp: 2026-07-20
  checked: Direct SELECT on split_sheets and split_sheet_parties as authenticated (blast-radius probe)
  found: `SELECT id, song_name FROM split_sheets` → 42P17 "...for relation split_sheets". `SELECT id, name FROM split_sheet_parties` → 42P17 "...for relation split_sheet_parties". Fails for initiator, party, and outsider alike.
  implication: This is NOT an e-sign bug. Both base tables are 100% unreadable through the anon key for every user class. The relation named in the error just reflects which branch the rewriter expanded first from the entry table — it is one cycle, not two bugs.

- timestamp: 2026-07-20
  checked: BLAST RADIUS ESCALATION — migration 062 redefined `calculate_vault_readiness()` to read `split_sheets` (line 209 `FROM split_sheets ss`). That function is `language plpgsql` with NO `SECURITY DEFINER`, i.e. SECURITY INVOKER, and is called by `update_vault_readiness()`, which migration 001 lines 446-460 wires as an AFTER INSERT/UPDATE/DELETE trigger on tracks, vault_documents, vault_assets, and tool_outputs.
  found: Empirically reproduced. `INSERT INTO tracks ...` as role `authenticated` → `42P17: infinite recursion detected in policy for relation "split_sheets"`. The same insert as `service_role` (BYPASSRLS) succeeds. Direct service_role SELECTs on both split-sheet tables also succeed.
  implication: The recursion is reachable from the CORE VAULT WRITE PATH, not just e-sign. Confirmed via grep that `app/api/vault/[projectId]/tracks/route.ts`, `.../assets/route.ts`, `.../documents/route.ts`, and `app/api/tools/[slug]/route.ts` all use `createApiClient()` (anon key + user JWT, RLS-subject). Every one of those fires the readiness trigger. service_role routes are the only ones that escape, which is why the `/approve/[token]` flow (service client throughout) still works and why this did not present as a total outage.

- timestamp: 2026-07-20
  checked: Whether replacing the recursive EXISTS subqueries with SECURITY DEFINER helpers could WIDEN visibility (the security-regression risk)
  found: In the original policies, each EXISTS subquery was itself RLS-filtered by the target table's policies — that is precisely why it recursed. "Initiator sees all parties" required `initiator_user_id = auth.uid()`, and split_sheets' own "Initiator manages split sheet" policy grants exactly the rows where `auth.uid() = initiator_user_id`; so the RLS filter on that subquery was a no-op for that predicate. Symmetrically, "Parties can view split sheets" required `user_id = auth.uid()`, and split_sheet_parties' "Party sees own row" grants exactly `auth.uid() = user_id`; again a no-op.
  implication: Bypassing RLS inside the helper functions cannot widen the result set, because the RLS that would have been applied was already implied by the predicate itself. The rewrite is semantics-preserving by construction, not merely by intent. Verified empirically by differential test.

## Resolution

root_cause: |
  Migrations 018 lines 82-101 create a mutually recursive RLS policy pair:
  "Initiator sees all parties" ON split_sheet_parties subqueries split_sheets, and
  "Parties can view split sheets" ON split_sheets subqueries split_sheet_parties.
  PostgreSQL expands RLS policy bodies during query rewrite; when the rewriter
  re-enters a relation already on its expansion stack it aborts with 42P17
  invalid_object_definition. Any query that pulls either table's SELECT policies
  into the rewrite — directly, or transitively through migration 062's esign_*
  policies, or through a RETURNING clause — fails before execution begins. Because
  rewrite precedes the executor's table-ACL check, 062's REVOKE of INSERT/UPDATE/
  DELETE never gets a chance to report 42501; the recursion error preempts it.
fix: |
  Migration 064 replaces each cross-table EXISTS subquery with a SECURITY
  DEFINER helper, following the public.no_block() precedent from migration 035
  (LANGUAGE sql STABLE SECURITY DEFINER, SET search_path = '', fully-qualified
  public.* table refs, REVOKE EXECUTE FROM PUBLIC/anon/authenticated then GRANT
  to authenticated only, COMMENT marking them policy-body helpers not RPCs):
    * public.is_split_sheet_initiator(sheet_id, uid) replaces the split_sheets
      subquery in "Initiator sees all parties" ON split_sheet_parties.
    * public.is_split_sheet_party(sheet_id, uid) replaces the split_sheet_parties
      subquery in "Parties can view split sheets" ON split_sheets.
  A SECURITY DEFINER function runs as its owner (the table owner), so RLS is not
  applied to the tables it reads; the rewriter never expands a policy inside the
  helper and the cycle terminates. Both rewritten policies are additionally
  scoped TO authenticated so anon matches no permissive policy and receives []
  rather than a "permission denied for function" error. Migrations 018, 062 and
  063 are untouched (already applied to remote); this is a forward-only fix.
verification: |
  Empirical, against real PostgreSQL (PGlite 0.5.4 / PG 18.3), running the
  verbatim text of migrations 018 + 062 (tables/grants/policies) + 064 under a
  Supabase-shaped preamble: roles authenticated/anon/service_role, auth.uid()
  reading request.jwt.claim.sub, Supabase default grants modelled by GRANT ALL
  after table creation followed by 062's verbatim REVOKE lines. Seed: one sheet,
  one initiator, one named party, one unclaimed party, one envelope, one signer.

  BEFORE 064 — 24 of 27 probes fail 42P17 (the 3 that don't are the bare
  INSERT-without-RETURNING shape, which returns 42501 and is what proved the
  privilege check is merely preempted rather than absent).

  AFTER 064 — zero 42P17 anywhere, and access semantics are exactly as required:
    * INITIATOR: sees their sheet; sees ALL parties (both rows, including the
      unclaimed one); sees the envelope and signer rows.
    * NAMED PARTY: sees the sheet they are named on; sees ONLY their own party
      row (1 of 2); sees the envelope and their own signer row.
    * OUTSIDER: [] on all five relations.
    * ALL THREE: every write probe on esign_envelopes / esign_envelope_signers
      returns 42501 insufficient_privilege — POST/PATCH/DELETE, both bare and in
      PostgREST's `WITH pgrst_source AS (... RETURNING *)` shape.
    * Readiness-trigger path: `INSERT INTO tracks` as authenticated now succeeds
      (was 42P17 for relation "split_sheets").
    * anon: [] on both base tables, and `SELECT public.is_split_sheet_party(...)`
      as anon → 42501 permission denied for function (no SECURITY DEFINER oracle).

  Security-regression check: the visible set cannot widen, because in the
  original policies the RLS applied to each EXISTS subquery was already implied
  by the predicate that subquery evaluated (see the 4th Evidence entry). Verified
  by differential observation above — the party still sees 1 of 2 party rows, not
  2 — and by two mutation tests against __tests__/migration-064.test.ts:
    * Mutation A (widen the parties policy to co-party visibility) → 3 tests fail.
    * Mutation B (USING (true) on split_sheets) → 3 tests fail.
  Migration file restored byte-identical after both mutations.

  Repo gates: 67 suites / 759 tests passing (baseline was 66 / 736 — +1 suite,
  +23 tests). `npx tsc --noEmit` clean. `npm run lint` clean.

  NOT verified: nothing was run against the remote Supabase database. Per the
  hard constraints, no `supabase db push` and no remote mutation was performed.
  scripts/verify-064-split-sheet-rls.mjs is the adversarial re-check to run
  after a human pushes 064.
files_changed:
  - supabase/migrations/064_fix_split_sheet_rls_recursion.sql (new)
  - __tests__/migration-064.test.ts (new)
  - scripts/verify-064-split-sheet-rls.mjs (new)
