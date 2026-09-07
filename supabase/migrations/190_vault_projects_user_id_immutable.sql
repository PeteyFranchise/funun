-- ============================================================
-- Funūn — Phase 38.0.1 workspace-authorization remediation (WSR-25 / R-17):
--                closing the PRE-EXISTING vault_projects.user_id
--                custody-seizure hole inherited from migration 078.
-- Migration 190: a BEFORE UPDATE trigger,
--                guard_vault_projects_user_id_immutable(), making
--                vault_projects.user_id immutable to every RLS-governed
--                caller, plus the ONE structural exemption a legitimate
--                custody transfer needs — public.transfer_vault_project_
--                custody(), a SECURITY DEFINER function owned by the
--                database superuser.
--
-- HUMAN-GATED — this project never runs `supabase db push`, `supabase db
-- reset`, or `supabase migration up` from an agent. That is the standing
-- convention stated verbatim in the headers of migrations 078, 080, 136,
-- 177 and 181-189. This file is authored and text-tested
-- (__tests__/migration-190.test.ts) but must not be applied automatically —
-- the owner pushes it directly, reviewing the role literal against
-- 38.0.1-PREFLIGHT.md's D-PF-01 first. Migration 190 is INDEPENDENT of
-- everything else in Phase 38.0.1 and may be pushed alone, first, with its
-- own review.
--
-- ─── WHY THIS EXISTS (F3, pre-existing half; R-17 / WSR-25) ───────────────
-- Migration 078's `vault_projects_update_owner_or_editor` policy (restated
-- verbatim, unedited, by migration 186 section (e) to add the workspace
-- `edit_metadata` branch) constrains WHO may UPDATE a `vault_projects` row
-- but never WHAT `user_id` may become. Any of the three admitted callers —
-- the project's own owner, a Phase 21 co-owner/editor (live for weeks,
-- entirely independent of workspaces), or a workspace `edit_metadata` grant
-- holder — can smuggle a `user_id` change into an ordinary metadata UPDATE
-- and seize record custody outright (Codex adversarial review 2026-09-06,
-- finding F3, pre-existing half). This is NOT the F1 hotfix (migration 187,
-- the `workspace_custody_transfers` INSERT guard, already closed that hole)
-- — this is the older, `vault_projects` UPDATE-side half of the same family
-- of custody-authority findings.
--
-- ─── THE NEW RULE ──────────────────────────────────────────────────────────
-- `vault_projects.user_id` cannot change through an ordinary UPDATE, from
-- ANY caller — including the project's own owner acting directly. The ONLY
-- way `user_id` may change is through `public.transfer_vault_project_
-- custody()`, a SECURITY DEFINER function owned by `postgres` (this
-- project's confirmed superuser role — 38.0.1-PREFLIGHT.md P1, observed via
-- the Supabase management SQL endpoint). Custody moves only through the
-- D-29 two-sided transfer, full stop.
--
-- ─── D-PF-01 — WHY A STRUCTURAL EXEMPTION, NOT A ROLE ALLOW-LIST ──────────
-- 38.0.1-PREFLIGHT.md's P1 probe could not observe an ordinary authenticated
-- session's `current_user` (only a `postgres`-as-management-endpoint reading
-- was available without creating production state), leaving the naive
-- "block `authenticated`/`anon`, permit `service_role`" design
-- (RESEARCH.md Pattern 5's original sketch) unconfirmed as safe. The owner
-- resolved this explicitly (D-PF-01, resolved 2026-09-06): the trigger
-- refuses a `user_id` change from ALL ordinary traffic, and the two-sided
-- custody transfer is exempted STRUCTURALLY, not by role. A role allow-list
-- naming `service_role` would leave every present and future service-role
-- route free to move custody outside the audited D-29 flow — the same
-- shape as finding F1, where an application-layer branch quietly became an
-- authorization decision. Routing the one legitimate mutation through a
-- SECURITY DEFINER function owned by the database superuser makes the
-- exemption available ONLY to code that calls that specific function — a
-- raw `service_role` UPDATE straight against this table, today or in any
-- future route, stays refused, because `current_user` for that statement is
-- still `service_role`, never the function owner. This mirrors migration
-- 187's custody guard and migration 182's never-zero-owners trigger: both
-- refuse at the database rather than trusting the caller's claimed role.
--
-- ─── MIGRATION NUMBERING ────────────────────────────────────────────────
-- 190 is this fix. Migration 187's header had reserved 188 for it, but 188
-- and 189 were independently claimed by the Playbook A&R and BDT doctrine
-- migrations (188 renumbered to 198 to make room; 189 stayed as already
-- applied) — see those files' own headers. Phase 38.0.1's own chain now
-- runs 191-194; 195-196 remain reserved for Phase 38.2; 197-198 belong to
-- the Playbook entries above. No other migration file is edited to reflect
-- this — this file and 188/189's own headers are the source of truth.
--
-- ─── WHY A TRIGGER AND NOT A POLICY (R-17, Pitfall 5, CITED) ──────────────
-- A PostgreSQL RLS `WITH CHECK` clause is evaluated ONLY against the
-- proposed NEW row — it has no access to the row's stored OLD value, a
-- documented limitation (postgresql.org/message-id/20151216231504.GJ26804
-- %40moraine.isi.edu). Comparing NEW.user_id to OLD.user_id therefore
-- cannot be expressed as a "with check" clause at all; a BEFORE UPDATE FOR
-- EACH ROW trigger is the documented workaround, with guaranteed OLD/NEW
-- access. This migration edits NO policy and NO check clause anywhere —
-- migration 186's `vault_projects_update_owner_or_editor` policy is left
-- byte-for-byte untouched.
--
-- ADDITIVE ONLY: this file creates two new functions and one new trigger.
-- It touches no other table, no policy, no check clause, and no
-- pre-existing function. handle_new_user(), member_type, industry_roles,
-- capability_grants and project_members are not referenced (D-52).
--
-- UUID DEFAULTS: this migration adds no columns and no tables, so there is
-- no UUID default to restate.
--
-- ─── A COMPANION APPLICATION CHANGE IS REQUIRED BEFORE THIS IS PUSHED ─────
-- app/api/vault/custody-transfers/route.ts's accept branch currently
-- performs a direct .from('vault_projects').update({ user_id: ... }) call
-- on createServiceClient() — i.e. as service_role, not as this function's
-- owner. Under this migration's trigger, that raw UPDATE is REFUSED, the
-- same as any other caller's, because the structural exemption below is
-- available only to statements that run INSIDE
-- public.transfer_vault_project_custody(). That route must be changed to
-- call service.rpc('transfer_vault_project_custody', { p_project_id,
-- p_from_user_id, p_to_user_id }) in place of its current .update() call
-- BEFORE this migration is pushed — otherwise the owner-run non-regression
-- check (a real two-sided transfer) will fail. That one-call-site change is
-- technically clean — a single filtered UPDATE moving into a SECURITY
-- DEFINER RPC is a pattern already used by roughly twenty other
-- service-role call sites in this codebase (e.g. lib/security/upload-
-- admission.ts, lib/jobs/queue.ts, lib/invites/mintInvite.ts) — but it
-- falls outside this plan's declared two-file scope (supabase/migrations/
-- 190_vault_projects_user_id_immutable.sql and
-- __tests__/migration-190.test.ts only) and is therefore NOT made by this
-- migration. See 38.0.1-02-SUMMARY.md's "D-PF-01 escape hatch" section for
-- the full account. This is surfaced, not silently worked around, per the
-- D-PF-01 resolution's binding escape-hatch instruction.
-- ============================================================

