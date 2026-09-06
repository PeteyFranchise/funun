-- ============================================================
-- Funūn — Phase 38 (member-organization-team-workspaces): Slice A
--                the workspaces foundation.
-- Migration 182: public.workspaces, public.workspace_members,
--                public.workspace_invitations, public.workspace_audit_log,
--                the workspace_member_role / is_workspace_owner SECURITY
--                DEFINER helper pair, the four-table write lockdown, three
--                non-recursive SELECT policies, and the never-zero-owners
--                BEFORE trigger.
--
-- HUMAN-GATED — this project never runs `supabase db push`, `supabase db
-- reset`, or `supabase migration up` from an agent. That is the standing
-- convention stated verbatim in the headers of migrations 078, 080, 136,
-- 177 and 181. This file is authored and text-tested
-- (__tests__/migration-182.test.ts) but must not be applied automatically.
-- The live push is Plan 38-03's Task 3 blocking checkpoint and the owner
-- performs it.
--
-- MIGRATION NUMBERING (Phase 38 planner decision 1): 182 is this plan
-- (Slice A foundation). Its siblings are pre-assigned: 183 = plan 38-04
-- (roster relationships + evidence), 184 = plan 38-08 (grants + bundles),
-- 185 = plan 38-10 (attachments + custody transfers), 186 = plan 38-11 (THE
-- RLS workspace branch extending project_member_role() and siblings).
-- 187 and 188 are RESERVED for Phase 38.2's billing and beta-flag
-- migrations and MUST NOT be claimed by any plan in this phase — mirrors
-- migration 078's "079 is reserved" convention, restated here so a naive
-- `ls supabase/migrations/` does not read 187/188 as free.
--
-- UUID DEFAULTS: every id column below uses gen_random_uuid(), never
-- uuid_generate_v4() — uuid-ossp lives in the `extensions` schema and is
-- not on the migration session's search_path (migration 062's first push
-- attempt failed on exactly that; migrations 078 and 136 both restate the
-- rule; restated again here for the same reason).
--
-- THIS FILE IS ADDITIVE ONLY. It creates four new tables, three new
-- functions and one new trigger. It does not create, alter or drop any
-- policy, trigger, function or column on any table that existed before
-- this migration. In particular:
--   - The signup trigger (handle_new_user()) is NOT referenced anywhere in
--     this file. No workspace is auto-provisioned for anyone, for any
--     reason, as a side effect of signup (D-03, D-53). This deliberately
--     rejects buyer_orgs' auto-provisioned personal-org pattern
--     (migration 080's is_personal shape) — a solo Artist Team may be
--     created on demand, later, by an explicit user action in a future
--     plan's route, never by this migration or by the auth trigger.
--   - public.find_auth_user_id_by_email(TEXT) is already live from
--     migration 177 and is NOT redefined here. Plan 38-04's invitation
--     migration (183) is what calls it.
--   - vault_projects, tracks, vault_assets, vault_documents, tool_outputs,
--     project_members, work_members and every other pre-existing table are
--     untouched. The workspace branch those tables eventually need lands
--     in migration 186 (D-48), not here.
--
-- ─── THE PROBLEM THIS MIGRATION SOLVES ────────────────────────────────────
-- public.workspaces and public.workspace_members are the same SHAPE of
-- relationship migration 064 first fixed for split_sheets ↔
-- split_sheet_parties, migration 078 fixed again for vault_projects ↔
-- project_members, and migration 136 fixed a third time for works ↔
-- work_members: two tables whose row-visibility rules each need to read
-- the other. A naive pair of cross-table `EXISTS (SELECT 1 FROM
-- other_table ...)` policies recurses at PostgreSQL QUERY REWRITE time with
-- SQLSTATE 42P17 (`infinite recursion detected in policy for relation
-- "..."`), exactly as migration 018 did — a failure that is user-
-- independent and breaks every authenticated read at once, before a single
-- row is examined. Section (f) below ships the SECURITY DEFINER
-- helper-pair fix from day one — public.workspace_member_role() and
-- public.is_workspace_owner() — rather than discovering the recursion in
-- production and patching it later, as migration 064 had to. Every helper
-- call site in section (g)'s policies is wrapped as a scalar subselect
-- `(SELECT public.helper(...))`; __tests__/migration-182.test.ts asserts
-- that wrapping structurally, following migration 136's own convention, so
-- a later hand-edit that inlines a bare EXISTS fails the suite instead of
-- production.
-- ============================================================

-- ─── (a) public.workspaces ────────────────────────────────────────────────
-- workspace_type drives defaults and UI. It is NEVER the authorization
-- source (D-01) — authorization always flows through role, membership
-- state, grants, and relationship tier, never through type.
CREATE TABLE public.workspaces (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  slug               TEXT NOT NULL UNIQUE,
  workspace_type     TEXT NOT NULL
                     CHECK (workspace_type IN ('artist_team', 'management', 'label')),
  -- Independent capability flags — NEVER derived from workspace_type. A
  -- company may be both management and label without a second workspace
  -- (D-02). Do not add a CHECK, generated column, or trigger that ties
  -- either flag to workspace_type; that would silently reintroduce the
  -- exclusivity this migration is required to avoid.
  roster_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  catalogue_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  -- Used only by workspace_type = 'artist_team'. Naming a subject member
  -- grants that person nothing until they affirmatively accept (D-05,
  -- D-07) — this column alone is inert.
  subject_member_id  UUID REFERENCES auth.users ON DELETE SET NULL,
  -- Deliberately the OPPOSITE of buyer_orgs' born-verified default
  -- (migration 080 D-14). A workspace is born unverified and works fully
  -- in that state; verification is a separate, later, auditable act, never
  -- a creation-time default (D-04).
  verification_state TEXT NOT NULL DEFAULT 'unverified'
                     CHECK (verification_state IN ('unverified', 'in_review', 'verified', 'revoked')),
  verified_at        TIMESTAMPTZ,
  verified_by        UUID REFERENCES auth.users,
  created_by         UUID NOT NULL REFERENCES auth.users,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS workspaces_updated_at ON public.workspaces;
CREATE TRIGGER workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── (b) public.workspace_members — the guest list ────────────────────────
-- user_id is NULLABLE — a pending seat exists before the invitee has an
-- account, the same two-axis identity idea migration 136 shipped for
-- work_members (user_id set immediately for a known account, left NULL for
-- an invited email that has not signed up yet).
CREATE TABLE public.workspace_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID REFERENCES public.workspaces ON DELETE CASCADE NOT NULL,
  user_id         UUID REFERENCES auth.users ON DELETE CASCADE,
  invited_email   TEXT,
  role            TEXT NOT NULL
                  CHECK (role IN ('owner', 'admin', 'member', 'contractor', 'guest')),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'active', 'suspended', 'removed', 'expired')),
  -- Required by service code for the time-boxed contractor role (D-11).
  -- Nullable for every other role.
  expires_at      TIMESTAMPTZ,
  invited_by      UUID REFERENCES auth.users,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_id IS NOT NULL OR invited_email IS NOT NULL)
);

