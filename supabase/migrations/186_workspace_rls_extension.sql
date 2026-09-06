-- ============================================================
-- Funūn — Phase 38 (member-organization-team-workspaces): Slice D
--                the RLS workspace branch + the platform-wide disable control.
-- Migration 186: public.workspace_access_config (D-56/WS-31 kill switch),
--                public.workspace_access_enabled(),
--                public.workspace_project_permission() — the three-hop
--                SECURITY DEFINER helper — public.workspace_audit_visible(),
--                one additive OR clause on each of ten LIVE policies across
--                vault_projects/tracks/vault_assets/vault_documents/
--                tool_outputs, and workspace_audit_log's both-sides SELECT
--                policy.
--
-- HUMAN-GATED — this project never runs `supabase db push`, `supabase db
-- reset`, or `supabase migration up` from an agent. That is the standing
-- convention stated verbatim in the headers of migrations 078, 080, 136,
-- 177, 181, 182, 183, 184 and 185. This file is authored and text-tested
-- (__tests__/migration-186.test.ts, __tests__/workspace-structural-
-- exclusions.test.ts) but must not be applied automatically.
--
-- ─── THIS MIGRATION IS PUSHED ALONE — NEVER BATCHED WITH 182-185 ─────────
-- Migrations 182, 183, 184 and 185 are purely ADDITIVE: new tables, new
-- functions, new policies on tables that did not have policies before. This
-- migration is different in kind, not degree: section (d) below DROPs and
-- RECREATES ten policies that are LIVE IN PRODUCTION on vault_projects and
-- its four child tables — the exact tables every artist's catalogue lives
-- in. A defect here does not merely fail to add a feature; it can grant a
-- third party access to catalogue rows platform-wide, silently, the moment
-- the migration lands. For that reason this file gets its OWN review, its
-- OWN `supabase db push`, its OWN `supabase migration list` confirmation,
-- and its OWN adversarial smoke run (38-RLS-SMOKE-CHECKLIST.md) — it must
-- NOT be pushed in the same run as 183/184/185's batch, and it must not be
-- pushed until that batch is confirmed LIVE and stable first.
--
-- MIGRATION NUMBERING (Phase 38 planner decision 1, restated from migrations
-- 182-185's headers): 182 = plan 38-03 (Slice A, LIVE). 183 = plan 38-04
-- (Slice B). 184 = plan 38-08 (Slice C). 185 = plan 38-10 (Slice D's
-- additive half: attachments + custody transfers). 186 (this file) = plan
-- 38-11 — Slice D's POLICY half. 187 and 188 remain RESERVED for Phase
-- 38.2's billing and beta-flag migrations and MUST NOT be claimed by any
-- plan in this phase.
--
-- ─── THE RECURSION DOCTRINE (018 → 064 → 078 → 136 → 182/183/184/185) ────
-- Every prior fix in this family resolved a TWO-table mutual-visibility
-- cycle with a SECURITY DEFINER helper pair. This migration's chain is ONE
-- HOP LONGER than any of them: project → attachment → membership →
-- relationship → grant. All four hops happen INSIDE ONE SECURITY DEFINER
-- function body (workspace_project_permission, section (b) below) precisely
-- so the query rewriter never re-enters an RLS-protected production table
-- while evaluating a policy on that same table (or any of its siblings).
-- The function body below reads ONLY the four workspace tables
-- (workspace_attachments, workspace_members, workspace_roster_relationships,
-- workspace_grants) — it does not read vault_projects, tracks, vault_assets,
-- vault_documents or tool_outputs at all, so it cannot recurse into any of
-- the policies it is called from. __tests__/migration-186.test.ts asserts
-- this non-recursion property textually.
--
-- ─── THE SUBSELECT-WRAPPING RULE ──────────────────────────────────────────
-- Every call to workspace_project_permission() or workspace_audit_visible()
-- from inside a policy body is wrapped as a scalar subselect
-- `(SELECT public.helper(...))`, exactly as migrations 078/136/182/183/184/
-- 185 wrap their own helpers. This lets the planner cache the result once
-- per statement rather than once per row, and — more importantly for this
-- migration specifically — it is what makes the helper an INITPLAN rather
-- than a per-row correlated subquery for the zero-argument/uid-only case.
-- __tests__/migration-186.test.ts collects every unwrapped call site inside
-- a CREATE POLICY block into an array and asserts it is empty, so a later
-- hand-edit that inlines a bare `public.workspace_project_permission(...)`
-- fails the suite instead of production.
--
-- ─── INCLUSION / EXCLUSION CHECKLIST (38-RESEARCH.md Pitfall 2) ──────────
-- The workspace branch added by this migration reaches EXACTLY these five
-- tables' policies, plus one new policy on a sixth table:
--   INCLUDED: vault_projects, tracks, vault_assets, vault_documents,
--             tool_outputs (the additive OR branch), workspace_audit_log
--             (a brand-new SELECT policy, D-50).
-- The workspace branch is added to NEITHER of vault_projects' remaining two
-- policies, and MUST NEVER be added to any of the surfaces below, in this or
-- any future migration, without a new deliberation reopening D-42/custody
-- D-01/D-09 explicitly:
--   EXCLUDED: vault_projects_insert_own, vault_projects_delete_owner_only
--             (project creation by a workspace happens through a service
--             route that writes the row as the subject Member — D-24 — and
--             deleting a Member's record is never a workspace-derived
--             power); the clean-master accessor path (custody D-01/D-09 —
--             no general accessor may sign an arbitrary storage path, and a
--             workspace grant only ever authorises asking the SAME narrow,
--             asset-class-specific accessor non-workspace access already
--             uses); `subscriptions` (D-44's per-user UNIQUE constraint is
--             untouched — workspace billing is a future, separate schema);
--             any future payout or tax table (D-42 — structurally excluded,
--             not merely unbundled). __tests__/migration-186.test.ts's
--             blast-radius test extracts the table name from every
--             CREATE/DROP POLICY statement in this file and compares it
--             against an explicit six-table allowlist rather than grepping
--             forbidden names one at a time; a separate suite,
--             __tests__/workspace-structural-exclusions.test.ts, proves the
--             exclusion at the repository level by walking every module that
--             signs a storage URL and asserting none of them imports a
--             workspace module.
--
-- THIS FILE DOES NOT TOUCH: project_members, work_members, idea_members,
-- split_sheets, split_sheet_parties, subscriptions, user_profiles,
-- artist_profiles, buyer_orgs, buyer_members, funun_staff. It does not
-- modify handle_new_user(). It adds no policy to any storage-related table
-- or bucket policy. Every one of public.workspaces, public.workspace_members,
-- public.workspace_invitations, public.workspace_roster_relationships,
-- public.workspace_agreement_evidence, public.workspace_roster_blocks,
-- public.workspace_grants, public.workspace_permission_bundles,
-- public.workspace_attachments and public.workspace_custody_transfers
-- (migrations 182-185) is READ FROM by this migration's new helper bodies
-- but never altered.
--
-- UUID DEFAULTS: this migration adds no UUID columns. workspace_access_config
-- (section (a)) uses a BOOLEAN primary key by design (a true singleton),
-- never gen_random_uuid()/uuid_generate_v4() — restated here only so a
-- reviewer does not mistake the absence of a UUID default for an omission.
-- ============================================================

-- ─── (a) The platform-wide disable control (D-56 / WS-31) ────────────────
-- THIS IS A WORKING CONTROL, NOT A SEAM. CONTEXT's risk register (risk 5)
-- originally scoped D-55 as a cohort-only flag and left a platform-wide
-- disable control as a recommendation for later. The owner elevated that
-- recommendation to a binding decision at planning (D-56, 2026-09-05):
-- because this migration is the highest-risk change in the phase, an owner
-- must be able to turn the ENTIRE workspace RLS branch off instantly, with
-- no deploy and no further migration, the moment a defect is suspected —
-- without touching personal Member access at all. workspace_access_config
-- is a true singleton, following migration 128's health_rules_config
-- precedent for a single-row configuration table.
CREATE TABLE public.workspace_access_config (
  id              BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  disabled_reason TEXT,
  disabled_by     UUID REFERENCES auth.users,
  disabled_at     TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.workspace_access_config IS
  'A true singleton (id BOOLEAN PRIMARY KEY CHECK (id) forbids a second row). The ONE platform-wide control every workspace RLS branch consults via workspace_access_enabled() below. Flipping enabled to FALSE disables ALL workspace-derived access on vault_projects and its four child tables instantly, with no deploy and no policy change (D-56/WS-31). Personal Member access (ownership, project_members) never consults this table and is completely unaffected by its value. Writable ONLY by the service role — see the REVOKE below and lib/workspaces/access-kill-switch.ts, which is the sole application-layer writer, gated leadership-only at app/api/admin/workspaces/access/route.ts.';

INSERT INTO public.workspace_access_config (id, enabled)
VALUES (TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.workspace_access_config ENABLE ROW LEVEL SECURITY;

-- No client role may read or write this table directly, in either
-- direction. Unlike every other workspace table (182-185's section (e)/(c)/
-- (d) posture, which revokes writes but grants SELECT via RLS), this table
-- ALSO revokes SELECT — a client has no legitimate reason to read the raw
-- config row; the only consumer is workspace_access_enabled() below (a
-- SECURITY DEFINER function) and the leadership-only admin route via the
-- service role.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.workspace_access_config FROM authenticated, anon;

-- The single predicate every workspace RLS branch consults.
--
-- STABLE SECURITY DEFINER, DELIBERATELY NOT IMMUTABLE: this function reads
-- a table, so its result can change between calls (that is the entire
-- point of a kill switch). Declaring it IMMUTABLE would be a correctness
-- bug that also defeats the control's purpose — the query planner is
-- permitted to fold an IMMUTABLE function's result into a constant at plan
-- time and reuse that constant across later executions of a cached plan,
-- which would let a stale "enabled" reading survive an owner's flip to
-- FALSE. STABLE only promises "the same result within one statement," which
-- is exactly the caching behavior the (SELECT ...) wrapping convention
-- wants, without the plan-caching hazard.
--
-- COALESCE(..., FALSE): a missing or unreadable config row means workspace
-- access is DISABLED, never enabled — fail CLOSED, not open, on the
-- singleton row ever being absent (a state that should never occur given
-- the seed insert above, but the function does not trust that it always
-- will).
CREATE OR REPLACE FUNCTION public.workspace_access_enabled()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT enabled FROM public.workspace_access_config WHERE id), FALSE)
$$;

REVOKE EXECUTE ON FUNCTION public.workspace_access_enabled() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.workspace_access_enabled() TO authenticated;

COMMENT ON FUNCTION public.workspace_access_enabled() IS
  'The single predicate every workspace RLS branch consults before doing anything else (see public.workspace_project_permission below, which returns FALSE immediately when this is FALSE). STABLE SECURITY DEFINER, deliberately NOT IMMUTABLE -- IMMUTABLE would let the query planner fold a stale TRUE/FALSE reading into a cached plan and defeat the control the moment an owner flips it (D-56/WS-31). Body is COALESCE(..., FALSE): a missing or unreadable config row fails CLOSED. Personal Member access (ownership, project_members) never calls this function. Intended for RLS policy USING clauses wrapped as (SELECT ...), not a client-invoked RPC.';

-- ─── (b) The three-hop SECURITY DEFINER helper ───────────────────────────
-- public.workspace_project_permission(project, caller, permission) is the
-- SINGLE POINT at which a workspace can reach a Member's project. Every
-- policy branch added by section (d) below calls this function and nothing
-- else. It resolves, entirely inside this one function body (no
-- cross-table EXISTS in any RLS policy, per the recursion doctrine above):
--   hop 1 -- a LIVE attachment linking the project to a workspace
--           (workspace_attachments, migration 185, detached_at IS NULL);
--   hop 2 -- the caller holding an ACTIVE, unexpired membership in that
--           workspace (workspace_members, migration 182);
--   hop 3 -- an ACCEPTED roster relationship for that workspace, inside its
--           open date window (workspace_roster_relationships, migration
--           183) -- joined on the attachment's OWN relationship_id when it
--           is non-null, so an attachment can never outlive the specific
--           consent that justified it (D-05, D-17, D-18);
--   hop 4 -- an UNREVOKED grant on that exact relationship for the
--           requested permission, scoped to this project or workspace-wide
--           (workspace_grants, migration 184) -- constrained to the SAME
--           relationship resolved at hop 3 (g.relationship_id IS NULL OR
--           g.relationship_id = r.id), matching
--           lib/workspaces/grant-service.ts's resolveEffectivePermissions,
--           which filters grants by .eq(''relationship_id'', ...) exactly
--           this way (plan 38-09) -- a grant issued against one roster
--           relationship must never satisfy access for a DIFFERENT
--           relationship in the same workspace, even one that is also live.
-- The function is STABLE (not IMMUTABLE -- membership, relationship state
-- and grants all change over time) so every hop is read live, on every
-- call, exactly as lib/workspaces/grant-service.ts's resolver re-derives
-- everything on every call with nothing cached (T-38-11-05).
CREATE OR REPLACE FUNCTION public.workspace_project_permission(
  p_project_id UUID,
  p_uid UUID,
  p_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.workspace_access_enabled()
    AND EXISTS (
      SELECT 1
      FROM public.workspace_attachments a
      JOIN public.workspace_members m
        ON m.workspace_id = a.workspace_id
       AND m.user_id = p_uid
       AND m.status = 'active'
       AND (m.expires_at IS NULL OR m.expires_at > now())
      JOIN public.workspace_roster_relationships r
        ON r.workspace_id = a.workspace_id
       AND (a.relationship_id IS NULL OR r.id = a.relationship_id)
       AND r.state = 'accepted'
       AND (r.effective_from IS NULL OR r.effective_from <= CURRENT_DATE)
       AND (r.terminates_on IS NULL OR r.terminates_on > CURRENT_DATE)
      JOIN public.workspace_grants g
        ON g.workspace_id = a.workspace_id
       AND (g.relationship_id IS NULL OR g.relationship_id = r.id)
       AND g.permission = p_permission
       AND g.revoked_at IS NULL
       AND (g.project_id IS NULL OR g.project_id = p_project_id)
      WHERE a.project_id = p_project_id
        AND a.detached_at IS NULL
    )
$$;

REVOKE EXECUTE ON FUNCTION public.workspace_project_permission(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.workspace_project_permission(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.workspace_project_permission(uuid, uuid, text) IS
  'The single point at which a workspace can reach a Member''s project. Resolves a live attachment (workspace_attachments), an active unexpired membership (workspace_members), an accepted in-window roster relationship joined through the attachment''s own relationship_id (workspace_roster_relationships), and an unrevoked grant on that SAME relationship for the requested permission (workspace_grants) -- all four hops inside this ONE SECURITY DEFINER function body, so the query rewriter never re-enters vault_projects, tracks, vault_assets, vault_documents or tool_outputs while evaluating a policy on any of them (the recursion class from migrations 018, 064, 078, 136, extended one hop further here -- SQLSTATE 42P17). Returns FALSE immediately when public.workspace_access_enabled() is FALSE (D-56/WS-31). STABLE, not IMMUTABLE or cached anywhere: every hop is read live on every call, matching lib/workspaces/grant-service.ts''s resolveEffectivePermissions, which never caches (T-38-11-05). Returns a boolean about a named permission only -- it never resolves, signs or returns a storage path or URL of any kind (custody D-01/D-09: no grant may become a shortcut around the existing narrow, asset-class-specific accessors). Intended for RLS policy USING/WITH CHECK clauses wrapped as (SELECT ...), not a client-invoked RPC.';

-- ─── (c) The both-sides audit visibility helper (D-50) ───────────────────
-- workspace_audit_log (migration 182 section (d)) was created RLS-enabled
-- with ZERO SELECT policy on purpose -- denying all authenticated/anon
-- access by construction until this migration's helper and policy exist.
-- True when the caller is the row's actor, its named subject Member, or an
-- ACTIVE member of the workspace the row belongs to -- this is what makes
-- an audit trail readable by BOTH the acting workspace and the affected
-- Member (D-50), not merely by the workspace administering it.
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
        OR public.workspace_member_role(l.workspace_id, p_uid) IS NOT NULL
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.workspace_audit_visible(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.workspace_audit_visible(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.workspace_audit_visible(uuid, uuid) IS
  'True when p_uid is the audit row''s actor, its named subject Member, or an ACTIVE member of the row''s own workspace (via migration 182''s workspace_member_role). This is what makes workspace_audit_log readable by BOTH the acting workspace and the affected Member (D-50) -- delegated access is only trustworthy if the person delegated to cannot see the trail while the person delegated ON has no window into it. SECURITY DEFINER so it can be called from workspace_audit_log''s own RLS policy without re-entering it (would recurse with 42P17, per migrations 018, 064, 078, 136, 182, 183, 184, 185). Intended for RLS policy USING clauses wrapped as (SELECT ...), not a client-invoked RPC.';

-- ─── (d) Policy extension — one additive OR clause per policy, ten total ─
-- Every policy below is DROPped and RECREATED with its ORIGINAL clauses
-- preserved VERBATIM (D-48) plus exactly one new
-- `OR (SELECT public.workspace_project_permission(...))` branch. Nothing is
-- restructured, reordered or simplified. __tests__/migration-186.test.ts
-- asserts the original clauses -- including vault_documents' and
-- tool_outputs' `project_id IS NULL` fallback -- survive byte-for-byte.

-- vault_projects: SELECT widens; UPDATE widens (USING + WITH CHECK).
-- INSERT and DELETE are DELIBERATELY untouched -- see the header's
-- inclusion/exclusion checklist. vault_projects_insert_own and
-- vault_projects_delete_owner_only are not named by any statement in this
-- file: a workspace-created project is written as the subject Member by a
-- service route (D-24, plan 38-12), never by a workspace acting as though
-- it were the project's own creator, and deleting a Member's record is
-- never a workspace-derived power under any grant this schema can express.
DROP POLICY IF EXISTS "vault_projects_select_owner_or_member" ON public.vault_projects;

CREATE POLICY "vault_projects_select_owner_or_member" ON public.vault_projects
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (SELECT public.project_member_role(id, auth.uid())) IS NOT NULL
    OR (SELECT public.workspace_project_permission(id, auth.uid(), 'view_summaries'))
  );

DROP POLICY IF EXISTS "vault_projects_update_owner_or_editor" ON public.vault_projects;

CREATE POLICY "vault_projects_update_owner_or_editor" ON public.vault_projects
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (SELECT public.project_member_role(id, auth.uid())) IN ('co-owner', 'editor')
    OR (SELECT public.workspace_project_permission(id, auth.uid(), 'edit_metadata'))
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR (SELECT public.project_member_role(id, auth.uid())) IN ('co-owner', 'editor')
    OR (SELECT public.workspace_project_permission(id, auth.uid(), 'edit_metadata'))
  );

-- tracks (project_id NOT NULL — no nullable fallback needed, matching 078).
DROP POLICY IF EXISTS "tracks_select_project_owner_or_member" ON public.tracks;

CREATE POLICY "tracks_select_project_owner_or_member" ON public.tracks
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IS NOT NULL
    OR (SELECT public.workspace_project_permission(project_id, auth.uid(), 'view_summaries'))
  );

DROP POLICY IF EXISTS "tracks_write_project_owner_or_editor" ON public.tracks;

CREATE POLICY "tracks_write_project_owner_or_editor" ON public.tracks
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
    OR (SELECT public.workspace_project_permission(project_id, auth.uid(), 'edit_metadata'))
  )
  WITH CHECK (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
    OR (SELECT public.workspace_project_permission(project_id, auth.uid(), 'edit_metadata'))
  );

-- vault_assets (project_id NOT NULL — no nullable fallback needed).
DROP POLICY IF EXISTS "vault_assets_select_project_owner_or_member" ON public.vault_assets;

CREATE POLICY "vault_assets_select_project_owner_or_member" ON public.vault_assets
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IS NOT NULL
    OR (SELECT public.workspace_project_permission(project_id, auth.uid(), 'view_summaries'))
  );

DROP POLICY IF EXISTS "vault_assets_write_project_owner_or_editor" ON public.vault_assets;

CREATE POLICY "vault_assets_write_project_owner_or_editor" ON public.vault_assets
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
    OR (SELECT public.workspace_project_permission(project_id, auth.uid(), 'edit_metadata'))
  )
  WITH CHECK (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
    OR (SELECT public.workspace_project_permission(project_id, auth.uid(), 'edit_metadata'))
  );

