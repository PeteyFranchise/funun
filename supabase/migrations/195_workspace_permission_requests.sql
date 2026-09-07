-- ============================================================
-- Funūn — Phase 38.0.1 (workspace-authorization-remediation): Plan 15.
-- Migration 195: public.workspace_permission_requests — the ASK.
--                One row per permission a workspace has asked a Member for,
--                plus the two-trigger integrity guard (the denormalised
--                member_user_id can never drift from its relationship; a
--                decided row can never be re-decided) and five RLS policies
--                expressing four rules.
--
-- HUMAN-GATED — this project never runs `supabase db push`, `supabase db
-- reset`, `supabase migration up`, or `supabase db query` from an agent.
-- That is the standing convention stated verbatim in the headers of
-- migrations 078, 080, 136, 177 and 181-194. This file is authored and
-- text-tested (__tests__/migration-195.test.ts) but must not be applied
-- automatically. Plan 15's own checkpoint is a REVIEW-AND-HOLD, not a push
-- authorisation.
--
-- ─── THE ONE PROPERTY THAT MATTERS, STATED BEFORE ANYTHING ELSE ──────────
-- A PERMISSION REQUEST IS NOT A GRANT. THIS TABLE IS NOT CONSULTED BY ANY
-- AUTHORIZATION PATH, ANYWHERE, EVER.
--
-- Concretely, and each of these is asserted by __tests__/migration-195.test.ts
-- so a future edit that breaks one fails the suite rather than drifting:
--   * No row here carries a `parent_grant_id`, and there is no such column
--     below. This table is not in the grant lineage at all — migration
--     191's `workspace_grants_consent_root_or_lineage_check` is NOT relaxed,
--     widened, dropped or otherwise touched by this file, and must not be.
--     The whole design of R-19 is that the ask lives OUTSIDE the lineage
--     precisely so that constraint can stay as strict as it is.
--   * `public.workspace_grant_lineage_live` (migration 192) does not read
--     this table and gains no reference to it here.
--   * `public.workspace_project_permission` (migration 192) — the six-hop
--     helper every workspace read funnels through — does not read this
--     table and gains no reference to it here.
--   * No policy on any OTHER table is created, dropped or altered by this
--     file. No existing function is redefined by this file. Nothing here
--     can widen an existing read path even by accident, because this file
--     names no pre-existing policy or function at all.
--   * A row in state 'approved' still confers nothing on its own. Approval
--     is recorded here; the ACCESS it corresponds to exists only because
--     `issueMemberConsent` (lib/workspaces/consent-service.ts) separately
--     wrote a `source = 'member_consent'` row into `workspace_grants`, and
--     that grant row is what every read is authorized against. Delete every
--     row in this table and no caller anywhere gains or loses one byte of
--     access.
--
-- This table is a PROPOSAL OBJECT — the third of three in this phase, and
-- deliberately the same shape as its two siblings: R-08's `proposed`
-- agreement evidence (a workspace drafts it; it confers nothing until the
-- subject Member confirms) and R-12/D-05's `proposed` roster relationship
-- (a workspace names a Member; it confers nothing until the Member
-- accepts). "The workspace proposes, the subject confirms" is now the
-- uniform answer to all three questions a workspace can ask about a Member.
--
-- ─── WHY THIS EXISTS (R-19 / WSR-28, discovered during execution) ────────
-- A workspace had no way to ASK for a permission. Verified during plan 07
-- and re-verified independently at plan 15: there is no request
-- representation anywhere in the 194 migrations preceding this one, and
-- migration 191's `workspace_grants_consent_root_or_lineage_check` requires
-- every non-`member_consent` grant row to carry a non-null
-- `parent_grant_id`. Together those two facts mean a workspace physically
-- cannot record an ask until a Member consent root ALREADY EXISTS — a
-- chicken-and-egg that makes WSR-27's primary story ("{Workspace} wants
-- access — approve or decline") unreachable, and reduces the Member's
-- consent surface to a settings page they would have to find unprompted.
--
-- The owner's decision (2026-09-06) was to add the missing object rather
-- than drop the story. Two alternatives were rejected on the record:
-- reusing agreement evidence as the ask channel (evidence declares
-- free-text scope, not one of the nineteen catalogue permissions, so
-- "approve/decline per permission" degrades into approving a sentence), and
-- Member-initiated-only (safe, but the workspace can never prompt, so the
-- layer this phase spent itself fixing would stay effectively unused).
--
-- ─── MIGRATION NUMBERING ─────────────────────────────────────────────────
-- Migration 191's header reserved 195-196 for Phase 38.0.2. R-19 REASSIGNS
-- 195 to this phase, on the owner's decision and on a verified basis:
-- Phase 38.0.2 has no phase directory and no authored files, and nothing in
-- the 190-195 range is applied to production. 190, 191, 192, 193 and 194
-- are all authored-but-unapplied and push TOGETHER WITH THIS FILE in ONE
-- window at plan 11's joint checkpoint. 196 remains reserved for Phase
-- 38.0.2; 197-198 remain reserved for Phase 38.2's billing and beta-flag
-- migrations. No live SQL is renumbered by this decision — this is
-- explicitly NOT the situation that caused the 188/189 incident.
--
-- ─── PUSH ORDERING ───────────────────────────────────────────────────────
-- This file is additive and creates only its own table, its own two trigger
-- functions, its own two triggers and its own five policies. It is
-- nonetheless pushed in the same window as 190-194 rather than ahead of it,
-- because `lib/workspaces/request-service.ts` — the only writer of this
-- table — delegates every approval to `issueMemberConsent`, which writes a
-- `member_consent` grant row that migration 191's widened
-- `workspace_grants_source_check` has to already admit. Shipping this table
-- before 191 would give a Member an approve button whose consent write is
-- refused by a CHECK constraint.
--
-- UUID DEFAULTS: `id` below uses gen_random_uuid(), never
-- uuid_generate_v4() — uuid-ossp lives in the `extensions` schema and is
-- not on the migration session's search_path (migration 062's first push
-- attempt failed on exactly that; migrations 078, 136, 182 and 183 all
-- restate the rule; restated again here for the same reason).
--
-- NOTHING in `handle_new_user()`, `member_type`, `industry_roles`,
-- `capability_grants` or `project_members` is touched (D-52).
-- ============================================================