-- A PARTIAL unique index, not a plain UNIQUE (workspace_id, user_id) — a
-- plain composite UNIQUE would still allow the same person to be seated
-- twice via two NULL-user_id pending-invite rows, since Postgres treats
-- every NULL as distinct. The partial index constrains exactly the axis
-- that is actually populated, mirroring migration 136's two-partial-index
-- shape for work_members.
CREATE UNIQUE INDEX idx_workspace_members_unique_user
  ON public.workspace_members (workspace_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX idx_workspace_members_workspace_status
  ON public.workspace_members (workspace_id, status);
CREATE INDEX idx_workspace_members_user_id
  ON public.workspace_members (user_id);

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS workspace_members_updated_at ON public.workspace_members;
CREATE TRIGGER workspace_members_updated_at
  BEFORE UPDATE ON public.workspace_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── (c) public.workspace_invitations — pending seats by email ────────────
-- token_hash stores a HASH, never the raw invitation token — the raw token
-- lives only in the emailed link. A partial unique index enforces at most
-- one LIVE invitation per (workspace, email) pair; a refused or expired
-- invitation does not block a fresh one.
CREATE TABLE public.workspace_invitations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces ON DELETE CASCADE NOT NULL,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL
               CHECK (role IN ('owner', 'admin', 'member', 'contractor', 'guest')),
  token_hash   TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'refused', 'expired', 'revoked')),
  expires_at   TIMESTAMPTZ NOT NULL,
  invited_by   UUID NOT NULL REFERENCES auth.users,
  accepted_at  TIMESTAMPTZ,
  accepted_by  UUID REFERENCES auth.users,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_workspace_invitations_one_live_per_email
  ON public.workspace_invitations (workspace_id, lower(email))
  WHERE status = 'pending';

ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

