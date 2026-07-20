-- ============================================================
-- Funūn — Wave 4: The Green Room
-- Migration 064: break the split_sheets ↔ split_sheet_parties RLS
--                policy recursion introduced by migration 018.
--
-- An executor agent must NEVER run `supabase db push` for this migration.
-- The live push against the remote database is a human-gated checkpoint
-- (mirrors migrations 058/062/063's "do not push from an executor agent"
-- convention). This file is authored and tested (string-assertion test in
-- __tests__/migration-064.test.ts) but must not be applied automatically.
--
-- MIGRATION NUMBER COLLISION RISK: Phase 16's drafted plans reference
-- migration numbers 062-066. Phase 17 already claimed 062 and 063. This
-- migration claims 064. If Phase 16's drafts are executed before this
-- lands, its 064 must be renumbered — same touch-up 062's header called
-- for. Whichever pushes first wins the number.
--
-- UUID DEFAULTS: this migration creates no tables and needs no UUID
-- default. Had it needed one it would use gen_random_uuid(), NOT
-- uuid_generate_v4() — see migration 062's header for why (uuid-ossp lives
-- in the `extensions` schema and is not on the migration session's
-- search_path; 062's first push attempt failed on exactly that).
--
-- ─── THE BUG ────────────────────────────────────────────────────────────
-- Migration 018 created a mutually recursive pair of RLS policies:
--
--   "Initiator sees all parties"  ON split_sheet_parties (018 line 82)
--       → EXISTS (SELECT 1 FROM split_sheets ...)
--   "Parties can view split sheets" ON split_sheets      (018 line 95)
--       → EXISTS (SELECT 1 FROM split_sheet_parties ...)
--
-- Each policy body reads the other policy's table. PostgreSQL expands RLS
-- policy bodies during QUERY REWRITE (rewriteHandler.c, fireRIRrules); when
-- the rewriter re-enters a relation already on its expansion stack it
-- aborts the statement with SQLSTATE 42P17 invalid_object_definition,
-- `infinite recursion detected in policy for relation "..."`.
--
-- Every query whose rewrite pulls in either table's SELECT policies fails
-- before execution begins, for EVERY user — initiator, named party, and
-- outsider alike. The failure is user-independent because it happens at
-- rewrite time, before a single row is examined.
--
-- Reachable from three directions, all confirmed by reproduction against
-- real PostgreSQL:
--   1. Directly — any authenticated SELECT on split_sheets or
--      split_sheet_parties (the /split-sheets surface, currently orphaned,
--      which Phase 18 exists to un-orphan).
--   2. Transitively via migration 062's esign_* SELECT policies, which
--      subquery both tables. This is how the bug was first observed.
--   3. Via the readiness trigger. Migration 062 taught
--      calculate_vault_readiness() to read split_sheets, and that function
--      is SECURITY INVOKER. Migration 001 wires it (through
--      update_vault_readiness()) as an AFTER trigger on tracks,
--      vault_documents, vault_assets, and tool_outputs. So an authenticated
--      INSERT of a track — the core vault write path — also returns 42P17.
--
-- Note on the 42501-vs-42P17 ordering: migration 062 REVOKEs INSERT/UPDATE/
-- DELETE/TRUNCATE on the esign_* tables from authenticated+anon, so a client
-- write there SHOULD surface 42501 insufficient_privilege. It does not,
-- because table ACLs are checked at EXECUTOR STARTUP (ExecCheckPermissions
-- in InitPlan) while RLS is expanded earlier, during REWRITE. The rewrite
-- error preempts the privilege error. A bare `INSERT ... VALUES` with no
-- RETURNING does return 42501 — but PostgREST always emits RETURNING, which
-- puts a read of the table into the query tree and drags the SELECT policies
-- (and thus the cycle) into the rewrite. The REVOKE is in force; it was only
-- ever masked.
--
-- ─── THE FIX ────────────────────────────────────────────────────────────
-- Replace each cross-table EXISTS subquery with a SECURITY DEFINER helper,
-- following the public.no_block() precedent established in migration 035.
-- A SECURITY DEFINER function runs as its owner (the table owner), so RLS is
-- not applied to the tables it reads; the rewriter therefore never expands a
-- policy inside the helper and the cycle is cut.
--
-- THIS DOES NOT WIDEN VISIBILITY. In the original policies each EXISTS
-- subquery was itself RLS-filtered — that is exactly why it recursed — but
-- that filter was a no-op for these two predicates:
--   * "Initiator sees all parties" required initiator_user_id = auth.uid(),
--     and split_sheets' own "Initiator manages split sheet" policy grants
--     precisely the rows where auth.uid() = initiator_user_id.
--   * "Parties can view split sheets" required user_id = auth.uid(), and
--     split_sheet_parties' "Party sees own row" policy grants precisely the
--     rows where auth.uid() = user_id.
-- In both cases the RLS the helper bypasses was already implied by the
-- predicate the helper evaluates, so the visible set is unchanged by
-- construction. Access semantics after this migration are identical to
-- 018's INTENT: a sheet initiator sees all parties on their sheets and
-- those sheets; a named party sees their own party row and the sheets they
-- are named on; nobody else sees either row.
--
-- Deliberately NOT changed: a named party still cannot see CO-PARTIES' rows
-- (018 grants only "Party sees own row"). That is arguably under-permissive
-- for a document every signer must review in full, but widening it here
-- would be a security change smuggled into a recursion fix. The
-- /approve/[token] flow already serves co-party data through
-- createServiceClient(), so nothing depends on RLS to widen. Left as-is.
-- ============================================================