-- ─── The structural exemption: the ONE legitimate user_id mutation ────────
-- SECURITY DEFINER so that, for the duration of this function's execution
-- (and any trigger it fires), current_user becomes this function's OWNER —
-- the database superuser (postgres, confirmed by 38.0.1-PREFLIGHT.md P1) —
-- regardless of which role actually called it. This is what makes the
-- guard trigger's exemption below STRUCTURAL rather than role-based: no
-- service_role (or any other role) statement can present as postgres
-- except by calling through this function. SET search_path = '' follows
-- every SECURITY DEFINER precedent in this codebase (064/078/136/182). The
-- same .eq('id', project_id).eq('user_id', from_user_id) double filter
-- app/api/vault/custody-transfers/route.ts's accept branch already uses is
-- reproduced here verbatim as the WHERE clause — a stale-custodian offer
-- (the custodian changed between offer and accept) matches zero rows and
-- returns NULL, exactly as it does today.
CREATE OR REPLACE FUNCTION public.transfer_vault_project_custody(
  p_project_id UUID,
  p_from_user_id UUID,
  p_to_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated_id UUID;
BEGIN
  UPDATE public.vault_projects
  SET user_id = p_to_user_id
  WHERE id = p_project_id
    AND user_id = p_from_user_id
  RETURNING id INTO v_updated_id;

  RETURN v_updated_id;
END;
$$;

-- Deliberately NOT granted to authenticated or anon — this is a
-- trigger-context exemption path, not a general-purpose client RPC.
-- service_role keeps Supabase's default schema-level EXECUTE grant (the
-- same posture 182/186's SECURITY DEFINER helpers rely on for
-- authenticated); 38.0.1-PREFLIGHT.md's S1 finding that
-- `REVOKE ... FROM PUBLIC` alone does not touch service_role's
-- directly-granted privileges is exactly why calling THROUGH this
-- function, rather than merely being GRANTED as service_role, is the
-- actual security boundary here — the boundary is "did this statement run
-- inside this specific function", not "which role connected".
REVOKE EXECUTE ON FUNCTION public.transfer_vault_project_custody(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.transfer_vault_project_custody(UUID, UUID, UUID) IS
  'The ONLY sanctioned path that may change vault_projects.user_id (D-29 two-sided custody transfer, WSR-25). SECURITY DEFINER, owned by postgres, so a call through this function is the sole way current_user becomes the exemption identity guard_vault_projects_user_id_immutable() recognises. Intended to be called via service.rpc() from app/api/vault/custody-transfers/route.ts''s accept branch (a companion application change, tracked separately -- see this migration''s header) after both parties'' authority has already been checked in application code (assertMayOffer, assertMayRespond). Reproduces the existing stale-custodian guard as a WHERE-clause double filter: returns NULL, changing nothing, if p_from_user_id no longer matches the project''s current custodian.';

-- ─── The guard: refuses a user_id change from every caller except the ────
--     structural exemption above.
-- NOT SECURITY DEFINER — it needs no elevated read; current_user is the
-- exact fact it is testing, and elevating it would make that read
-- meaningless (mirrors migration 187's identical reasoning for its own
-- guard). Fires BEFORE UPDATE FOR EACH ROW on every vault_projects UPDATE,
-- regardless of which RLS branch (078/186's owner, co-owner/editor, or
-- edit_metadata) admitted the statement in the first place — the trigger
-- does not know or care which policy branch fired; it only compares OLD
-- and NEW.
CREATE OR REPLACE FUNCTION public.guard_vault_projects_user_id_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- current_user is 'postgres' ONLY for the duration of a call into
  -- transfer_vault_project_custody() above (that function's SECURITY
  -- DEFINER owner) -- never for an ordinary 'authenticated', 'anon' or
  -- 'service_role' statement issued directly against this table. This is
  -- the structural exemption D-PF-01 (resolved 2026-09-06) requires in
  -- place of a role allow-list: the rule is not "service_role is
  -- permitted", it is "only this one function's execution context is
  -- permitted", regardless of who called it.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     AND current_user NOT IN ('postgres') THEN
    RAISE EXCEPTION
      'vault_projects.user_id cannot be changed directly -- record custody moves only through the two-sided custody-transfer flow (D-29), via public.transfer_vault_project_custody()'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_vault_projects_user_id_immutable()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_vault_projects_user_id_immutable ON public.vault_projects;
CREATE TRIGGER trg_guard_vault_projects_user_id_immutable
  BEFORE UPDATE ON public.vault_projects
  FOR EACH ROW EXECUTE FUNCTION public.guard_vault_projects_user_id_immutable();

-- ─── Schema-cache reload ───────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