-- ─── (d) public.workspace_audit_log — append-only, both-sides visible ─────
-- D-50: every workspace-context action records actor, workspace, subject
-- member, permission relied on, and timestamp — append-only, and visible
-- to BOTH the workspace and the affected Member. D-22 requires BOTH
-- actor_user_id and subject_member_id on an acting-on-behalf row — never
-- one collapsed identity, unlike staff_audit_log's single actor_id
-- (migration 089), which has no "on behalf of" concept to represent.
--
-- The SELECT policy making this visible to both sides is deliberately NOT
-- created here. D-50's both-sides visibility needs a SECURITY DEFINER
-- helper family that migration 186 completes alongside the workspace RLS
-- branch; shipping the table now (RLS-enabled, zero SELECT policy, so it
-- denies all authenticated/anon access by construction until 186 adds one)
-- means every service route written in later waves logs from day one
-- instead of being retrofitted. Do NOT copy staff_audit_log's (migration
-- 089) zero-policy-forever posture wholesale for this table — that posture
-- is correct for a staff-only trail with no "visible to the subject" fact
-- to express; it is wrong here, where D-50 is an explicit requirement.
CREATE TABLE public.workspace_audit_log (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID REFERENCES public.workspaces ON DELETE CASCADE NOT NULL,
  actor_user_id        UUID NOT NULL REFERENCES auth.users,
  -- The Member acted on behalf of. Nullable when the action is about the
  -- workspace itself (e.g. a configuration change) rather than about a
  -- specific roster Member.
  subject_member_id    UUID REFERENCES auth.users ON DELETE SET NULL,
  action               TEXT NOT NULL,
  -- The named permission relied on, e.g. 'edit_metadata'. Nullable for
  -- workspace-administrative actions that are not permission-gated (e.g.
  -- creating the workspace itself).
  permission_relied_on TEXT,
  target_type          TEXT NOT NULL,
  target_id            UUID,
  changes              JSONB NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspace_audit_log_workspace
  ON public.workspace_audit_log (workspace_id, created_at DESC);
CREATE INDEX idx_workspace_audit_log_subject
  ON public.workspace_audit_log (subject_member_id, created_at DESC);

ALTER TABLE public.workspace_audit_log ENABLE ROW LEVEL SECURITY;

-- ─── (e) Write lockdown — no client PostgREST write path on any of the ────
--         four tables (078 section (b)'s posture, restated for workspaces).
-- Every write goes through a service-role API route that has already
-- proved caller authority — the same decision migration 078 made for
-- project_members, migration 042 made for capability_grants, and migration
-- 136 made for work_members.
REVOKE INSERT, UPDATE, DELETE ON public.workspaces FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.workspace_members FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.workspace_invitations FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.workspace_audit_log FROM authenticated, anon;

-- The audit log additionally may never be UPDATEd or DELETEd by ANY
-- application role, including service_role reached through PostgREST —
-- append-only for every role, not merely for authenticated/anon (D-50).
-- Mirrors migration 089's staff_audit_log posture ("a staff account cannot
-- read, forge, or tamper with its own audit trail"), extended here to
-- explicitly name PUBLIC so the append-only guarantee cannot be
-- circumvented by any future role grant.
REVOKE UPDATE, DELETE ON public.workspace_audit_log FROM PUBLIC;

-- ─── (f) SECURITY DEFINER helper pair ──────────────────────────────────────
-- Copies migration 078's proven shape exactly, which in turn copies
-- migration 064's. Both take the user id as a PARAMETER rather than
-- calling auth.uid() internally, so `SET search_path = ''` does not have
-- to reach into the auth schema. STABLE lets the planner cache the result
-- within a single statement when the policy wraps the call as
-- `(SELECT ...)`, which every policy below does.
CREATE OR REPLACE FUNCTION public.workspace_member_role(p_workspace_id UUID, p_uid UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_uid AND status = 'active'
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_owner(p_workspace_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = p_uid
      AND role = 'owner' AND status = 'active'
  )
$$;

-- These two ARE invoked from RLS policy bodies as the querying role, so
-- they need GRANT EXECUTE TO authenticated — migration 064/078/136's
-- grant-back posture. anon has no legitimate workspace access and must
-- never be handed a SECURITY DEFINER oracle for "does user X hold a role /
-- own workspace Y".
REVOKE EXECUTE ON FUNCTION public.workspace_member_role(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.workspace_member_role(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_workspace_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_workspace_owner(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.workspace_member_role(uuid, uuid) IS
  'Returns uid''s role on the given workspace (owner/admin/member/contractor/guest) among ACTIVE memberships only, or NULL if not an active member. SECURITY DEFINER so it can be called from workspaces'' and workspace_invitations'' RLS policies without re-entering workspace_members'' own policies (would recurse with 42P17 — see migrations 018, 064, 078 and 136, whose precedent this reapplies). Intended for RLS policy USING clauses wrapped as (SELECT ...), not a client-invoked RPC.';

COMMENT ON FUNCTION public.is_workspace_owner(uuid, uuid) IS
  'True when uid holds an ACTIVE owner-role membership on the given workspace. SECURITY DEFINER so it can be called from workspace_members'' and workspace_invitations'' RLS policies without re-entering workspace_members'' own policies (would recurse with 42P17). Intended for RLS policy USING clauses wrapped as (SELECT ...), not a client-invoked RPC.';

-- ─── (g) Own-table SELECT policies — every one routes through the helper ──
--         pair above, never a bare cross-table EXISTS (the recursion rule).
CREATE POLICY "workspaces_select_member" ON public.workspaces
  FOR SELECT TO authenticated
  USING (
    (SELECT public.workspace_member_role(id, auth.uid())) IS NOT NULL
    OR created_by = (SELECT auth.uid())
  );

-- Least privilege, mirroring migration 078's project_members_select and
-- migration 136's work_members_select: a member sees their own row (enough
-- to render "you're a member of this workspace"); an owner or admin sees
-- the full guest list, because they manage it.
CREATE POLICY "workspace_members_select" ON public.workspace_members
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT public.is_workspace_owner(workspace_id, auth.uid()))
    OR (SELECT public.workspace_member_role(workspace_id, auth.uid())) = 'admin'
  );

-- Owner or admin only. The invited address does NOT get read access to
-- their own pending invitation through this policy — binding an invitation
-- to the invitee happens in a service route (plan 38-06), never through a
-- client-side read of this table, so a guessed or leaked email address
-- cannot be used to probe for a live invitation (T-38-03-07).
CREATE POLICY "workspace_invitations_select" ON public.workspace_invitations
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_workspace_owner(workspace_id, auth.uid()))
    OR (SELECT public.workspace_member_role(workspace_id, auth.uid())) = 'admin'
  );

-- ─── (h) Owner-floor guard — never-zero-owners (D-13) ─────────────────────
-- Generalizes migration 172's guard_work_graduation_owner_only() BEFORE-
-- trigger shape: fire before the mutation, count what would remain, and
-- raise rather than allow the workspace to be orphaned. Enforced in the
-- DATABASE, never merely in the UI or a route (D-13) — this is the last
-- line of defense even if every application-layer check above it is
-- someday bypassed or buggy.
--
-- The RAISE EXCEPTION text below is byte-identical to
-- WORKSPACE_OWNER_FLOOR_MESSAGE exported from lib/workspaces/membership.ts
-- (Phase 38 plan 38-02), so the database, the API, and the UI all say the
-- same sentence about the same rule. __tests__/migration-182.test.ts
-- asserts this equality; if plan 38-02's constant text ever changes, this
-- string must change with it in the same commit.
CREATE OR REPLACE FUNCTION public.guard_workspace_never_zero_owners()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_remaining_owners INT;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'owner' AND OLD.status = 'active')
     OR (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND OLD.status = 'active'
         AND (NEW.role <> 'owner' OR NEW.status <> 'active')) THEN
    SELECT COUNT(*) INTO v_remaining_owners
    FROM public.workspace_members
    WHERE workspace_id = OLD.workspace_id
      AND role = 'owner'
      AND status = 'active'
      AND id <> OLD.id;

    IF v_remaining_owners = 0 THEN
      RAISE EXCEPTION 'A workspace must always have at least one active owner.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger-internal only — no app code or RLS policy invokes this directly,
-- so it follows migration 070/172's revoke-only posture rather than
-- section (f)'s grant-back posture.
REVOKE EXECUTE ON FUNCTION public.guard_workspace_never_zero_owners() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_workspace_never_zero_owners ON public.workspace_members;
CREATE TRIGGER guard_workspace_never_zero_owners
  BEFORE DELETE OR UPDATE ON public.workspace_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_never_zero_owners();

-- ─── (i) Schema-cache reload ───────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
