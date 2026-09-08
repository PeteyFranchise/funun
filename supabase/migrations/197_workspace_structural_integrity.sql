-- ============================================================
-- Funūn — Phase 38.0.2 (workspace-transactional-integrity-hygiene).
-- Migration 197: workspace structural integrity — the two new tables this
--                phase needs (public.workspace_ownership_transfers,
--                public.workspace_cohorts), the NEW workspace_members
--                owner-role-change guard WSR-07 requires, and a replaced
--                public.guard_workspace_never_zero_owners() that finally
--                honours expires_at (R-28).
--
-- ─── THIS FILE IS AUTHORED BY THREE SUCCESSIVE PLANS ──────────────────────
-- Sections (a)-(d) below are plan 05's. Plans 07 and 09 APPEND further
-- sections to this same file. THE FILE IS DELIBERATELY INCOMPLETE UNTIL
-- PLAN 09 CLOSES IT. Do not review it as a finished migration before then,
-- and do not stage it. Every appending plan must keep
-- `NOTIFY pgrst, 'reload schema';` as the file's LAST statement.
--
-- ─── HUMAN-GATED ──────────────────────────────────────────────────────────
-- This project never runs `supabase db push`, `supabase db reset`,
-- `supabase migration up`, or `supabase db query` from an agent. That is
-- the standing convention stated verbatim in the headers of migrations 078,
-- 080, 136, 177 and 181-196. This file is authored and text-tested
-- (__tests__/migration-197.test.ts) but must not be applied automatically.
-- No agent opened a database connection of any kind while writing it, not
-- even against a scratch database. The owner pushes it, at plan 17's joint
-- checkpoint.
--
-- ─── PUSHED WITH 198 — NEVER STAGED ALONE ─────────────────────────────────
-- 197 and 198 are pushed TOGETHER, with the TypeScript from plans 12-16, in
-- one window at plan 17's checkpoint. Staging 197 alone would install
-- section (c)'s trigger — which forbids ANY non-definer promotion to owner
-- and any change to an owner row — while no sanctioned ownership RPC exists
-- yet, because those RPCs live in migration 198. The workspace would be
-- left with NO legal path to change an owner row at all: not the API, not
-- the RPC (absent), not a direct write. That is a worse state than the hole
-- this migration closes, and it is why the two files are one push.
--
-- ─── MIGRATION NUMBERING ──────────────────────────────────────────────────
-- 197 is taken from the LIVE LEDGER in `.planning/ROADMAP.md`. THAT LEDGER
-- SUPERSEDES EVERY MIGRATION-FILE HEADER, INCLUDING THIS ONE. Read it, not
-- the headers: this project has had SIX stale-migration-number incidents,
-- and the headers of migrations 190, 191, 192 and 193 all still carry a
-- range that is now off by two (plan 15 claimed 195; the 2026-09-07
-- custody-guard fix claimed 196). Those four headers are text-locked by
-- their own suites and already reviewed and held, so they are deliberately
-- NOT being edited — churning a reviewed, applied migration to correct a
-- forward-looking sentence is a materially higher-risk change than writing
-- the correction here.
--
-- The live allocation, as of 2026-09-07:
--   197 (this file)  Phase 38.0.2 — plans 05, 07, 09.
--   198              Phase 38.0.2 — plan 06 onward (the transactional
--                    SECURITY DEFINER RPCs, including workspace_create).
--   199-200          Phase 38.2 — billing and the beta flag. RESERVED.
--   201-202          The Playbook rich-content model, Release 1 (Codex,
--                    in progress 2026-09-07). RESERVED. DO NOT TAKE THESE.
--
-- ─── WHY THIS EXISTS ──────────────────────────────────────────────────────
-- R-05 / WSR-07 (Codex finding F5): only owners may promote to owner,
--   admins may not edit or remove owner rows, and no one may self-promote.
--   Enforced in the database, not in route logic. Section (c).
-- R-22 / WSR-08: ownership transfer becomes TWO-SIDED — the owner
--   nominates, the successor accepts — mirroring D-29 custody transfer.
--   Section (a) is the diary that records it.
-- R-28 / WSR-11: the owner floor currently counts an owner whose seat has
--   EXPIRED, so a workspace can satisfy "at least one active owner" with an
--   owner who has no live access. Section (d) closes that.
-- R-07 / WSR-16 (Codex finding F17): the D-55 cohort gate is a release
--   requirement. Without it, re-enabling the D-56 kill switch goes from
--   "off" straight to "every Member". Section (b) is the pilot bound.
--
-- THE D-56 KILL SWITCH IS NOT TOUCHED BY THIS FILE AND MUST STAY OFF IN
-- PRODUCTION UNTIL THIS PHASE SHIPS. WSR-07 and WSR-08 need no grants to
-- exploit; the switch is the containment.
--
-- ─── THE TRIGGER INVENTORY (RESEARCH §4.2), REPRODUCED WHERE IT MATTERS ───
-- SECURITY DEFINER CHANGES THE EFFECTIVE USER FOR PERMISSION CHECKS (and
-- therefore what current_user reports). IT DOES NOT BYPASS TRIGGERS. A
-- BEFORE ... FOR EACH ROW trigger fires on a statement issued inside a
-- SECURITY DEFINER function exactly as it does anywhere else. Migration
-- 139's parenthetical claimed the opposite — "a SECURITY DEFINER function
-- owned by the table owner, which this trigger does not fire against" —
-- and that single wrong sentence cost a production outage: custody transfer
-- never worked, and only migration 196 fixed it. Every statement below was
-- written with an explicit answer to "which triggers fire, on which
-- statement, in which order, and what do they see?".
--
--   table                     | trigger                                  | timing                     | SECURITY DEFINER? | fires inside a definer RPC?
--   --------------------------+------------------------------------------+----------------------------+-------------------+----------------------------
--   workspaces                | workspaces_updated_at                    | BEFORE UPDATE, ROW         | no                | yes
--   workspace_members         | workspace_members_updated_at             | BEFORE UPDATE, ROW         | no                | yes
--   workspace_members         | guard_workspace_never_zero_owners        | BEFORE DELETE OR UPDATE,ROW| yes               | yes — the critical one
--   workspace_members         | guard_workspace_member_owner_role_change | BEFORE INSERT OR UPDATE,ROW| no  (section (c)) | yes, and returns early for postgres
--   workspace_roster_relationships | workspace_roster_relationships_updated_at | BEFORE UPDATE, ROW  | no                | yes
--   workspace_invitations     | (none)                                   | —                          | —                 | no
--   workspace_attachments     | (none)                                   | —                          | —                 | no
--   workspace_grants          | (none)                                   | —                          | —                 | no
--   workspace_custody_transfers | guard_custody_transfer_offered_by_holder| BEFORE INSERT, ROW        | no                | on offer only, not on accept
--   workspace_custody_transfers | (NO UPDATE GUARD AT ALL)               | —                          | —                 | the diary UPDATE is unguarded at the DB layer today; plan 11 adds the equivalent
--   workspace_permission_requests | workspace_permission_requests_member_matches | BEFORE INSERT OR UPDATE, ROW | no      | if touched
--   workspace_permission_requests | workspace_permission_requests_transition_guard | BEFORE UPDATE, ROW | no       | if touched
--   vault_projects            | vault_projects_updated_at                | BEFORE UPDATE, ROW         | no                | yes
--   vault_projects            | guard_owner_immutable (migration 139,
--                             |   SHARED WITH public.works)              | BEFORE UPDATE, ROW         | no                | yes — exempted for vault_projects only, by 196
--   vault_projects            | trg_guard_vault_projects_user_id_immutable | BEFORE UPDATE, ROW       | no                | yes — its own exemption (190)
--   vault_projects            | vault_projects_clear_featured_on_unpublish | AFTER UPDATE OF is_public| —                | only if is_public changes
--   workspace_audit_log       | (none today)                             | —                          | —                 | this phase adds them
--
-- ORDERING: when two BEFORE ROW triggers exist on the same table for the
-- same event, Postgres fires them in TRIGGER-NAME ALPHABETICAL ORDER. Both
-- must admit the statement for it to proceed, so relative order affects
-- only WHICH refusal message a caller sees — never whether the write is
-- allowed. Section (c) picks its trigger name for exactly that reason.
--
-- ─── THE ROLE-SCOPED EXEMPTION, RECORDED NOT CHURNED ──────────────────────
-- Migrations 190 and 196 both gate their exemption on
-- `current_user IN ('postgres')`. current_user is 'postgres' for the
-- duration of ANY postgres-owned SECURITY DEFINER function — not only
-- transfer_vault_project_custody(). Migration 190's header says the
-- exemption is "available ONLY to code that calls that specific function"
-- and 196's says "only this one function's execution context ... is
-- permitted". THOSE SENTENCES DESCRIBE AN INTENT THE CODE DOES NOT ENFORCE.
-- Every SECURITY DEFINER function this phase adds silently joins that
-- exemption set, and section (c) below deliberately joins it too.
--
-- THIS PHASE'S ANSWER is not to widen or rewrite those guards. It is that
-- the custody-acceptance RPC (migration 198, plan 11) CALLS
-- public.transfer_vault_project_custody() rather than issuing its own
-- UPDATE on vault_projects.user_id — keeping exactly one sanctioned write
-- path, at no cost. Nested SECURITY DEFINER calls run in the same
-- transaction, so atomicity is preserved and the double-filter
-- stale-custodian semantics come along for free.
--
-- MIGRATIONS 190 AND 196 ARE NOT EDITED HERE. They are applied, reviewed
-- and text-locked by their own suites. Churning them to correct a
-- forward-looking sentence would be a materially higher-risk change than
-- avoiding the need for it. The discrepancy is recorded, not fixed.
--
-- ─── R-21 OPTION A, AND WHAT IT DOES NOT GIVE US ──────────────────────────
-- The sanctioned RPCs take a p_actor_id the route bound AFTER
-- requireWorkspaceAccess, and re-derive that actor's AUTHORITY (role,
-- active status, expires_at) from the database. They never accept a role
-- parameter. R-05 says "enforced in the database/RPC, never route logic":
-- under Option A the AUTHORITY is in the database but the IDENTITY still
-- comes from the route. That is a PARTIAL satisfaction of R-05, accepted
-- deliberately, because Option B would require the staff-identity refusal
-- in SQL (getStaffRoles reads app_metadata, which has no SQL equivalent in
-- this repo) and would widen the client-reachable write surface that
-- migration 182 section (e) deliberately closed.
--
-- ─── THE OWNER-FLOOR WRITE ORDER — PROMOTE, THEN DEMOTE ───────────────────
-- guard_workspace_never_zero_owners runs INSIDE the writing transaction and
-- sees that transaction's own uncommitted writes FROM PREVIOUS STATEMENTS.
-- Therefore a two-sided ownership transfer MUST:
--   statement 1: promote the successor to owner
--   statement 2: demote the incumbent to admin
-- In that order the trigger firing on the demotion counts the freshly
-- promoted successor and passes. In the REVERSE order it counts zero and
-- raises 42501. Migration 198's ownership RPC follows this order; the rule
-- is written HERE because this file installs the trigger that makes it
-- matter. Related, and equally load-bearing: NEVER issue a multi-row UPDATE
-- against workspace_members inside these RPCs. A BEFORE ROW trigger's own
-- SELECT uses the current command's snapshot, which under READ COMMITTED
-- does not include rows updated by that same command, so a single statement
-- demoting two owners would fire the trigger twice, each invocation blind
-- to the other's pending change. One row per statement, always.
--
-- ─── WHY NO BACKFILL EXISTS ───────────────────────────────────────────────
-- All five workspace tables held ZERO rows on production on 2026-09-07
-- (38.0.1 Part A check A9). There is no data migration anywhere in this
-- phase, and none in this file: both tables below are new and start empty.
--
-- ─── UUID DEFAULTS ────────────────────────────────────────────────────────
-- Both new tables mint their id with gen_random_uuid(), never
-- uuid_generate_v4() — uuid-ossp lives in the `extensions` schema and is
-- not on the migration session's search_path (migration 062's first push
-- attempt failed on exactly that; 078, 136, 182-185 all restate the rule).
--
-- ─── D-52 ─────────────────────────────────────────────────────────────────
-- Nothing in handle_new_user(), member_type, industry_roles,
-- capability_grants or project_members is touched by this file.
-- ============================================================

