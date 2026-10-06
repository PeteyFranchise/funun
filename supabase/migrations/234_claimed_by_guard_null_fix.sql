-- 234_claimed_by_guard_null_fix.sql
--
-- Migration 233 shipped a guard that never fires. This fixes it.
--
-- WHAT WENT WRONG
--
-- 233 declared:
--
--   v_write_mode     TEXT    := NULLIF(current_setting('funun.collaborators_claimed_by_write', TRUE), '');
--   v_verified_claim BOOLEAN := v_write_mode = 'verified_claim';
--   ...
--   IF v_changing AND NOT v_privileged AND NOT v_verified_claim THEN RAISE ...
--
-- For every caller that is NOT one of the two legitimate writer functions,
-- the GUC is unset, so NULLIF yields NULL, so `NULL = 'verified_claim'`
-- yields NULL -- not FALSE. `NOT NULL` is NULL, and `TRUE AND TRUE AND NULL`
-- is NULL. PL/pgSQL does not take the THEN branch on a NULL condition, so
-- the RAISE was unreachable on every path that mattered.
--
-- The only inputs that could have reached the RAISE were ones where
-- v_verified_claim was already FALSE, which requires the GUC to be set to
-- some non-NULL value other than 'verified_claim'. Nothing sets it to such a
-- value. The guard was inert in production from the moment it was applied.
--
-- 233's own comment claimed the NULLIF normalization existed so the
-- comparison would be "correct rather than accidentally permissive". The
-- NULLIF is what produced the NULL, and therefore what made it permissive.
-- That comment is removed rather than reworded; it asserted the opposite of
-- what the code did, which is how it survived review.
--
-- HOW IT WAS CAUGHT
--
-- Behavioural probe against production, 2026-10-05: a forged UPDATE setting
-- claimed_by to another member's UUID, run with request.jwt.claims simulating
-- an authenticated caller, returned UPDATE 1 instead of 42501. The trigger was
-- confirmed attached (tgenabled='O', tgtype=23, no WHEN clause), the deployed
-- function body byte-identical to the migration, auth.role() confirmed
-- returning 'authenticated', session_replication_role confirmed 'origin', and
-- no other function found writing the GUC. The function was then temporarily
-- replaced inside a rolled-back transaction with one that raised
-- unconditionally and printed its inputs; it reported
--
--   op=UPDATE old=<NULL> new=aff02cb8-... role=authenticated mode=<NULL>
--
-- which is the NULL third term, proven rather than inferred.
--
-- This is the same lesson as migration 230's column REVOKE: the structural
-- check ("the statement ran", "the trigger is attached", "the body matches")
-- passed in both cases while the control did nothing. Only asking the
-- database to refuse a real forged write distinguishes them.
--
-- WHY 145 AND 161 ARE NOT AFFECTED
--
-- Their GUC guards use the fail-closed shape, which handles NULL explicitly:
--
--   IF v_write_mode IS NULL OR v_write_mode NOT IN (...) THEN RAISE ...
--
-- Migration 231's tracks_guard_work_id_write() has only two terms, both
-- guaranteed non-NULL, so its passing behavioural probe was genuine.
-- 233 is the only guard in the corpus with this defect.
--
-- THE FIX
--
-- v_verified_claim is made null-safe by construction with IS NOT DISTINCT
-- FROM, which returns TRUE or FALSE and never NULL. COALESCE would also work;
-- IS NOT DISTINCT FROM is preferred because it cannot be dropped by a later
-- edit without the comparison visibly changing shape.
--
-- Nothing else about 233 changes: same function name, same trigger, same
-- trust tiers, same two legitimate writers (which already set the GUC and are
-- untouched here), same error code.

CREATE OR REPLACE FUNCTION public.collaborators_guard_claimed_by_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  -- auth.role() reads the request.jwt.claims session GUC -- a property of
  -- the CONNECTION, not of SECURITY DEFINER's current_user switch.
  -- current_user would instead see claim_collaborators()'s or
  -- link_existing_member_collaborator()'s OWNER during either function's
  -- call, never the caller -- using it here would make this guard blind to
  -- both legitimate writers it must allow through. Matches migration 231's
  -- identical reasoning for tracks_guard_work_id_write().
  v_role TEXT := (SELECT auth.role());
  -- NULL covers a direct database session (the owner via `supabase db
  -- push`, the Supabase SQL editor, a migration's own backfill) -- no
  -- request.jwt.claims exists there, so auth.role() returns NULL. That is
  -- the same pre-existing admin trust tier this table's owner-run
  -- migrations already operate at, not a new privilege introduced by this
  -- guard. 'service_role' covers claim_collaborators()'s only live RPC
  -- path (app/api/claim-collaborators/route.ts:31-32's completeSignupClaim,
  -- via the service client) and any future service-role-mediated write.
  v_privileged BOOLEAN := v_role IS NULL OR v_role = 'service_role';
  -- The transaction-local GUC migration 233's two redefined writer
  -- functions set immediately before their one claimed_by-touching
  -- statement. current_setting with the TRUE (no-error) flag returns '' for
  -- an unset GUC, so '' and NULL must both mean "not verified".
  v_write_mode TEXT := NULLIF(current_setting('funun.collaborators_claimed_by_write', TRUE), '');
  -- IS NOT DISTINCT FROM, not `=`. With `=`, an unset GUC made this NULL,
  -- which made `NOT v_verified_claim` NULL, which made the whole IF
  -- condition NULL -- and PL/pgSQL skips the THEN branch on NULL. That was
  -- migration 233's defect: the guard never raised for any caller.
  v_verified_claim BOOLEAN := v_write_mode IS NOT DISTINCT FROM 'verified_claim';
  -- Mirrors migration 231's exact v_changing shape for both INSERT and
  -- UPDATE: a forged write can arrive either as a brand-new row already
  -- carrying someone else's id, or as an UPDATE naming the column.
  v_changing BOOLEAN := (TG_OP = 'INSERT' AND NEW.claimed_by IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND NEW.claimed_by IS DISTINCT FROM OLD.claimed_by);
BEGIN
  IF v_changing AND NOT v_privileged AND NOT v_verified_claim THEN
    RAISE EXCEPTION 'collaborators.claimed_by can only be written by a verified claim path (claim_collaborators or link_existing_member_collaborator), the service role, or a direct database session'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.collaborators_guard_claimed_by_write() IS
  'BEFORE INSERT OR UPDATE guard on public.collaborators rejecting any client write to claimed_by unless auth.role() is NULL (direct database session), ''service_role'', or the transaction-local GUC funun.collaborators_claimed_by_write is set to ''verified_claim'' by claim_collaborators() or link_existing_member_collaborator(). Introduced by migration 233 to close Pass 6 C-1; migration 234 fixed a three-valued-logic defect that made 233''s version never raise (an unset GUC compared with = yielded NULL, so the IF condition was NULL and the THEN branch was skipped). See 234''s header for the behavioural evidence.';

REVOKE EXECUTE ON FUNCTION public.collaborators_guard_claimed_by_write() FROM PUBLIC, anon, authenticated;