-- vault_documents (project_id NULLABLE — migration 001. The
-- `project_id IS NULL AND user_id = (SELECT auth.uid())` fallback from
-- migration 078 is preserved VERBATIM on both SELECT and write policies so
-- an owner's pre-existing unattached documents stay reachable).
DROP POLICY IF EXISTS "vault_documents_select_project_owner_or_member" ON public.vault_documents;

CREATE POLICY "vault_documents_select_project_owner_or_member" ON public.vault_documents
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IS NOT NULL
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
    OR (SELECT public.workspace_project_permission(project_id, auth.uid(), 'view_summaries'))
  );

DROP POLICY IF EXISTS "vault_documents_write_project_owner_or_editor" ON public.vault_documents;

CREATE POLICY "vault_documents_write_project_owner_or_editor" ON public.vault_documents
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
    OR (SELECT public.workspace_project_permission(project_id, auth.uid(), 'edit_metadata'))
  )
  WITH CHECK (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
    OR (SELECT public.workspace_project_permission(project_id, auth.uid(), 'edit_metadata'))
  );

-- tool_outputs (project_id NULLABLE, ON DELETE SET NULL — migration 001.
-- Same nullable fallback as vault_documents above, preserved verbatim).
DROP POLICY IF EXISTS "tool_outputs_select_project_owner_or_member" ON public.tool_outputs;

