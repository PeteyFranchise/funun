-- ============================================================
-- Funūn — Phase 38 P0 security hotfix (Codex adversarial review
--                2026-09-06, finding F1): the database-layer half of
--                closing a live custody-takeover path.
-- Migration 187: REPLACEs public.guard_custody_transfer_offered_by_holder()
--                (originally created by migration 185) so a custody offer
--                can come from NO ONE but the project's CURRENT custodian —
--                not a workspace owner/admin, which migration 185's
--                original trigger incorrectly permitted.
--
-- HUMAN-GATED — this project never runs `supabase db push`, `supabase db
-- reset`, or `supabase migration up` from an agent. That is the standing
-- convention stated verbatim in the headers of migrations 078, 080, 136,
-- 177, 181-186. This file is authored and text-tested
-- (__tests__/migration-187.test.ts) but must not be applied automatically —
-- the owner pushes it directly.
--
-- ─── WHY THIS EXISTS (F1, CRITICAL) ───────────────────────────────────────
-- Migration 185's guard_custody_transfer_offered_by_holder() permitted TWO
-- kinds of offerer: the project's current custodian, OR an active
-- owner/admin of a workspace holding a live attachment to the project. The
-- application-layer twin of that same permissiveness
-- (lib/workspaces/custody-transfer.ts's assertMayOffer) let a workspace
-- admin who is NOT the custodian offer a transfer, then accept their own
-- offer via assertMayRespond — one person performing both sides of an act
-- D-29 requires to be two-sided, with no grant required, live in already-
-- merged code. The application-layer fix (lib/workspaces/custody-
-- transfer.ts, same hotfix) DELETES that branch entirely; this migration is
-- the INDEPENDENT database-layer refusal, so the attack remains impossible
-- even if the application code regresses (defence in depth, T-38-13-01's
-- "second enforcement point" doctrine — both layers now enforce the SAME
-- rule, not two different ones).
--
-- ─── THE NEW RULE ──────────────────────────────────────────────────────────
-- An INSERT into workspace_custody_transfers is legal ONLY when BOTH:
--   NEW.offered_by   = (the project's current custodian, read live from
--                        vault_projects.user_id at insert time), AND
--   NEW.from_user_id = that SAME custodian.
-- No workspace_id, no workspace_member_role() lookup, no owner/admin
-- exception of any kind survives in this function body. workspace_id
-- remains a column on this table (recorded for attribution only, per the
-- application fix's own comment) but confers no offering authority at
-- either layer, in this migration or in lib/workspaces/custody-transfer.ts.
--
-- ─── MIGRATION NUMBERING ────────────────────────────────────────────────
-- This hotfix claims 187, which migration 185's header had reserved for
-- Phase 38.2. That reservation now MOVES: 188 is reserved for the separate,
-- pre-existing F3 fix (the `user_id` WITH CHECK hole inherited from
-- migration 078, unrelated to this hotfix and explicitly out of scope
-- here — see this hotfix's PLAN.md), and Phase 38.2's own billing/beta-flag
-- migrations move to 189-190. No other migration file is edited to reflect
-- this renumbering — this file is the single source of truth for it going
-- forward.
--
-- ADDITIVE ONLY, in the same sense migrations 182-185 use the word: this
-- file REPLACEs one existing trigger function and its trigger, both
-- originally created by migration 185, and touches NOTHING else — no other
-- table, column, policy, or live RLS branch is created, altered, or
-- dropped. No policy anywhere in this file. No table anywhere in this file.
--
-- UUID DEFAULTS: this migration adds no columns and no tables, so there is
-- no UUID default to restate.
-- ============================================================

-- ─── Replace the guard: current-holder-only, no workspace exception ──────
-- Still plain LANGUAGE plpgsql, not SECURITY DEFINER — the only role that
-- can ever reach this trigger at all is service_role, since migration 185
-- section (c) revokes every client INSERT path on this table. The one
-- change from migration 185's version: the workspace_member_role() OR
-- branch is gone entirely. offered_by and from_user_id must both equal the
-- project's current custodian, full stop — no exception for any role in
-- any workspace.
CREATE OR REPLACE FUNCTION public.guard_custody_transfer_offered_by_holder()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_custodian_id UUID;
BEGIN
  SELECT user_id INTO v_custodian_id
  FROM public.vault_projects
  WHERE id = NEW.project_id;

  IF v_custodian_id IS NULL
     OR NEW.offered_by <> v_custodian_id
     OR NEW.from_user_id <> v_custodian_id THEN
    RAISE EXCEPTION 'a custody offer must come from the project''s current custodian, naming that same custodian as from_user_id — no workspace owner or admin may offer on a Member''s behalf; custody transfer is two-sided, never unilateral (D-29)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_custody_transfer_offered_by_holder()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_custody_transfer_offered_by_holder ON public.workspace_custody_transfers;
CREATE TRIGGER guard_custody_transfer_offered_by_holder
  BEFORE INSERT ON public.workspace_custody_transfers
  FOR EACH ROW EXECUTE FUNCTION public.guard_custody_transfer_offered_by_holder();

-- ─── Schema-cache reload ───────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