-- ─── (a) public.workspace_permission_requests — the ask ──────────────────
--
-- `member_user_id` is DENORMALISED from the relationship on purpose. The
-- Member-side read ("what is being asked of me, across every workspace that
-- has ever named me") is the single hottest query this table has, and it
-- must not have to join `workspace_roster_relationships` to find the
-- caller's own rows — an RLS policy that joins is exactly the shape that
-- produced 42P17 recursion in migrations 018, 064, 078 and 136. The cost of
-- the denormalisation is a column that could drift from its source, and
-- section (c)'s trigger removes that cost: the value is asserted equal to
-- the relationship's own `member_user_id` on every INSERT and every UPDATE,
-- so drift is unstorable rather than merely discouraged.
--
-- `project_id` NULL means the ask is relationship-wide (the same reading
-- `workspace_grants.project_id` uses, migration 184). It is not a wildcard
-- security key in the F22 sense: `relationship_id` is NOT NULL here from
-- birth, so there is no "applies to any relationship" state to resolve
-- against — the R-16/WSR-24 defect migration 191 corrected on
-- `workspace_grants` cannot occur on this table.
CREATE TABLE public.workspace_permission_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  relationship_id UUID NOT NULL REFERENCES public.workspace_roster_relationships ON DELETE CASCADE,
  member_user_id  UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  -- The nineteen grantable capabilities, byte-identical to migration 184's
  -- own CHECK list and to WORKSPACE_PERMISSION_VALUES in
  -- lib/workspaces/permissions.ts. An ask for something outside the
  -- catalogue is not storable, so no downstream consumer has to defend
  -- against one.
  permission      TEXT NOT NULL
                  CHECK (permission IN ('view_summaries', 'view_metadata', 'edit_metadata', 'access_writers_room', 'upload_audio', 'download_protected_audio', 'access_clean_masters', 'invite_collaborators', 'view_split_sheets', 'view_contracts', 'upload_contracts', 'request_signatures', 'view_private_rights_identifiers', 'edit_rights_information', 'manage_registrations', 'approve_releases', 'deliver_assets', 'view_earnings', 'act_on_behalf')),
  project_id      UUID REFERENCES public.vault_projects ON DELETE CASCADE,
  requested_by    UUID NOT NULL REFERENCES auth.users,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  state           TEXT NOT NULL DEFAULT 'pending'
                  CHECK (state IN ('pending', 'approved', 'declined', 'withdrawn')),
  decided_at      TIMESTAMPTZ,
  decided_by      UUID REFERENCES auth.users,
  note            TEXT,
  -- 'approved', 'declined' and 'withdrawn' are TERMINAL. The half of that
  -- statement a CHECK can express is here — a decided row must carry both
  -- decision columns, and a pending row must carry neither, so a
  -- half-recorded decision is not a state this schema admits (the same
  -- both-or-neither shape migration 191 used for the evidence confirmation
  -- pair). The other half — that a terminal row can never be moved again —
  -- needs to compare OLD against NEW and therefore lives in section (c)'s
  -- trigger, exactly as R-17's mechanism correction found for
  -- vault_projects.user_id in migration 190.
  CONSTRAINT workspace_permission_requests_decision_pair_check CHECK (
    (state = 'pending' AND decided_at IS NULL AND decided_by IS NULL)
    OR (state <> 'pending' AND decided_at IS NOT NULL AND decided_by IS NOT NULL)
  ),
  -- D-42's structural exclusion, restated as its own NAMED constraint even
  -- though the catalogue CHECK above already excludes both values. This is
  -- deliberate belt-and-braces, mirroring lib/workspaces/permissions.ts's
  -- own second defensive pass: if a future migration ever widens the
  -- catalogue list above, this constraint still refuses the two capability
  -- values D-42 forbids, and a reviewer has to delete a constraint whose
  -- name says "structurally excluded" to get past it.
  --
  -- THESE TWO LITERALS AND `STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES` IN
  -- lib/workspaces/permissions.ts MUST CHANGE TOGETHER. They are the same
  -- two names in two places; __tests__/migration-195.test.ts imports the
  -- TypeScript constant and asserts this file contains each value verbatim,
  -- so a rename on either side fails the suite instead of drifting.
  CONSTRAINT workspace_permission_requests_structural_exclusion_check CHECK (
    permission NOT IN ('manage_payouts', 'view_tax_information')
  )
);