-- ─── (a) public.workspace_ownership_transfers — the two-sided nomination ──
--         diary (R-22 / WSR-08)
--
-- Mirrors public.workspace_custody_transfers (migration 185) in shape, and
-- its BEFORE INSERT holder guard (migration 187) in posture. The custody
-- flow is a complete, reviewed, in-production two-sided act; this is the
-- same act one level up, at the workspace-ownership layer.
--
-- The state literals below are the source-of-truth pair with
-- OWNERSHIP_TRANSFER_STATE_VALUES in lib/workspaces/ownership-transfer.ts
-- (plan 01). THE TWO MUST CHANGE TOGETHER — __tests__/migration-197.test.ts
-- asserts they agree, exactly as migration 182's suite byte-locks the owner
-- floor sentence to lib/workspaces/membership.ts.
CREATE TABLE public.workspace_ownership_transfers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  from_user_id  UUID NOT NULL REFERENCES auth.users,
  to_user_id    UUID NOT NULL REFERENCES auth.users,
  offered_by    UUID NOT NULL REFERENCES auth.users,
  state         TEXT NOT NULL DEFAULT 'offered'
                CHECK (state IN ('offered', 'accepted', 'declined', 'withdrawn')),
  responded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The nominator can never be the acceptor. This is R-05's whole point,
  -- and it is the F1 attack shape restated at this layer: in the custody
  -- flow a workspace admin could once both OFFER and ACCEPT, performing
  -- both sides of an act D-29 requires to be two-sided, with no grant
  -- required. Two CHECKs rather than one, because offered_by and
  -- from_user_id are separately spoofable columns and the guard in section
  -- (a) below is what ties them together.
  CHECK (from_user_id <> to_user_id),
  CHECK (offered_by <> to_user_id)
);

COMMENT ON TABLE public.workspace_ownership_transfers IS
  'R-22/WSR-08: workspace ownership moves ONLY as a two-sided act — the owner nominates, the successor accepts — mirroring D-29 custody transfer. A row here is the diary of that negotiation; it confers nothing by itself. Accepting TRANSFERS ownership (R-22): the sanctioned RPC promotes the successor in statement 1 and demotes the nominator to admin in statement 2, in THAT order, because guard_workspace_never_zero_owners sees uncommitted writes from earlier statements in the same transaction and the reverse order raises 42501. Ownership of a WORKSPACE is not ownership of any Member''s record, catalogue, or rights: rights always live on separate evidenced records (D-28), and a workspace reaches a project only through an attachment plus a live consent lineage (D-23). A separate add-a-second-owner RPC is a later phase''s problem and does not exist.';

COMMENT ON COLUMN public.workspace_ownership_transfers.state IS
  'offered -> accepted | declined (the successor decides) or offered -> withdrawn (the nominating owner retracts). All three non-offered values are TERMINAL: guard_ownership_transfer_transition() refuses any UPDATE of a row that is already decided, so a declined nomination can never be quietly flipped to accepted. A new nomination is a NEW ROW, never a revival. These four literals are the SQL half of OWNERSHIP_TRANSFER_STATE_VALUES in lib/workspaces/ownership-transfer.ts; changing one without the other is a drift the migration suite fails on.';

-- One LIVE nomination per WORKSPACE. Custody's equivalent index
-- (idx_workspace_custody_transfers_one_live_offer) is scoped per PROJECT
-- because custody is a per-record fact; workspace ownership is a
-- per-workspace fact, so the scope narrows from project_id to
-- workspace_id. A second nomination cannot be raised until the first is
-- accepted, declined, or withdrawn — which, with the terminal-state guard
-- below, is the pair that makes a double-resolve structurally impossible
-- rather than merely unlikely.
CREATE UNIQUE INDEX idx_workspace_ownership_transfers_one_live_offer
  ON public.workspace_ownership_transfers (workspace_id)
  WHERE state = 'offered';

-- The successor's read: "which nominations name me, and where do they
-- stand." Without this, that read is a sequential scan of the whole diary.
CREATE INDEX idx_workspace_ownership_transfers_to_user_state
  ON public.workspace_ownership_transfers (to_user_id, state);

ALTER TABLE public.workspace_ownership_transfers ENABLE ROW LEVEL SECURITY;