-- ─── Helper 1: is this sheet's initiator the given user? ────────────────
-- Replaces the split_sheets subquery in "Initiator sees all parties".
--
-- Takes the user id as a parameter rather than calling auth.uid() internally
-- so that SET search_path = '' does not have to reach into the auth schema
-- (same shape as no_block(a, b) in migration 035).
--
-- SET search_path = '' with fully-qualified public.split_sheets prevents a
-- search-path-hijacking attack in which a malicious `split_sheets` table
-- earlier in a caller-controlled search path is read instead of the real one
-- (the T-08-04 mitigation migration 035 applies to no_block()).
--
-- STABLE lets the planner cache the result within a single statement when
-- the policy wraps the call as (SELECT ...), avoiding per-row re-evaluation.
CREATE OR REPLACE FUNCTION public.is_split_sheet_initiator(sheet_id UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.split_sheets
    WHERE id = sheet_id AND initiator_user_id = uid
  )
$$;

-- ─── Helper 2: is the given user a named party on this sheet? ───────────
-- Replaces the split_sheet_parties subquery in "Parties can view split
-- sheets". A NULL uid (unauthenticated) matches nothing: `user_id = NULL`
-- is never true, so EXISTS is false.
CREATE OR REPLACE FUNCTION public.is_split_sheet_party(sheet_id UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.split_sheet_parties
    WHERE split_sheet_id = sheet_id AND user_id = uid
  )
$$;

-- Intended for use inside RLS policy USING clauses, not as client RPCs.
-- Revoke the blanket PostgREST RPC exposure every function in the public
-- schema gets by default, then grant back only to authenticated — anon has
-- no legitimate split-sheet access and must not get a SECURITY DEFINER
-- oracle for "is user X a party on sheet Y". Mirrors migration 035.
REVOKE EXECUTE ON FUNCTION public.is_split_sheet_initiator(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_split_sheet_initiator(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_split_sheet_party(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_split_sheet_party(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.is_split_sheet_initiator(uuid, uuid) IS
  'True when uid is the initiator of the given split sheet. SECURITY DEFINER so it can be called from split_sheet_parties'' RLS policy without re-entering split_sheets'' policies (which would recurse — see migration 064). Intended for RLS policy USING clauses wrapped as (SELECT ...), not as a client-invoked RPC.';

COMMENT ON FUNCTION public.is_split_sheet_party(uuid, uuid) IS
  'True when uid is a named party on the given split sheet. SECURITY DEFINER so it can be called from split_sheets'' RLS policy without re-entering split_sheet_parties'' policies (which would recurse — see migration 064). Intended for RLS policy USING clauses wrapped as (SELECT ...), not as a client-invoked RPC.';

-- ─── Rewrite the two recursive policies ─────────────────────────────────
-- Both are restricted TO authenticated. Under 018 they were TO PUBLIC, which
-- meant an anon request evaluated them too — and, once the helpers' EXECUTE
-- is revoked from anon, would fail with "permission denied for function"
-- instead of returning an empty set. Scoping the policies to authenticated
-- means anon simply matches no permissive policy and gets [] , which is the
-- correct and strictly tighter outcome. No role gains access: under 018 an
-- anon caller had auth.uid() = NULL and matched neither policy anyway, and
-- service_role bypasses RLS entirely.

DROP POLICY IF EXISTS "Initiator sees all parties" ON split_sheet_parties;
CREATE POLICY "Initiator sees all parties" ON split_sheet_parties
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_split_sheet_initiator(split_sheet_parties.split_sheet_id, auth.uid()))
  );

DROP POLICY IF EXISTS "Parties can view split sheets" ON split_sheets;
CREATE POLICY "Parties can view split sheets" ON split_sheets
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_split_sheet_party(split_sheets.id, auth.uid()))
  );

-- ─── Left untouched, deliberately ───────────────────────────────────────
-- "Party sees own row" ON split_sheet_parties  — USING (auth.uid() = user_id)
-- "Initiator manages split sheet" ON split_sheets
--                                 — USING/WITH CHECK (auth.uid() = initiator_user_id)
-- Neither references the other table, so neither participates in the cycle.
-- Migration 062's four esign_* SELECT policies are also untouched: they
-- subquery split_sheets and split_sheet_parties, but once those two tables'
-- own policies stop referencing each other the transitive path terminates.
