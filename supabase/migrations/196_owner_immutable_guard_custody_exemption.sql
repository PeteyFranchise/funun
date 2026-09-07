-- ============================================================
-- Funūn — production-bug fix, found by behavioural verification 2026-09-07:
-- Migration 196: teach public.guard_owner_immutable() (migration 139) the
--                SAME structural custody exemption migration 190 already
--                grants, but scoped to public.vault_projects ONLY, so the
--                sanctioned two-sided custody transfer can finally run.
--                public.works keeps its ABSOLUTE, unexempted guard.
--
-- HUMAN-GATED — this project never runs `supabase db push`, `supabase db
-- reset`, or `supabase migration up` from an agent. That is the standing
-- convention stated verbatim in the headers of migrations 078, 080, 136,
-- 177, 181-190. This file is authored and text-tested
-- (__tests__/migration-196.test.ts) but must not be applied automatically —
-- the owner pushes it directly. Migrations 186-195 are already applied or
-- held; 196 is INDEPENDENT of every held migration and may be pushed alone.
--
-- ─── THE BUG (confirmed on production 2026-09-07) ─────────────────────────
-- Calling public.transfer_vault_project_custody() — the sanctioned,
-- SECURITY DEFINER, D-29 two-sided custody path added by migration 190 —
-- raises:
--
--   42501: ownership is immutable; user_id cannot be changed by update
--
-- That message is NOT migration 190's. It comes from
-- public.guard_owner_immutable() (migration 139), a BEFORE UPDATE FOR EACH
-- ROW trigger that migration 139 installed on BOTH public.works AND
-- public.vault_projects, and which refuses ANY user_id change with no
-- exemption of any kind. Migration 190 correctly exempted its own guard;
-- 139's older, differently-named guard was never touched, so it fires
-- second and refuses the very statement 190 exists to permit.
--
-- Custody transfer has therefore NEVER worked. The pre-190 route did a raw
-- UPDATE, which 139 blocked; the post-190 route calls the RPC, which 139
-- also blocks. The missing-function defect fixed earlier on 2026-09-07 was
-- real, but it was only the outer layer of the same failure.
--
-- ─── ROOT CAUSE: A FACTUALLY WRONG ASSUMPTION IN MIGRATION 139 ────────────
-- Migration 139's closing header paragraph states that a future ownership
-- transfer must run through
--
--   "a SECURITY DEFINER function owned by the table owner, which this
--    trigger does not fire against"
--
-- That parenthetical is WRONG, and it is the root cause of this bug.
-- SECURITY DEFINER changes the EFFECTIVE USER used for permission checks
-- (and therefore what current_user reports) for the duration of the call.
-- It does NOT bypass triggers. A BEFORE UPDATE FOR EACH ROW trigger fires
-- on an UPDATE issued inside a SECURITY DEFINER function exactly as it
-- does on an UPDATE issued anywhere else. Migration 139's design intent —
-- "ownership transfer, when built, goes through a definer path" — was
-- right; its stated mechanism for how that path would be admitted was not.
-- This migration supplies the mechanism 139 assumed it already had.
--
-- Static analysis could not have caught this. Migration 190's text-lock
-- tests pass, its function exists, the route calls it correctly, and the
-- Part A structural probe confirmed a trigger matching %user_id_immutable%
-- is present and enabled — that pattern matched 190's trigger and never
-- saw 139's differently-named one. Only Part B, executing the real RPC,
-- surfaced it.
--
-- ─── WHY THE EXEMPTION IS SCOPED BY TG_TABLE_NAME ─────────────────────────
-- public.guard_owner_immutable() is a SHARED trigger function: migration
-- 139 attached it to two tables under the same trigger name. A blanket
-- exemption in this function body would silently weaken public.works too.
--
-- public.works DELIBERATELY KEEPS THE ABSOLUTE GUARD. There is no
-- sanctioned ownership-transfer path for works — no equivalent of
-- transfer_vault_project_custody(), no D-29 two-sided flow, no offer/accept
-- representation. Until such a path is designed and separately authorized,
-- works.user_id stays immutable to EVERYONE, owner and superuser alike, and
-- the exemption below must never be widened to reach it. TG_TABLE_NAME is
-- the trigger-context fact that makes that scoping enforceable inside a
-- function body shared by two triggers, and __tests__/migration-196.test.ts
-- text-locks it so a later edit cannot widen it unnoticed.
--
-- ─── A STRUCTURAL EXEMPTION, NOT A ROLE ALLOW-LIST (D-PF-01) ──────────────
-- The exemption below mirrors migration 190's guard verbatim where it
-- applies, and inherits its reasoning unchanged (D-PF-01, owner-resolved
-- 2026-09-06): current_user is 'postgres' ONLY for the duration of a call
-- into public.transfer_vault_project_custody() (that function's SECURITY
-- DEFINER owner, this project's confirmed superuser role per
-- 38.0.1-PREFLIGHT.md P1) — never for an ordinary 'authenticated', 'anon'
-- or 'service_role' statement issued directly against the table. The rule
-- being expressed is NOT "postgres may move ownership" and NOT
-- "service_role is permitted"; it is "only this one function's execution
-- context, and only on this one table, is permitted", regardless of who
-- called it. A role allow-list naming service_role would leave every
-- present and future service-role route free to move custody outside the
-- audited D-29 flow — the same shape as finding F1, where an
-- application-layer branch quietly became an authorization decision.
--
-- ─── WHAT THIS MIGRATION DOES AND DOES NOT DO ────────────────────────────
-- CREATE OR REPLACE FUNCTION on public.guard_owner_immutable() ONLY. It
-- does NOT drop, recreate, alter, disable or re-point EITHER of migration
-- 139's two triggers — both keep firing, on both tables, unchanged; only
-- the shared body they call is replaced. It creates no table, no policy, no
-- check clause, and no new function. It does not touch public.works in any
-- way. It does not touch migration 190's
-- guard_vault_projects_user_id_immutable(), which already has its own
-- correct exemption and continues to guard vault_projects independently —
-- after this migration BOTH triggers admit exactly the same single
-- execution context, so vault_projects.user_id remains immutable to every
-- ordinary caller, refused by two independent guards rather than one.
--
-- The REVOKE below is restated because CREATE OR REPLACE preserves existing
-- grants; re-issuing it is idempotent and keeps this file self-contained if
-- ever replayed against a fresh database.
--
-- ─── MIGRATION NUMBERING ──────────────────────────────────────────────────
-- 196 was reserved for Phase 38.0.2, which has no phase directory and no
-- authored files, so this fix takes it. Phase 38.0.2 shifts to 197-198 and
-- Phase 38.2 to 199-200. The LIVE LEDGER table under Phase 38.0.1 in
-- .planning/ROADMAP.md is the authoritative record and has been updated.
-- The numbering comments inside migrations 191, 192 and 193 are text-locked
-- by their own suites, already reviewed, and already documented as off by
-- one — they are deliberately NOT edited here.
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_owner_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- IS DISTINCT FROM is null-safe; user_id is NOT NULL on both tables, so
  -- this is a plain inequality in practice. A no-op update (same id) is
  -- allowed, so ordinary saves that happen to include user_id still pass.
  --
  -- The exemption is doubly scoped and both halves must hold:
  --   TG_TABLE_NAME = 'vault_projects' — public.works, the other table this
  --     shared function guards, has no sanctioned transfer path and keeps
  --     the absolute guard for everyone, superuser included.
  --   current_user IN ('postgres')     — true ONLY inside a call to
  --     public.transfer_vault_project_custody() (migration 190), whose
  --     SECURITY DEFINER owner is that role. A raw UPDATE from
  --     service_role, authenticated or anon is still refused.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     AND NOT (TG_TABLE_NAME = 'vault_projects' AND current_user IN ('postgres')) THEN
    RAISE EXCEPTION 'ownership is immutable; user_id cannot be changed by update'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_owner_immutable() IS
  'BEFORE UPDATE guard for parent tables whose UPDATE policy widens to members: rejects any change to user_id, closing the ownership-takeover path where a member rewrites user_id to themselves and passes WITH CHECK against the value they just wrote (migration 078 / 136 pattern). Trigger-internal only. Migration 196 adds ONE structural exemption, scoped by TG_TABLE_NAME to public.vault_projects alone: an UPDATE running inside public.transfer_vault_project_custody() (SECURITY DEFINER, owned by postgres) may move custody, per the D-29 two-sided flow. public.works keeps the absolute guard with no exemption, because it has no sanctioned transfer path. Migration 139 wrongly assumed this trigger would not fire inside a SECURITY DEFINER function; it does, which is why the exemption must be explicit.';

-- Trigger-internal only: clients never call this directly, and the trigger
-- fires regardless of caller EXECUTE. Withhold the grant to match the
-- codebase's guard-function posture (migrations 070 / 126 / 139 / 190).
REVOKE EXECUTE ON FUNCTION public.guard_owner_immutable()
  FROM PUBLIC, anon, authenticated;

-- ─── Schema-cache reload ───────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