CREATE POLICY "tool_outputs_select_project_owner_or_member" ON public.tool_outputs
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IS NOT NULL
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
    OR (SELECT public.workspace_project_permission(project_id, auth.uid(), 'view_summaries'))
  );

DROP POLICY IF EXISTS "tool_outputs_write_project_owner_or_editor" ON public.tool_outputs;

CREATE POLICY "tool_outputs_write_project_owner_or_editor" ON public.tool_outputs
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
    OR (SELECT public.workspace_project_permission(project_id, auth.uid(), 'edit_metadata'))
  )
  WITH CHECK (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
    OR (SELECT public.workspace_project_permission(project_id, auth.uid(), 'edit_metadata'))
  );

-- ─── (e) workspace_audit_log — the both-sides SELECT policy (D-50) ───────
-- The ONLY policy this migration creates fresh rather than recreates.
-- workspace_audit_log has been RLS-enabled with zero policies since
-- migration 182 specifically so it denied all access until this predicate
-- existed (see migration 182 section (d)'s comment).
CREATE POLICY "workspace_audit_log_select" ON public.workspace_audit_log
  FOR SELECT TO authenticated
  USING (
    (SELECT public.workspace_audit_visible(id, auth.uid()))
  );

-- ─── (f) Schema-cache reload ───────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