-- One OPEN ask per (relationship, permission, scope). A workspace cannot
-- spam a Member with duplicates of the same question, and the Member's
-- surface never shows the same permission twice. Terminal rows accumulate
-- freely as history — a workspace that was declined may ask again later,
-- and both asks are preserved (the never-revive posture migration 183's
-- own partial unique index takes for roster relationships).
--
-- COALESCE with an all-zeroes sentinel rather than migration 184's
-- `NULLS NOT DISTINCT`: both make two relationship-wide rows collide
-- correctly, and the explicit COALESCE states the intent in the index
-- definition itself where a reader will see it.
CREATE UNIQUE INDEX idx_workspace_permission_requests_open
  ON public.workspace_permission_requests
     (relationship_id, permission, (COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  WHERE state = 'pending';

-- The Member-side read: "everything anyone is currently asking of me."
CREATE INDEX idx_workspace_permission_requests_member_state
  ON public.workspace_permission_requests (member_user_id, state);

-- The workspace-side read: "everything we have asked, per relationship."
CREATE INDEX idx_workspace_permission_requests_workspace_state
  ON public.workspace_permission_requests (workspace_id, relationship_id, state);

ALTER TABLE public.workspace_permission_requests ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.workspace_permission_requests IS
  'R-19/WSR-28: one row per permission a workspace has ASKED a Member for. THIS TABLE IS NOT CONSULTED BY ANY AUTHORIZATION PATH. It is a proposal object, the sibling of R-08 proposed agreement evidence and D-05 proposed roster relationships: it carries no parent_grant_id and has no such column, it is never walked by workspace_grant_lineage_live, it is never read by workspace_project_permission, and a row in state ''approved'' still confers nothing by itself. Approval is RECORDED here and ISSUED elsewhere — lib/workspaces/request-service.ts routes every approval through issueMemberConsent (lib/workspaces/consent-service.ts), which remains the sole writer of source = ''member_consent'' rows on workspace_grants, and that grant row is the only thing any read is ever authorized against. Deleting every row in this table changes nobody''s access.';

COMMENT ON COLUMN public.workspace_permission_requests.member_user_id IS
  'Denormalised from workspace_roster_relationships.member_user_id so the Member-side read ("what is being asked of me") never has to join to find its own rows — a joining RLS policy is the 42P17 recursion shape migrations 018/064/078/136 exist to avoid. The denormalisation cannot drift: workspace_permission_request_member_matches_relationship() re-asserts equality with the relationship''s own value on every INSERT and every UPDATE.';

COMMENT ON COLUMN public.workspace_permission_requests.state IS
  'pending -> approved | declined (the Member decides) or pending -> withdrawn (the asking workspace retracts). All three non-pending values are TERMINAL: workspace_permission_request_transition_guard() refuses any UPDATE of a row that is already decided, so a declined ask can never be quietly flipped to approved. A new ask is a NEW ROW, never a revival — the same never-move-never-copy posture D-25 takes and migration 183''s partial unique index encodes for roster relationships.';

COMMENT ON COLUMN public.workspace_permission_requests.project_id IS
  'NULL means the ask is relationship-wide, the same reading workspace_grants.project_id uses (migration 184). This is NOT the F22/R-16 nullable-security-key defect: relationship_id on this table is NOT NULL from birth, so there is no "any relationship in the workspace" state for a helper to resolve against — and no helper resolves against this table at all.';

-- ─── (b) Write lockdown ──────────────────────────────────────────────────
-- (078 section (b) / 136 / 182 section (e) / 183 section (d) / 184 section
-- (c) / 185 section (c) / 191 section (d)'s posture, applied to the new
-- table.) Every write on this table goes through a service-role API route
-- that has already proved caller authority in application code:
-- `app/api/workspaces/[workspaceId]/permission-requests/route.ts` for
-- create/withdraw, and the Member-side consent surface for approve/decline.
-- There is no client PostgREST write path onto this table.
--
-- The five policies in section (d) are therefore DECLARATIVE, and that is
-- the point: they state the rule in the schema, in the place a reviewer
-- reads it, so a future migration that grants a client write path back
-- inherits the correct rule instead of an absent one. They are NOT the
-- enforcement of the terminal-state and identity invariants — a
-- service-role client bypasses RLS entirely, so those invariants are
-- enforced by section (c)'s TRIGGERS, which service-role does not bypass.
REVOKE INSERT, UPDATE, DELETE ON public.workspace_permission_requests FROM authenticated, anon;

-- ─── (c) Integrity triggers — the invariants service-role cannot bypass ──
--
-- Both functions are plain trigger functions, NOT SECURITY DEFINER: they
-- run inside the writing transaction and read one row of
-- workspace_roster_relationships, which the writer (a service-role route)
-- can already read. SECURITY DEFINER here would buy nothing and would add
-- a definer-privileged body to the schema for no reason.

-- The denormalisation guard. NEW.member_user_id must BE the relationship's
-- own member_user_id — not merely some user id, and not a value the caller
-- chose. Without this, a service-role writer with a bug could file an ask
-- under the wrong Member's name, and that Member's own consent surface
-- would then show — and let them approve — a question that was never about
-- them.
CREATE OR REPLACE FUNCTION public.workspace_permission_request_member_matches_relationship()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_member_user_id UUID;
  v_workspace_id   UUID;
BEGIN
  SELECT r.member_user_id, r.workspace_id
    INTO v_member_user_id, v_workspace_id
    FROM public.workspace_roster_relationships r
   WHERE r.id = NEW.relationship_id;

  IF v_member_user_id IS NULL THEN
    RAISE EXCEPTION 'workspace_permission_requests.relationship_id % does not name a roster relationship', NEW.relationship_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.member_user_id <> v_member_user_id THEN
    RAISE EXCEPTION 'workspace_permission_requests.member_user_id must equal the relationship''s own member_user_id'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The workspace_id is denormalised from the same relationship and gets
  -- the same treatment, for the same reason: an ask filed under one
  -- workspace against another workspace's relationship would be visible to
  -- owners and admins who have no standing on it.
  IF NEW.workspace_id <> v_workspace_id THEN
    RAISE EXCEPTION 'workspace_permission_requests.workspace_id must equal the relationship''s own workspace_id'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspace_permission_requests_member_matches ON public.workspace_permission_requests;
CREATE TRIGGER workspace_permission_requests_member_matches
  BEFORE INSERT OR UPDATE ON public.workspace_permission_requests
  FOR EACH ROW EXECUTE FUNCTION public.workspace_permission_request_member_matches_relationship();

-- The terminal-state guard, plus immutability of everything that identifies
-- WHAT was asked and BY WHOM. A CHECK constraint cannot express either
-- rule, because both compare OLD against NEW — the same mechanism
-- correction R-17 recorded for migration 190's vault_projects.user_id
-- trigger. This is the enforcement a service-role writer cannot bypass; the
-- RLS policies in section (d) say the same thing for the client path that
-- does not currently exist.
CREATE OR REPLACE FUNCTION public.workspace_permission_request_transition_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.state <> 'pending' THEN
    RAISE EXCEPTION 'a workspace permission request in state % is terminal and cannot be changed', OLD.state
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.relationship_id <> OLD.relationship_id
     OR NEW.workspace_id  <> OLD.workspace_id
     OR NEW.member_user_id <> OLD.member_user_id
     OR NEW.permission    <> OLD.permission
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.requested_by  <> OLD.requested_by
     OR NEW.requested_at  <> OLD.requested_at THEN
    RAISE EXCEPTION 'the subject of a workspace permission request is immutable — file a new request instead'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspace_permission_requests_transition_guard ON public.workspace_permission_requests;
CREATE TRIGGER workspace_permission_requests_transition_guard
  BEFORE UPDATE ON public.workspace_permission_requests
  FOR EACH ROW EXECUTE FUNCTION public.workspace_permission_request_transition_guard();

COMMENT ON FUNCTION public.workspace_permission_request_member_matches_relationship() IS
  'Asserts on every INSERT and UPDATE that the denormalised member_user_id and workspace_id equal the values on the relationship named by relationship_id. This is what makes the denormalisation safe: the Member-side RLS policy can filter on member_user_id alone (no join, no 42P17 recursion shape) precisely because this trigger guarantees the column cannot drift from its source. Not SECURITY DEFINER — it reads one row the writing transaction can already read.';

COMMENT ON FUNCTION public.workspace_permission_request_transition_guard() IS
  'Enforces the two OLD-vs-NEW rules a CHECK constraint cannot express: approved/declined/withdrawn are TERMINAL (a decided request can never be re-decided, so a decline cannot be quietly flipped to an approval), and the subject of a request — which relationship, which Member, which permission, which project, who asked, when — is immutable. Service-role bypasses RLS but does NOT bypass triggers, so this function, not the RLS policies, is the real enforcement of both rules on the write path that actually exists (R-17''s mechanism correction, restated: OLD-vs-NEW comparison lives in a BEFORE UPDATE trigger, never in a WITH CHECK clause).';

-- ─── (d) RLS policies — four rules, five policy objects ──────────────────
--
-- Four rules (Member reads their own asks; Member decides their own asks;
-- workspace owners/admins read their own workspace's asks; workspace
-- owners/admins create and withdraw them) need five POLICY objects, because
-- Postgres policies are per-command and the workspace's create and withdraw
-- rules are an INSERT and an UPDATE respectively.
--
-- THE SUBSELECT-WRAPPING RULE (migration 192's RECURSION DOCTRINE, applied
-- here): every helper call inside a policy body is wrapped as a scalar
-- subselect `(SELECT public.helper(...))`, exactly as migrations
-- 078/136/182/183/184/185/186 wrap their own, so the planner evaluates it
-- once per statement rather than once per row. No policy below contains a
-- cross-table EXISTS of any kind — the Member-side policies filter on
-- member_user_id, a column of this very table, which is the entire reason
-- that column is denormalised.

-- Rule 1 — the Member reads what is being asked of them. The Member is not
-- a member of the asking workspace and never will be, so this policy
-- deliberately consults no workspace role helper at all.
CREATE POLICY "workspace_permission_requests_member_select" ON public.workspace_permission_requests
  FOR SELECT TO authenticated
  USING (member_user_id = (SELECT auth.uid()));

-- Rule 2 — the Member decides. USING pins the row to this Member AND to the
-- pending state; WITH CHECK pins the result to this Member AND to exactly
-- the two decisions that are the Member's to make. 'withdrawn' is
-- deliberately absent from the WITH CHECK list: withdrawing is the asking
-- workspace's act, not the Member's, and a Member has no reason to be able
-- to erase the record of having been asked.
CREATE POLICY "workspace_permission_requests_member_decide" ON public.workspace_permission_requests
  FOR UPDATE TO authenticated
  USING (
    member_user_id = (SELECT auth.uid())
    AND state = 'pending'
  )
  WITH CHECK (
    member_user_id = (SELECT auth.uid())
    AND state IN ('approved', 'declined')
  );

-- Rule 3 — the asking workspace's owners and admins read their own asks.
-- Ordinary members, contractors and guests get NO read path onto this table
-- (R-12's posture for proposed relationships, applied to proposals of this
-- kind): who a workspace has asked for what is roster-management material,
-- not general workspace chrome.
CREATE POLICY "workspace_permission_requests_workspace_select" ON public.workspace_permission_requests
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_workspace_owner(workspace_id, auth.uid()))
    OR (SELECT public.workspace_member_role(workspace_id, auth.uid())) = 'admin'
  );