-- The SELECT visibility helper. SECURITY DEFINER so it can be called from
-- this table's OWN RLS policy without re-entering that policy (the 42P17
-- recursion shape migrations 018, 064, 078, 136, 182-186 all exist to
-- avoid). Takes p_uid as a PARAMETER rather than calling auth.uid()
-- internally, so `SET search_path = ''` never has to reach into the auth
-- schema. STABLE so the planner can cache the result within a statement
-- when the policy wraps the call as (SELECT ...) — which it does.
--
-- Visible to the three named parties, PLUS owners and admins of the
-- workspace whose ownership is in question. That is a deliberate departure
-- from custody_transfer_visible (migration 185), which admits ONLY the
-- three named parties: a private custody negotiation between two Members
-- is nobody else's business (T-38-10-04), but who is about to own the
-- WORKSPACE is squarely the business of the people who administer it.
CREATE OR REPLACE FUNCTION public.ownership_transfer_visible(p_transfer_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_ownership_transfers t
    WHERE t.id = p_transfer_id
      AND (
        t.from_user_id = p_uid
        OR t.to_user_id = p_uid
        OR t.offered_by = p_uid
        OR public.workspace_member_role(t.workspace_id, p_uid) IN ('owner', 'admin')
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.ownership_transfer_visible(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ownership_transfer_visible(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.ownership_transfer_visible(uuid, uuid) IS
  'True when p_uid is the nomination''s from_user_id, to_user_id or offered_by, or holds an ACTIVE, unexpired owner/admin seat on the workspace (via migration 192''s workspace_member_role, which is the codebase''s one canonical live-membership definition). Unlike custody_transfer_visible, this DOES consult workspace_member_role: who is about to own the workspace is the business of the people who administer it. SECURITY DEFINER so it can be called from this table''s own RLS policy without re-entering it (42P17). Intended for RLS policy USING clauses wrapped as (SELECT ...), not a client-invoked RPC.';

-- Every helper call wrapped as a scalar subselect, per the standing
-- subselect rule (078/136/182/183/184/185/186/192). No bare cross-table
-- EXISTS is inlined in this policy body, and none ever should be.
CREATE POLICY "workspace_ownership_transfers_select" ON public.workspace_ownership_transfers
  FOR SELECT TO authenticated
  USING (
    (SELECT public.ownership_transfer_visible(id, auth.uid()))
  );

-- The house write-lockdown posture, from migration 182 section (e) and
-- restated by 183 (d), 184 (c), 185 (c), 191 (d) and 195 (b). Every write
-- — nominating, accepting, declining, withdrawing — goes through a
-- service-role RPC that has already proved caller authority. There is no
-- client PostgREST write path onto this table.
--
-- The REVOKE is issued REGARDLESS of what the platform default happens to
-- be on any given day: Supabase's automatic Data-API grants for new
-- `public` tables end on 2026-10-30, and nothing in this file relies on a
-- default in EITHER direction. An explicit revoke is correct before that
-- date and a harmless no-op after it.
REVOKE INSERT, UPDATE, DELETE ON public.workspace_ownership_transfers FROM authenticated, anon;

CREATE TRIGGER workspace_ownership_transfers_updated_at
  BEFORE UPDATE ON public.workspace_ownership_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- The nomination guard. Mirrors migration 187's
-- guard_custody_transfer_offered_by_holder() exactly in shape: BEFORE
-- INSERT, plain LANGUAGE plpgsql, NOT SECURITY DEFINER — it tests the ROW,
-- not the caller, and the only role that can ever reach it at all is
-- service_role, since the REVOKE above removes every client INSERT path.
-- Elevating it would buy nothing and would add a definer-privileged body to
-- the schema for no reason (migration 195 section (c)'s reasoning).
--
-- lib/workspaces/ownership-transfer.ts's assertMayNominate (plan 01) is the
-- INDEPENDENT application-layer twin of this refusal. Both layers enforce
-- the SAME rule, deliberately, and neither is deduplicated into the other —
-- that is this repo's standing doctrine (078, 136, 187, 190, 192, 196), and
-- WSR-17 exists precisely because two layers once disagreed about
-- expires_at.
CREATE OR REPLACE FUNCTION public.guard_ownership_nomination_by_active_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_nominator_role TEXT;
  v_successor_role TEXT;
BEGIN
  IF NEW.offered_by <> NEW.from_user_id THEN
    RAISE EXCEPTION 'a workspace ownership nomination must be made by the owner who is giving up ownership — offered_by must equal from_user_id, and no one may nominate on an owner''s behalf (R-05/WSR-08)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT m.role INTO v_nominator_role
  FROM public.workspace_members m
  WHERE m.workspace_id = NEW.workspace_id
    AND m.user_id = NEW.from_user_id
    AND m.status = 'active'
    AND (m.expires_at IS NULL OR m.expires_at > now());

  IF v_nominator_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'only an ACTIVE, unexpired owner of this workspace may nominate a successor — the nominator holds no such seat (R-05/WSR-07)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT m.role INTO v_successor_role
  FROM public.workspace_members m
  WHERE m.workspace_id = NEW.workspace_id
    AND m.user_id = NEW.to_user_id
    AND m.status = 'active'
    AND (m.expires_at IS NULL OR m.expires_at > now());

  IF v_successor_role IS NULL THEN
    RAISE EXCEPTION 'the nominated successor must already hold an ACTIVE, unexpired seat on this workspace — invite and seat them first, then nominate (R-05/WSR-08)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_successor_role = 'owner' THEN
    RAISE EXCEPTION 'the nominated successor already owns this workspace — there is nothing to transfer (R-22)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_ownership_nomination_by_active_owner()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_ownership_nomination_by_active_owner
  BEFORE INSERT ON public.workspace_ownership_transfers
  FOR EACH ROW EXECUTE FUNCTION public.guard_ownership_nomination_by_active_owner();

-- The terminal-state transition guard, mirroring migration 195's
-- workspace_permission_request_transition_guard(). A CHECK constraint
-- cannot express this rule, because it compares OLD against NEW — the same
-- mechanism correction R-17 recorded for migration 190's trigger.
--
-- workspace_custody_transfers has NO such guard today. Its absence is
-- exactly why the custody route's `.eq('state', 'offered')` CAS was the
-- ONLY thing preventing a double-resolve, in a flow that spans three
-- separate transactions (finding F9). Plan 11 adds the custody equivalent;
-- this table gets it from birth.
--
-- On BEFORE UPDATE this table now carries two row triggers:
-- guard_ownership_transfer_transition and
-- workspace_ownership_transfers_updated_at. Postgres fires them in
-- trigger-name alphabetical order, so 'g' < 'w' means the guard refuses an
-- illegal transition before update_updated_at() bothers to stamp a row that
-- is about to be rolled back.
CREATE OR REPLACE FUNCTION public.guard_ownership_transfer_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.state <> 'offered' THEN
    RAISE EXCEPTION 'a workspace ownership nomination in state % is terminal and cannot be changed — file a new nomination instead', OLD.state
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.state NOT IN ('accepted', 'declined', 'withdrawn') THEN
    RAISE EXCEPTION 'a workspace ownership nomination leaves state ''offered'' only as accepted, declined or withdrawn — got %', NEW.state
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.workspace_id  <> OLD.workspace_id
     OR NEW.from_user_id <> OLD.from_user_id
     OR NEW.to_user_id   <> OLD.to_user_id
     OR NEW.offered_by   <> OLD.offered_by THEN
    RAISE EXCEPTION 'the subject of a workspace ownership nomination is immutable — file a new nomination instead'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_ownership_transfer_transition()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_ownership_transfer_transition
  BEFORE UPDATE ON public.workspace_ownership_transfers
  FOR EACH ROW EXECUTE FUNCTION public.guard_ownership_transfer_transition();

COMMENT ON FUNCTION public.guard_ownership_nomination_by_active_owner() IS
  'BEFORE INSERT on workspace_ownership_transfers. Refuses unless offered_by = from_user_id, the nominator holds an ACTIVE unexpired owner seat on the workspace, and the nominated successor holds an ACTIVE unexpired non-owner seat on the same workspace. Mirrors migration 187''s guard_custody_transfer_offered_by_holder in shape and purpose: the structural backstop that makes a unilateral ownership grab impossible even if a future route forgets to check. Not SECURITY DEFINER — it tests the ROW, and the only role that reaches it is service_role, since client INSERT is revoked. lib/workspaces/ownership-transfer.ts''s assertMayNominate is the independent second layer, kept deliberately rather than deduplicated.';

COMMENT ON FUNCTION public.guard_ownership_transfer_transition() IS
  'BEFORE UPDATE on workspace_ownership_transfers. All three non-offered states are terminal, and the four identity columns are immutable. Mirrors migration 195''s workspace_permission_request_transition_guard. This is the enforcement a service-role writer cannot bypass — service_role carries BYPASSRLS, so an RLS policy would be inert against it, but triggers bind it. workspace_custody_transfers conspicuously lacks this guard today (finding F9); plan 11 adds it there.';

-- ─── (b) public.workspace_cohorts — the D-55 pilot bound (R-07 / WSR-16) ──
--
-- Mirrors public.song_passport_cohorts (migration 156): same stage CHECK,
-- same enabled/flags/starts_at/ends_at shape, same partial unique index,
-- same RLS + REVOKE lockdown, same NOT NULL created_by.
--
-- ONE SUBJECT AXIS ONLY. song_passport_cohorts carries two nullable axes
-- (account_user_id and work_id) because a Passport pilot can be scoped to
-- an account OR to a specific work. The workspace analogue has no such
-- second axis: a workspace_id axis is MEANINGLESS for the CREATION gate,
-- because there is no workspace yet at the moment creation is gated. The
-- subject of the workspace pilot is always an ACCOUNT. R-24 extends the
-- same account-scoped gate to the ACCEPTOR of an invitation — otherwise one
-- cohort owner could pull in unlimited non-cohort Members and the pilot
-- bound would stop meaning anything.
CREATE TABLE public.workspace_cohorts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  stage           TEXT NOT NULL DEFAULT 'pilot'
                  CHECK (stage IN ('internal', 'pilot', 'general')),
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  flags           JSONB NOT NULL DEFAULT '{}'::JSONB,
  starts_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at         TIMESTAMPTZ,
  -- Seeding the cohort is itself an auditable act: someone decided this
  -- account may reach the feature, and NOT NULL means the record always
  -- says who. Deliberately NOT nullable and deliberately no ON DELETE
  -- clause — the seeding identity must not silently vanish from the row.
  created_by      UUID NOT NULL REFERENCES auth.users,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

COMMENT ON TABLE public.workspace_cohorts IS
  'R-07/WSR-16: the D-55 pilot bound on the workspace feature. One ENABLED window per account per stage. Read ONLY by the server-side eligibility check that runs inside requireWorkspaceAccess and workspace creation; never read by a client. The gate ORDER is fixed and must not be reordered: (1) the D-56 kill switch, which stays FIRST for the reason the F7 hotfix header gives, (2) this cohort gate, (3) unauthenticated, (4) staff role, (5) membership. A non-cohort Member gets 404, not 403 (R-25): during a bounded pilot, someone outside the cohort should not learn the feature exists. Without this table, re-enabling the D-56 kill switch goes from "off" straight to "every Member" (finding F17).';

-- One enabled window per account per stage. song_passport_cohorts needs two
-- partial indexes because it has two nullable axes; this table has one
-- NOT NULL axis, so one plain unique index expresses the same rule.
CREATE UNIQUE INDEX idx_workspace_cohorts_account_stage
  ON public.workspace_cohorts (account_user_id, stage);

ALTER TABLE public.workspace_cohorts ENABLE ROW LEVEL SECURITY;

-- Service-role reads only, exactly as song_passport_cohorts is locked down.
-- REVOKE ALL, not REVOKE INSERT/UPDATE/DELETE: a client must not read this
-- table either, because the membership of a bounded pilot is itself
-- information a non-cohort account should not have.
--
-- DELIBERATELY NO SELECT POLICY. With RLS enabled and zero policies the
-- table denies all authenticated/anon access BY CONSTRUCTION, which is the
-- posture migration 182 used for workspace_audit_log before 186 gave it
-- one. Adding a policy here later is a decision, not a formality.
REVOKE ALL ON public.workspace_cohorts FROM authenticated, anon;

CREATE TRIGGER workspace_cohorts_updated_at
  BEFORE UPDATE ON public.workspace_cohorts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── R-29 — THERE IS NO COHORT ADMIN SURFACE THIS PHASE ───────────────────
-- WSR-16 needs the gate to WORK, not a UI to manage it. Building an admin
-- surface would widen the phase for a population the owner can seed by hand
-- in one statement. Song Passport's equivalent surface
-- (app/(admin)/admin/playbook/it/song-passport/page.tsx) is the model for
-- whenever that is built; the natural home is beside
-- app/api/admin/workspaces/access/route.ts, the existing D-56 admin route,
-- which must keep working while the switch is disabled.
--
-- THE OPERATIONAL PATH, written down where the table is defined so it is
-- not rediscovered from a planning document six weeks from now. To add one
-- account to the beta pilot, the owner runs exactly this, once:
--
--   INSERT INTO public.workspace_cohorts (account_user_id, stage, created_by)
--   VALUES ('<the beta account auth.users.id>', 'pilot', '<the seeding staff auth.users.id>');
--
-- To remove an account from the pilot without losing the record that it was
-- once in it, set enabled = FALSE rather than deleting the row.

-- ─── (c) public.guard_workspace_owner_role_change() — WSR-07 ──────────────
--
-- THIS IS A NEW TRIGGER, NOT A REUSE, AND HERE IS WHY.
-- guard_workspace_never_zero_owners (migration 182 section (h)) provides
-- ZERO protection against unauthorized promotion. Its UPDATE branch reads
-- `TG_OP = 'UPDATE' AND OLD.role = 'owner' AND ...`. Promoting an admin to
-- owner has OLD.role = 'admin', so that branch is skipped ENTIRELY and the
-- trigger returns without looking at anything. There is therefore no
-- database-layer obstacle today to an admin promoting themselves to owner
-- and then removing the real owner — finding F5, and the reason the D-56
-- kill switch must stay off until this phase ships.
--
-- NOT SECURITY DEFINER. This function TESTS current_user, and elevating it
-- would make that read meaningless — exactly what migration 196's own
-- comment says of guard_owner_immutable, and migration 190 says of its own
-- guard. Elevating this one would make it always take the exemption branch
-- and refuse nothing, ever.
CREATE OR REPLACE FUNCTION public.guard_workspace_owner_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- THE STRUCTURAL EXEMPTION, COMMENTED HONESTLY.
  -- current_user is 'postgres' for the duration of ANY postgres-owned
  -- SECURITY DEFINER function, not only the sanctioned ownership RPCs. This
  -- is a ROLE-SCOPED exemption, not a function-scoped one, and this file's
  -- header says so at length rather than repeating migrations 190's and
  -- 196's claim that it is narrower than it is. It is never true for an
  -- ordinary 'authenticated', 'anon' or 'service_role' statement issued
  -- directly against this table, which is what makes it worth having.
  --
  -- The ACTOR-relative rules — only an owner may promote, no one may
  -- self-promote, admins may not touch owner rows — are NOT checkable here:
  -- a trigger cannot see the human actor, because auth.uid() is NULL under
  -- service_role and current_user is 'service_role'. They are checked
  -- INSIDE the sanctioned RPCs against a p_actor_id the route bound after
  -- requireWorkspaceAccess, with that actor's AUTHORITY re-derived from the
  -- database and no role parameter ever accepted (R-21 Option A). The
  -- limitation, stated plainly: the authority is re-derived in the
  -- database, the identity still comes from the route. That is a PARTIAL
  -- satisfaction of R-05, accepted deliberately, because Option B would
  -- need the staff-identity refusal in SQL (getStaffRoles reads
  -- app_metadata, which has no SQL equivalent in this repo) and would widen
  -- the client-reachable write surface migration 182 section (e)
  -- deliberately closed.
  IF current_user IN ('postgres') THEN
    RETURN NEW;
  END IF;

  -- THE INSERT BRANCH, AND WHY IT MUST EXIST.
  -- POST /api/workspaces seats the creator as 'owner' at creation time, so
  -- SOME INSERT of an owner row has to be legal or a workspace can never be
  -- created at all. That legal INSERT is the one issued by the
  -- postgres-owned workspace_create RPC (migration 198, plan 06) — which
  -- has already returned above. THIS IS WHY WSR-23'S ATOMIC-CREATE RPC IS A
  -- PREREQUISITE FOR WSR-07 RATHER THAN AN INDEPENDENT ITEM: without it,
  -- this trigger makes workspace creation impossible.
  --
  -- An INSERT that reaches this line is therefore from a NON-definer
  -- caller, and a client-side owner INSERT must be impossible.
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'owner' THEN
      RAISE EXCEPTION 'an owner seat is created only by the sanctioned workspace-creation RPC — a direct INSERT cannot seat an owner (R-05/WSR-07, WSR-23)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.role <> 'owner' AND NEW.role = 'owner' THEN
    RAISE EXCEPTION 'promotion to owner moves only through the two-sided ownership transfer — the owner nominates and the successor accepts (R-05/WSR-08)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.role = 'owner'
     AND (NEW.role, NEW.status) IS DISTINCT FROM (OLD.role, OLD.status) THEN
    RAISE EXCEPTION 'an owner row changes only through the sanctioned ownership RPCs — an admin may not edit or remove an owner seat (R-05/WSR-07)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_workspace_owner_role_change()
  FROM PUBLIC, anon, authenticated;

-- TRIGGER NAME CHOSEN DELIBERATELY, AND HERE IS THE ONE SENTENCE:
-- 'guard_workspace_member_owner_role_change' sorts BEFORE
-- 'guard_workspace_never_zero_owners' ('m' < 'n'), and Postgres fires
-- same-event BEFORE ROW triggers in trigger-name alphabetical order, so an
-- unauthorized caller sees the AUTHORITY refusal ("an owner row changes
-- only through the sanctioned ownership RPCs") rather than the floor
-- refusal ("A workspace must always have at least one active owner"), which
-- would be a misleading answer to a caller who was never entitled to write
-- at all. Inside a sanctioned RPC this function returns at the exemption
-- and the floor's message survives, which is the correct message there.
--
-- The trigger name intentionally differs from the function name for that
-- ordering reason alone. BOTH GUARDS MUST ADMIT A STATEMENT FOR IT TO
-- PROCEED, so relative order affects only which refusal message a caller
-- sees — never whether a write is allowed. The third trigger on this table,
-- workspace_members_updated_at, sorts last ('w') and only ever stamps a row
-- both guards have already admitted.
CREATE TRIGGER guard_workspace_member_owner_role_change
  BEFORE INSERT OR UPDATE ON public.workspace_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_owner_role_change();

COMMENT ON FUNCTION public.guard_workspace_owner_role_change() IS
  'WSR-07/R-05. Enforces TWO structural rules, neither actor-relative: a workspace_members row may not BECOME owner, and an existing owner row may not be changed at all — except inside a postgres-owned SECURITY DEFINER function. The database twin of canManageOwners in lib/workspaces/membership.ts; both layers enforce the same rule deliberately and neither is deduplicated into the other. THE EXEMPTION IS ROLE-SCOPED, NOT FUNCTION-SCOPED: current_user is ''postgres'' inside ANY postgres-owned definer function, so every RPC this phase adds joins the exemption set, and the actor-relative rules (owner only, no self-promotion, admins may not touch owner rows) are checked inside those RPCs against a route-bound p_actor_id whose authority is re-derived from the database (R-21 Option A). THIS FUNCTION EXISTS BECAUSE guard_workspace_never_zero_owners PROVIDES ZERO PROTECTION AGAINST UNAUTHORIZED PROMOTION: that guard''s UPDATE branch requires OLD.role = ''owner'', and promoting an admin has OLD.role = ''admin'', so it is skipped entirely. Not SECURITY DEFINER — it tests current_user, and elevating it would make that read always take the exemption branch.';

-- ─── (d) public.guard_workspace_never_zero_owners(), REPLACED — R-28 ──────
--
-- Migration 182 section (h)'s body, preserved, with THREE changes and
-- nothing else:
--
--   1. The qualifying OLD test gains
--      `AND (OLD.expires_at IS NULL OR OLD.expires_at > now())`. An owner
--      whose seat has already expired is not a live owner, and losing them
--      cannot break a floor they were not holding.
--   2. The remaining-owners COUNT(*) gains
--      `AND (expires_at IS NULL OR expires_at > now())`, so the floor
--      cannot be satisfied by an owner who has no live access. THIS IS THE
--      R-28 GAP: since migration 192, workspace_member_role() treats an
--      expired seat as no membership at all, while this floor still counted
--      it — so a workspace could satisfy "at least one active owner" with
--      an owner who could not reach it. Two definitions of live membership,
--      one of them wrong, which is the WSR-17 class of drift all over again.
--   3. The UPDATE branch additionally fires when the update ITSELF pushes
--      the row's expires_at into the past
--      (`NEW.expires_at IS NOT NULL AND NEW.expires_at <= now()`) on a row
--      that was a live owner. Without this, the last owner can be
--      de-ownered by EXPIRY instead of by role or status, and the floor
--      never notices.
--
-- THE RAISE SENTENCE BELOW IS PRESERVED BYTE-FOR-BYTE. It is byte-locked to
-- WORKSPACE_OWNER_FLOOR_MESSAGE exported from lib/workspaces/membership.ts,
-- so the database, the API and the UI all say the same sentence about the
-- same rule. __tests__/migration-182.test.ts and
-- __tests__/migration-197.test.ts both assert that equality. DO NOT
-- rewrite, re-punctuate or re-wrap it.
--
-- THE TRIGGER IS NOT DROPPED AND NOT RECREATED, DELIBERATELY.
-- CREATE OR REPLACE FUNCTION is sufficient: migration 182's existing
-- `CREATE TRIGGER guard_workspace_never_zero_owners BEFORE DELETE OR UPDATE
-- ON public.workspace_members` keeps pointing at this same function, so its
-- timing, its event list and its name are all unchanged and its
-- alphabetical position relative to section (c)'s trigger stays as
-- described there. Dropping and recreating it would open a window in which
-- the floor is not enforced, for no benefit.
--
-- Still SECURITY DEFINER, as in 182 — unchanged. That is what lets it count
-- rows in workspace_members while a restricted role is mid-write, and it is
-- orthogonal to section (c)'s current_user test.
CREATE OR REPLACE FUNCTION public.guard_workspace_never_zero_owners()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_remaining_owners INT;
BEGIN
  IF (TG_OP = 'DELETE'
      AND OLD.role = 'owner' AND OLD.status = 'active'
      AND (OLD.expires_at IS NULL OR OLD.expires_at > now()))
     OR (TG_OP = 'UPDATE'
         AND OLD.role = 'owner' AND OLD.status = 'active'
         AND (OLD.expires_at IS NULL OR OLD.expires_at > now())
         AND (NEW.role <> 'owner'
              OR NEW.status <> 'active'
              OR (NEW.expires_at IS NOT NULL AND NEW.expires_at <= now()))) THEN
    SELECT COUNT(*) INTO v_remaining_owners
    FROM public.workspace_members
    WHERE workspace_id = OLD.workspace_id
      AND role = 'owner'
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
      AND id <> OLD.id;

    IF v_remaining_owners = 0 THEN
      RAISE EXCEPTION 'A workspace must always have at least one active owner.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Restated because CREATE OR REPLACE FUNCTION preserves existing grants but
-- says nothing about them — the same restatement migration 196 makes for
-- guard_owner_immutable, and migration 182's own revoke-only posture for
-- this function.
REVOKE EXECUTE ON FUNCTION public.guard_workspace_never_zero_owners() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.guard_workspace_never_zero_owners() IS
  'D-13, as amended by R-28 (Phase 38.0.2). A workspace must always have at least one active, UNEXPIRED owner. As of migration 197 this function honours expires_at on BOTH sides of its test: an owner whose seat has already expired neither triggers the floor when they leave nor counts toward satisfying it, and an UPDATE that pushes the last live owner''s expires_at into the past now fires the guard instead of silently de-ownering the workspace. Before 197 the floor counted an expired owner as live, while migration 192''s workspace_member_role() treated the same seat as no membership at all — two definitions of live membership, one of them wrong (the WSR-17 class of drift). The RAISE sentence is byte-identical to WORKSPACE_OWNER_FLOOR_MESSAGE in lib/workspaces/membership.ts; changing one without the other breaks both layers. THIS FUNCTION DOES NOT AND NEVER DID GUARD PROMOTION: its UPDATE branch requires OLD.role = ''owner'', so promoting an admin skips it entirely — that is guard_workspace_owner_role_change''s job (WSR-07). It runs inside the writing transaction and sees that transaction''s uncommitted writes from EARLIER STATEMENTS, which is why a two-sided ownership transfer must promote the successor first and demote the incumbent second.';

-- ══ SECTIONS (e) AND (f) BELOW ARE PLAN 07'S ══════════════════════════════
-- Plan 05 wrote sections (a)-(d) above. Plan 07 appends (e) through (h).
-- Plan 09 closes the file. Everything an appending plan adds goes ABOVE the
-- NOTIFY line at the bottom, never below it.

-- ─── (e) THE AUDIT LOCKDOWN — S1 / WSR-26, IN THREE LAYERS ────────────────
--
-- THE EVIDENCE THIS SECTION ACTS ON, NOT A SUSPICION. 38.0.1 Part A check
-- A10, run against PRODUCTION on 2026-09-07, found that service_role holds
-- TRUNCATE, DELETE AND UPDATE on public.workspace_audit_log. Migration 182
-- line 251 issued `REVOKE UPDATE, DELETE ON public.workspace_audit_log FROM
-- PUBLIC;` and its comment claimed that made the table "append-only for
-- every role, not merely for authenticated/anon (D-50)". IT REMOVED NOTHING
-- FROM service_role. Supabase's bootstrap runs `ALTER DEFAULT PRIVILEGES IN
-- SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated,
-- service_role`, which is a DIRECT grant to each named role; a REVOKE from
-- PUBLIC never touches a direct grant. The workspace audit log has not been
-- append-only at any point since migration 182 landed.
--
-- THE DEFENSIBLE CLAIM, STATED BEFORE THE CODE SO IT CANNOT BE OVERSTATED
-- AFTER IT. What the three layers below buy is "append-only to every
-- application role", NOT "immutable". None of them constrains the database
-- owner: postgres can drop the triggers, run ALTER TABLE ... DISABLE
-- TRIGGER, or set session_replication_role to 'replica' — which disables
-- triggers wholesale — and then mutate freely. That bound must not be
-- overstated in this file, in D-50's wording, or in any audit-trail UI copy.
-- An audit trail that claims more integrity than it has is worse than one
-- that states its limit, because the first invites reliance the second does
-- not.
--
-- WHY THREE LAYERS AND NOT ONE, WITH WHAT EACH ONE ACTUALLY BINDS WRITTEN
-- BESIDE IT. CONTEXT.md's S1 says "revoke ... and add a rejecting policy".
-- The revoke half is correct and is layer 1. THE POLICY HALF IS INERT
-- AGAINST service_role AND MUST NOT BE COUNTED AS THE ENFORCEMENT:
-- service_role carries the BYPASSRLS attribute, and PostgreSQL's own words
-- are that "superusers and roles with the BYPASSRLS attribute always bypass
-- the row security system when accessing a table". No policy — permissive
-- or restrictive — constrains it. Only table privileges and TRIGGERS do.

-- ── Layer 1 — PRIVILEGES. The layer that removes the ability. ─────────────
-- BYPASSRLS confers no table privileges, so this is the statement that binds
-- service_role, and it names that role explicitly because check A10 proved a
-- revoke from PUBLIC alone does not reach it.
--
-- INSERT AND SELECT ARE DELIBERATELY RETAINED, and this file issues no
-- REVOKE against either on this table. INSERT is how the audit trail is
-- written at all (lib/workspaces/audit.ts, and every RPC in migration 198).
-- SELECT is D-50's both-sides read, which survives through the narrowed
-- policy and the redacted definer function in section (h). Revoking either
-- would not harden the trail; it would silence it.
REVOKE UPDATE, DELETE, TRUNCATE ON public.workspace_audit_log
  FROM PUBLIC, anon, authenticated, service_role;

-- ── Layer 2 — TRIGGERS. The layer that survives a future re-GRANT. ────────
-- A trigger fires for EVERY role, including a BYPASSRLS role and the table
-- owner. That is what makes this layer, not layer 1, the one that still
-- refuses after a migration, an ALTER DEFAULT PRIVILEGES change, or a
-- Supabase platform default hands the privilege back. Layer 1 can be undone
-- by one GRANT; layer 2 cannot be undone by any GRANT at all.
--
-- The body is unconditional on purpose: there is no branch, no exemption and
-- no current_user test. Section (c)'s guard has a postgres exemption because
-- a sanctioned RPC legitimately needs to seat an owner; NOTHING legitimately
-- needs to rewrite an audit row, so admitting a definer caller here would
-- reopen the hole for every SECURITY DEFINER function this phase adds — the
-- role-scoped-exemption trap this file's header describes at length.
CREATE OR REPLACE FUNCTION public.guard_workspace_audit_log_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'workspace_audit_log is append-only (D-50): rows cannot be updated, deleted or truncated by any role'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_workspace_audit_log_append_only()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_workspace_audit_log_no_row_change
  BEFORE UPDATE OR DELETE ON public.workspace_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_audit_log_append_only();

-- THE SECOND TRIGGER IS NOT A DUPLICATE, AND SWAPPING ITS LEVEL SILENTLY
-- REOPENS THE HOLE. A row-level trigger DOES NOT FIRE FOR TRUNCATE — there
-- are no rows to fire per — so TRUNCATE needs its own STATEMENT-level
-- trigger or it walks straight past the trigger above. This is also the one
-- privilege check A10 found on service_role that migration 182 never even
-- named in its REVOKE.
CREATE TRIGGER guard_workspace_audit_log_no_truncate
  BEFORE TRUNCATE ON public.workspace_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_workspace_audit_log_append_only();

COMMENT ON FUNCTION public.guard_workspace_audit_log_append_only() IS
  'S1/WSR-26. Refuses every UPDATE, DELETE and TRUNCATE against workspace_audit_log, unconditionally and for every role. Installed by TWO triggers: a BEFORE UPDATE OR DELETE ... FOR EACH ROW trigger, and a separate BEFORE TRUNCATE ... FOR EACH STATEMENT trigger, because a row-level trigger does not fire for TRUNCATE and a single row-level trigger would leave TRUNCATE open. Deliberately has NO postgres exemption branch, unlike guard_workspace_owner_role_change: a sanctioned RPC legitimately needs to seat an owner, but nothing legitimately needs to rewrite an audit row, and an exemption here would admit every SECURITY DEFINER function this phase adds. THIS IS THE LAYER THAT BINDS service_role, together with the REVOKE above: service_role carries BYPASSRLS, so no RLS policy constrains it, and 38.0.1 Part A check A10 proved on production that migration 182 line 251 left it holding TRUNCATE, DELETE and UPDATE. The guarantee this buys is APPEND-ONLY TO EVERY APPLICATION ROLE, not immutability: the database owner can disable these triggers and then mutate freely, and that bound must not be overstated in any audit-trail UI copy.';

-- ── Layer 3 — A RESTRICTIVE POLICY, WITH ITS SCOPE STATED HONESTLY. ───────
-- THIS IS NOT THE ENFORCEMENT AND MUST NOT BE COUNTED AS IT. A RESTRICTIVE
-- policy constrains `authenticated` and `anon` and nobody else, and both of
-- those already lack UPDATE and DELETE on this table — from migration 182
-- line 242 and again from layer 1 above. It buys exactly one thing: if some
-- future migration grants a NON-BYPASSRLS role a write privilege here, this
-- policy refuses anyway. Forward-insurance, one layer deep, on a hole that
-- is closed twice already.
--
-- TWO POLICIES, NOT ONE `FOR ALL` POLICY — AND THIS IS A CORRECTION, NOT A
-- STYLE CHOICE. RESEARCH §6.3 and this plan both wrote a single
-- `AS RESTRICTIVE FOR ALL ... USING (false) WITH CHECK (false)`. A
-- RESTRICTIVE policy is AND-ed with the permissive ones for EVERY command it
-- covers, and `FOR ALL` covers SELECT. That one policy would therefore have
-- made workspace_audit_log UNREADABLE to `authenticated` — silently deleting
-- D-50's both-sides read and the section (h) policy this very file
-- recreates, while the redacted definer function kept working because it
-- runs as postgres. The refusal must be scoped to the two commands it is
-- about. PostgreSQL takes exactly one command per CREATE POLICY, so that is
-- two policies. TRUNCATE is not an RLS-controlled command at all and is
-- covered only by layer 1 and the statement-level trigger above.
CREATE POLICY "workspace_audit_log_no_update" ON public.workspace_audit_log
  AS RESTRICTIVE
  FOR UPDATE TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "workspace_audit_log_no_delete" ON public.workspace_audit_log
  AS RESTRICTIVE
  FOR DELETE TO authenticated, anon
  USING (false);

-- ─── (f) THE RESTRICTED-PII WRITE GUARD — R-13 / WSR-19 ───────────────────
--
-- WHAT THIS EXISTS TO CATCH, WITH THE CURRENT OFFENDER NAMED.
-- app/api/workspaces/[workspaceId]/invitations/route.ts writes
-- `changes: { role, email: normalizedEmail }` on the invitation-issuance
-- path. `changes` is readable by every active seat in the workspace through
-- migration 186's policy, so an invited person's email address is today
-- exposed to every member of the workspace that invited them. Plan 14
-- removes that key. THIS TRIGGER IS THE LAYER THAT CATCHES THE NEXT ONE —
-- the primary control is that writers do not put restricted PII in `changes`
-- at all, and a write-time guard is the backstop for the writer who forgets.
--
-- WHERE THE INVITED ADDRESS LEGITIMATELY LIVES INSTEAD: on
-- workspace_invitations.email, whose SELECT policy is already owner/admin
-- only (migration 182), and which the audit row already reaches through its
-- own target_id. So `changes` on workspace.invitation.issued should carry
-- the role and nothing else, and nothing is lost by removing the address.
--
-- WHY jsonb_path_exists AND NOT THE `?|` OPERATOR. `changes ?| ARRAY[...]`
-- inspects TOP-LEVEL KEYS ONLY. A nested object — `{"before": {"email":
-- "..."}}`, which is the exact shape this codebase already uses for
-- before/after diffs, see the invitation-revoked call site's
-- `{"status": {"before": ..., "after": ...}}` — walks straight past it. The
-- `$.**."key"` recursive member accessor matches at EVERY depth including
-- depth zero, so a top-level key is still caught.
--
-- TWO THINGS THIS GUARD DOES NOT CLAIM, WRITTEN DOWN RATHER THAN IMPLIED.
--   1. It is a KEY-NAME guard, not a content classifier. A restricted value
--      stored under an innocuous key — `{"note": "reach them at a@b.com"}` —
--      still gets through. The primary control remains that writers do not
--      put PII in `changes`; this only makes the common mistake loud.
--   2. Its cost on the audit write path HAS NOT BEEN MEASURED. The table
--      holds zero rows today, so there is nothing to measure against, and no
--      agent opened a database connection to try. A recursive JSONB path
--      predicate evaluated ten times per INSERT should be checked before
--      this table carries real traffic; if it bites, the answer is to narrow
--      the key list or to bound the depth, never to drop the guard.
CREATE OR REPLACE FUNCTION public.guard_workspace_audit_log_no_restricted_pii()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_restricted_key TEXT;
BEGIN
  FOREACH v_restricted_key IN ARRAY ARRAY[
    'email',
    'phone',
    'contact_email',
    'contact_phone',
    'address',
    'tax_id',
    'token',
    'token_hash',
    'ipi',
    'isni'
  ] LOOP
    IF jsonb_path_exists(NEW.changes, ('$.**."' || v_restricted_key || '"')::jsonpath) THEN
      RAISE EXCEPTION 'workspace_audit_log.changes may not carry the restricted key ''%'' at any depth (WSR-19) — the invited address lives on workspace_invitations.email, which is owner/admin-only, and the audit row already reaches it through target_id', v_restricted_key
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_workspace_audit_log_no_restricted_pii()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_workspace_audit_log_no_restricted_pii
  BEFORE INSERT ON public.workspace_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_audit_log_no_restricted_pii();

COMMENT ON FUNCTION public.guard_workspace_audit_log_no_restricted_pii() IS
  'R-13/WSR-19. BEFORE INSERT on workspace_audit_log. Refuses any row whose `changes` object carries a restricted key at ANY depth: email, phone, contact_email, contact_phone, address, tax_id, token, token_hash, ipi, isni. Uses jsonb_path_exists with the recursive `$.**."key"` member accessor rather than the `?|` operator, because `?|` inspects top-level keys only and this codebase already writes nested before/after diffs that would walk past it. TWO LIMITS, STATED NOT IMPLIED: it is a key-name guard and not a content classifier, so a restricted value under an innocuous key still gets through — the primary control is that writers do not put PII in `changes` at all, and this is the backstop; and its cost on the write path has not been measured, because the table holds zero rows and no agent opened a database connection, so it should be checked before this table carries traffic. The one offender that exists today is the invitation-issuance route, which writes the invited email into `changes`; plan 14 removes it. The address legitimately lives on workspace_invitations.email, whose SELECT policy is owner/admin-only, reachable from the audit row through target_id.';

-- ─── (g) THE DEFERRED AUDIT-ASSERTION TRIGGERS — R-06 / WSR-13 ────────────
--
-- WHAT R-06 GUARANTEES, AND WHAT IT DOES NOT. R-06 says the audit row is
-- written in the same transaction as the mutation. Putting the INSERT inside
-- the RPC body achieves that, and it makes the audit NON-PARTIAL: the two
-- can no longer half-happen. IT DOES NOT MAKE THE AUDIT NON-BYPASSABLE. A
-- future RPC author who simply omits the INSERT is caught by nothing at all
-- — which is finding F14's shape (a best-effort audit that can silently not
-- happen) moved one layer up, from the logging helper to the RPC that calls
-- it. A deferred constraint trigger, checked at COMMIT, is what closes it.
--
-- WHY `now()` IS A SOUND TEST FOR "IN THIS TRANSACTION".
-- workspace_audit_log.created_at DEFAULTs to NOW(), and NOW() is
-- transaction_timestamp() — one value per transaction, identical for every
-- row that transaction writes, and unchanged by how long the transaction
-- runs. Combined with target_id it is an effectively exact "was this change
-- audited in this transaction" test.
--
-- THE CONTRACT THIS IMPOSES ON EVERY WRITER, WITH THE KNOWN OFFENDER NAMED.
-- Every RPC in migration 198 must set its audit row's target_id to the
-- MUTATED ROW'S OWN id. Not the workspace, not the invitation the seat came
-- from, not null. One call site already fails that today:
-- app/api/workspaces/invitations/accept/route.ts writes
-- `targetId: pendingSeat?.id ?? null`, which is null whenever no pending
-- seat existed, and a null target_id matches no row here. Plan 14 fixes it
-- as part of WSR-10. This paragraph exists so that when the assertion fires
-- in plan 17's harness, the reader already knows where to look.
--
-- THE CONFIDENCE LEVEL, HONESTLY. The mechanism is standard PostgreSQL —
-- deferred constraint triggers, and NOW() as transaction_timestamp() — but
-- its behaviour UNDER THIS SCHEMA has never been observed on a running
-- database, because no agent opened a database connection to observe it.
-- Plan 17's owner-run single-shot harness is the proof, and it must run with
-- these triggers ENABLED for the assertion to mean anything. IF THEY PROVE
-- TOO INVASIVE AT PUSH TIME, the cheaper fallback is to make
-- logWorkspaceAction THROW instead of returning { ok: false } and to make
-- every call site await it before returning success. That closes F14's
-- OBSERVABLE half — a silent failure becomes a 500 — but leaves "an RPC that
-- never audits at all" wide open. It is a fallback, not the design.
--
-- ONE MORE THING THE READER OF PLAN 17'S HARNESS NEEDS. These triggers fire
-- at COMMIT on any DIRECT fixture UPDATE of a consequential column, so a
-- seed or teardown that writes those columns outside the RPCs will abort at
-- commit. Seed and tear down through the RPCs, or disable the triggers for
-- those steps only and re-enable them before the assertions run. That
-- hazard is recorded in 38.0.2-ORCHESTRATOR-NOTES.md as well as here.
CREATE OR REPLACE FUNCTION public.assert_workspace_change_is_audited()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_audit_log l
    WHERE l.target_id = NEW.id
      AND l.created_at = now()
  ) THEN
    RAISE EXCEPTION 'a consequential change to %.% was committed without an audit row written in the same transaction (WSR-13) — the sanctioned RPC must write workspace_audit_log with target_id set to the mutated row''s own id', TG_TABLE_NAME, NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_workspace_change_is_audited()
  FROM PUBLIC, anon, authenticated;

-- WHY DEFERRED. The check must run at COMMIT, after both the mutation and
-- the audit row exist, REGARDLESS OF THE ORDER THEY APPEAR IN THE FUNCTION
-- BODY. An immediate trigger would force every RPC to write its audit row
-- before its mutation, which is both fragile and unstated anywhere a future
-- author would read it.
--
-- WHY COLUMN-SCOPED. An unscoped trigger would demand an audit row for every
-- incidental save, including updated_at-only writes — and a constraint that
-- fires on writes nobody considers consequential is one that gets disabled,
-- not one that gets satisfied. Scoping to the columns that DEFINE a
-- consequential state change is what keeps this strict rather than merely
-- loud. The four pairs below are exactly the four consequential-change
-- surfaces R-06 names: a member's role or seat status, a roster
-- relationship's state, an invitation's status, a custody transfer's state.
CREATE CONSTRAINT TRIGGER assert_workspace_member_change_audited
  AFTER UPDATE OF role, status ON public.workspace_members
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_workspace_change_is_audited();

CREATE CONSTRAINT TRIGGER assert_workspace_roster_relationship_change_audited
  AFTER UPDATE OF state ON public.workspace_roster_relationships
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_workspace_change_is_audited();

CREATE CONSTRAINT TRIGGER assert_workspace_invitation_change_audited
  AFTER UPDATE OF status ON public.workspace_invitations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_workspace_change_is_audited();

CREATE CONSTRAINT TRIGGER assert_workspace_custody_transfer_change_audited
  AFTER UPDATE OF state ON public.workspace_custody_transfers
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_workspace_change_is_audited();

COMMENT ON FUNCTION public.assert_workspace_change_is_audited() IS
  'R-06/WSR-13. Installed by FOUR deferred CONSTRAINT TRIGGERs, each column-scoped to the columns that define a consequential state change: workspace_members (role, status), workspace_roster_relationships (state), workspace_invitations (status), workspace_custody_transfers (state). At COMMIT it requires an audit row whose target_id is the mutated row''s own id and whose created_at equals now() — NOW() is transaction_timestamp(), one value per transaction, so with target_id that is an effectively exact "was this change audited in this transaction" test. THIS IS THE PART R-06 ALONE DOES NOT BUY: writing the audit INSERT inside the RPC makes the audit non-PARTIAL, not non-BYPASSABLE, because a future RPC author who omits the INSERT is caught by nothing. Deferred so the check runs after both writes regardless of their order in the function body; column-scoped so an updated_at-only save does not demand an audit row, which would make the constraint unenforceable rather than strict. CONFIDENCE IS MEDIUM UNTIL PLAN 17 RUNS IT: the mechanism is standard PostgreSQL but has never been observed against this schema, because no agent opened a database connection. One known offender exists today — app/api/workspaces/invitations/accept/route.ts sets targetId to null when no pending seat existed — and plan 14 fixes it under WSR-10.';

-- ─── (h) THE REDACTED AUDIT READ — R-13 / R-27 / WSR-19 ───────────────────
--
-- Section (f) stops restricted PII being WRITTEN. This section decides who
-- may READ what is there, and it does the deciding IN THE DATABASE so a
-- withheld value never leaves it — the same discipline migrations 193 and
-- 194 apply to catalogue fields, applied here to the audit `changes` object.
--
-- THE THREE PROPERTIES COPIED FROM MIGRATION 194, NOT REINVENTED:
--   * `p_uid = (SELECT auth.uid())` — the parameter is explicit, because it
--     makes the resolution readable, but it can only ever name the CALLER.
--     A NULL auth.uid() returns zero rows. This is the binding 38.0.1 Part B
--     check B9 proved bites behaviourally; DO NOT omit it because the
--     parameter "looks" redundant.
--   * The LEAST/GREATEST clamp — an unbounded page on a SECURITY DEFINER
--     function is a denial-of-service surface, in migration 194's own words.
--     200 is the ceiling, 50 the default for a NULL argument.
--   * A DECLARED RETURN COLUMN LIST AS THE SECURITY CONTRACT, never
--     SELECT *. It is the complete set of facts a caller can obtain from
--     this surface, and adding a column to it must be reviewed exactly as
--     carefully as widening an RLS policy.
--
-- REDACTION IS ALLOWLIST-BASED, NOT DENYLIST. A caller without full view
-- receives the empty object, not `changes` minus a list of keys. A
-- subtraction leaks whatever a future writer adds under a key nobody thought
-- to subtract, which is the same failure mode section (f) exists to catch
-- and would be a second chance to make it. `changes_redacted` is returned as
-- a boolean so a reader can tell "withheld" from "genuinely empty" without a
-- second query.
--
-- WHO GETS FULL VIEW: the row's actor, its named subject Member, or an
-- owner/admin of the row's workspace. Everyone else with a live seat sees
-- the row and its shape but not its contents.
--
-- THE COALESCE ON full_view IS NOT DECORATION. subject_member_id is
-- NULLABLE (migration 182: it is NULL whenever the action is about the
-- workspace itself rather than a roster Member), and
-- workspace_member_role() returns NULL for a caller with no live seat. So
-- the three-way OR evaluates to NULL, not FALSE, for a perfectly ordinary
-- row — and without the COALESCE, `NOT v.full_view` would return NULL as
-- changes_redacted, telling the reader neither "withheld" nor "shown". It
-- fails CLOSED to FALSE: unknown means redacted.
--
-- THE GRANT POSTURE DIFFERS FROM MIGRATION 198'S RPC FAMILY, DELIBERATELY.
-- Migration 198's write RPCs are service-role-only, following migration 123,
-- because no session client may reach them. THIS one is a client-invoked
-- READ, like migrations 193 and 194, so `authenticated` keeps EXECUTE. Do
-- not "correct" it to match 198.
CREATE OR REPLACE FUNCTION public.workspace_audit_page(
  p_workspace_id UUID,
  p_uid UUID,
  p_limit INT,
  p_offset INT
)
RETURNS TABLE (
  id                   UUID,
  actor_user_id        UUID,
  subject_member_id    UUID,
  action               TEXT,
  permission_relied_on TEXT,
  target_type          TEXT,
  target_id            UUID,
  changes              JSONB,
  changes_redacted     BOOLEAN,
  created_at           TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    l.id,
    l.actor_user_id,
    l.subject_member_id,
    l.action,
    l.permission_relied_on,
    l.target_type,
    l.target_id,
    CASE WHEN v.full_view THEN l.changes ELSE '{}'::JSONB END,
    NOT v.full_view,
    l.created_at
  FROM public.workspace_audit_log l
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      l.actor_user_id = p_uid
      OR l.subject_member_id = p_uid
      OR public.workspace_member_role(l.workspace_id, p_uid) IN ('owner', 'admin'),
      FALSE
    ) AS full_view
  ) v
  WHERE l.workspace_id = p_workspace_id
    AND p_uid = (SELECT auth.uid())
    AND public.workspace_access_enabled()
    AND public.workspace_member_role(l.workspace_id, p_uid) IS NOT NULL
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0)
$$;

REVOKE EXECUTE ON FUNCTION public.workspace_audit_page(uuid, uuid, int, int)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.workspace_audit_page(uuid, uuid, int, int)
  TO authenticated;

COMMENT ON FUNCTION public.workspace_audit_page(uuid, uuid, int, int) IS
  'R-13/R-27/WSR-19. One page of a workspace audit trail, with the `changes` object redacted for any caller who is not the row''s actor, its named subject Member, or an owner/admin of the row''s workspace. THE DECLARED RETURN COLUMN LIST IS THE SECURITY CONTRACT: it is the complete set of facts a caller can obtain from this surface, and adding a column must be reviewed exactly as carefully as widening an RLS policy. REDACTION IS ALLOWLIST-BASED: a caller without full view receives the empty object, never `changes` minus a key list, because a subtraction leaks whatever a future writer adds under a key nobody thought to subtract. changes_redacted is returned as a boolean so a reader can distinguish "withheld" from "genuinely empty" without a second query. Preserves the three properties migration 194 established: p_uid must equal auth.uid() so the parameter can only ever name the caller and a NULL auth.uid() returns zero rows (the binding 38.0.1 Part B check B9 proved bites); the page is clamped to at most 200 rows because an unbounded page on a SECURITY DEFINER function is a denial-of-service surface; and the return list is declared rather than SELECT *. The D-56 kill switch is READ here, exactly as every workspace read surface reads it, and is never written. Unlike migration 198''s write RPC family this IS a client-invoked read, so authenticated keeps EXECUTE, matching migrations 193 and 194 rather than 123.';

-- ── The raw-table policy, narrowed. R-27 confirmed this is acceptable. ────
--
-- WHAT CHANGES: migration 186's workspace_audit_log_select admitted the
-- row's actor, its named subject Member, OR anyone holding a live seat in
-- the workspace (`workspace_member_role(...) IS NOT NULL`). That third
-- branch is what puts a raw `changes` object — today including an invited
-- person's email address — in front of every seat in the workspace. It goes.
-- What remains is actor-or-subject-or-owner/admin.
--
-- THE D-50 TENSION, STATED RATHER THAN GLOSSED. D-50 literally says the
-- audit trail is visible to BOTH the workspace and the affected Member. This
-- narrows the LITERAL surface: the workspace still sees its own trail, but
-- an ordinary member now reaches it through workspace_audit_page above,
-- redacted, rather than through a direct table read. D-50's INTENT — that a
-- workspace can audit itself, and that the person acted upon can see what
-- was done to them — is preserved; only the mechanism changes for one class
-- of reader. R-27 confirmed this is acceptable, on the record, rather than
-- it being decided silently here.
--
-- NO UI BREAKS. NO APP SURFACE READS workspace_audit_log TODAY: a grep finds
-- lib/workspaces/audit.ts writing to it, two routes writing through that
-- helper, and test fixtures. Nothing reads it. So this narrowing costs
-- nothing at the moment it lands, and the redacted reader exists before the
-- first surface that needs one.
--
-- THE PREDICATE IS EXPRESSED IN THE POLICY BODY, NOT DELEGATED TO
-- workspace_audit_visible, AND HERE IS THE ONE REASON: migration 186 needed
-- the definer helper because its predicate SELECTed from workspace_audit_log
-- itself, which would have re-entered this very policy and recursed (42P17).
-- The narrowed predicate reads only the row's OWN columns plus
-- workspace_members, so there is nothing to recurse into and the indirection
-- buys nothing. Every remaining helper call is wrapped as a scalar subselect,
-- per the standing rule (078/136/182-186/192).
DROP POLICY IF EXISTS "workspace_audit_log_select" ON public.workspace_audit_log;

CREATE POLICY "workspace_audit_log_select" ON public.workspace_audit_log
  FOR SELECT TO authenticated
  USING (
    actor_user_id = (SELECT auth.uid())
    OR subject_member_id = (SELECT auth.uid())
    OR (SELECT public.workspace_member_role(workspace_id, auth.uid())) IN ('owner', 'admin')
  );

-- migration 186's helper is narrowed IN LOCKSTEP even though the policy no
-- longer calls it. It remains EXECUTE-able by `authenticated`, and leaving
-- it asserting the broad rule would leave a function in the schema whose
-- answer disagrees with the policy above — which is the WSR-17 class of
-- drift, and the reason this repo keeps two layers agreeing rather than
-- deduplicating one into the other. If a future policy re-adopts it, it now
-- re-adopts the narrowed rule.
CREATE OR REPLACE FUNCTION public.workspace_audit_visible(p_row_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_audit_log l
    WHERE l.id = p_row_id
      AND (
        l.actor_user_id = p_uid
        OR l.subject_member_id = p_uid
        OR public.workspace_member_role(l.workspace_id, p_uid) IN ('owner', 'admin')
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.workspace_audit_visible(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.workspace_audit_visible(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.workspace_audit_visible(uuid, uuid) IS
  'NARROWED BY MIGRATION 197 (R-13/R-27/WSR-19). True when p_uid is the audit row''s actor, its named subject Member, or an owner/admin of the row''s workspace. Migration 186''s version also admitted ANY live seat in the workspace, which is what put a raw `changes` object — today including an invited person''s email address — in front of every member. That branch is gone. workspace_audit_log_select no longer calls this function: the narrowed predicate reads only the row''s own columns plus workspace_members, so it cannot recurse into workspace_audit_log and the definer indirection migration 186 needed to avoid 42P17 buys nothing. This function is narrowed in lockstep anyway, because it is still EXECUTE-able by authenticated and a helper whose answer disagrees with the policy is the WSR-17 class of drift. Ordinary members now read the trail through public.workspace_audit_page, redacted. D-50''s intent is preserved — the workspace still audits itself and the affected Member still sees what was done to them — and only the mechanism changes for one class of reader; R-27 confirmed that on the record.';

-- ─── Schema-cache reload — MUST REMAIN THE LAST STATEMENT IN THIS FILE ────
-- Plans 07 and 09 append further sections ABOVE this line, never below it.
NOTIFY pgrst, 'reload schema';