-- Rule 4a — the asking workspace's owners and admins create an ask. WITH
-- CHECK pins the new row to 'pending': a workspace cannot insert a row that
-- is already approved.
CREATE POLICY "workspace_permission_requests_workspace_insert" ON public.workspace_permission_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      (SELECT public.is_workspace_owner(workspace_id, auth.uid()))
      OR (SELECT public.workspace_member_role(workspace_id, auth.uid())) = 'admin'
    )
    AND state = 'pending'
  );

-- Rule 4b — the asking workspace's owners and admins withdraw an ask, and
-- THAT IS THE ONLY STATE THEY MAY WRITE. 'approved' and 'declined' appear
-- nowhere in this policy's WITH CHECK, so no workspace member of any role
-- — owner included — has a policy anywhere in this schema that would let
-- them move a request to a decided state. That is the single most important
-- authorization property of this table after "it is not a grant."
CREATE POLICY "workspace_permission_requests_workspace_withdraw" ON public.workspace_permission_requests
  FOR UPDATE TO authenticated
  USING (
    (
      (SELECT public.is_workspace_owner(workspace_id, auth.uid()))
      OR (SELECT public.workspace_member_role(workspace_id, auth.uid())) = 'admin'
    )
    AND state = 'pending'
  )
  WITH CHECK (
    (
      (SELECT public.is_workspace_owner(workspace_id, auth.uid()))
      OR (SELECT public.workspace_member_role(workspace_id, auth.uid())) = 'admin'
    )
    AND state = 'withdrawn'
  );

-- ─── (e) Schema-cache reload ───────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
