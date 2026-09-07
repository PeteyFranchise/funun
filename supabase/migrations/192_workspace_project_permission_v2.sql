-- ============================================================
-- Funūn — Phase 38.0.1 (workspace-authorization-remediation): Plan 09.
-- Migration 192: the `workspace_project_permission` helper v2 —
--                `public.workspace_grant_lineage_live()` added, and
--                `public.workspace_member_role()`, `public.is_workspace_owner()`
--                and `public.workspace_project_permission()` replaced.
--
-- HUMAN-GATED — this project never runs `supabase db push`, `supabase db
-- reset`, `supabase migration up`, or `supabase db query` from an agent.
-- That is the standing convention stated verbatim in the headers of
-- migrations 078, 080, 136, 177 and 181-189. This file is authored and
-- text-tested (__tests__/migration-192.test.ts) but must not be applied
-- automatically.
--
-- ─── PUSHED WITH 191, 193 AND 194 — NEVER STAGED ALONE ───────────────────
-- This migration is pushed TOGETHER with 191, 193 and 194, and with the
-- TypeScript changes from plans 04, 06, 08 and 11, in one transaction
-- window at plan 11's joint checkpoint. It is never staged ahead of that
-- window: staging it alone would either remove an RLS branch's dependency
-- (191's `parent_grant_id` column and NOT NULL constraints, which this
-- file's lineage walk and custody-binding joins both require) before that
-- replacement schema exists, or leave two authorization definitions live at
-- once with no test saying which one a given call actually executed. This
-- checkpoint is a REVIEW-AND-HOLD, not a push authorisation — see this
-- plan's Task 3.
--
-- MIGRATION NUMBERING (Phase 38.0.1 planner decision, restated from
-- migration 191's header): 190 = plan 02 (the R-17/WSR-25 `vault_projects.
-- user_id` immutability trigger — a separate, self-contained change that
-- ships on its own, not part of this chain). 191 = plan 05 (the consent
-- root, delegation lineage, NOT NULL tightening and evidence confirmation
-- schema this file's lineage walk and custody binding both depend on). 192
-- (this file) = plan 09. 193 and 194 remain this phase's later plans (the
-- policy rewrite that narrows the `vault_projects` branch and removes the
-- workspace branch from the four child tables, and the Member consent RPC
-- route). 195-196 are RESERVED for Phase 38.0.2. 197-198 are RESERVED for
-- Phase 38.2's billing and beta-flag migrations.
--
-- ─── WHY THIS EXISTS (R-01/WSR-02, R-02/WSR-05, R-04/WSR-06, R-11/WSR-17;
--     findings F4, F12, F6) ─────────────────────────────────────────────
-- Two verified defects in migration 186's helper, plus one companion fix
-- these two share a migration with because 192's helper needs all three
-- together:
--   F4 — `workspace_project_permission` resolves attachment -> membership ->
--   relationship -> grant and never reads `vault_projects.user_id` at all.
--   Its own header states this as a deliberate anti-recursion choice, but
--   that rationale is over-cautious (see the RECURSION DOCTRINE section
--   below) — the consequence is that when custody transfers to a different
--   Member, the previous custodian's workspace attachment/relationship/
--   grant chain keeps working (R-04/WSR-06).
--   F6 — a delegated grant with no live Member consent behind it could
--   still authorise access, because nothing re-validated the delegation
--   lineage at read time. `public.workspace_grant_lineage_live` (section
--   (a) below) is the SQL twin of `lib/workspaces/grant-lineage.ts`'s
--   `isGrantChainLive`, closing this at hop 6 (R-01/WSR-02).
--   F12 — `workspace_member_role` and `is_workspace_owner` (migration 182)
--   filter on `status = 'active'` only and ignore `expires_at`, while
--   `requireWorkspaceAccess` (the API layer) checks it — so an expired
--   contractor seat is refused by the API and admitted by RLS. Section (b)
--   below adds the same `expires_at` clause to both, giving the codebase
--   ONE canonical live-membership definition (R-11/WSR-17).
--
-- ─── THE RECURSION DOCTRINE (018 -> 064 -> 078 -> 136 -> 182-186), WITH
--     THE CORRECTED NUANCE FROM RESEARCH PITFALL 1 ────────────────────────
-- Every prior fix in this family resolved a cross-table mutual-visibility
-- cycle with a SECURITY DEFINER helper. Migration 186 restated the rule as
-- "the helper reads only the four workspace tables — never vault_projects
-- or its siblings — so the query rewriter never re-enters an RLS-protected
-- production table while evaluating a policy on that same table." That
-- exclusion of `vault_projects` was over-cautious, not load-bearing for
-- recursion safety: a SECURITY DEFINER function owned by a role that
-- bypasses RLS on `vault_projects` (the standard Supabase migration-owner
-- setup) does not trigger RLS re-evaluation by reading that table with a
-- plain SELECT inside its own body — it would only recurse if it went back
-- through a POLICY, which a direct table read inside a SECURITY DEFINER
-- body never does. What recursion actually forbids, and what this file
-- still never writes, is a cross-table EXISTS inlined inside a POLICY body.
-- Section (c) below therefore adds a plain `JOIN public.vault_projects`
-- directly inside `workspace_project_permission`'s own body — this is safe
-- by the doctrine above, not an exception to it. This migration's helper
-- body still reads NONE of `tracks`, `vault_assets`, `vault_documents` or
-- `tool_outputs` — those four remain untouched, their policy branch is
-- migration 193's job, not this file's.
--
-- ─── THE SUBSELECT-WRAPPING RULE ──────────────────────────────────────────
-- Every call to any of this file's four functions from inside a policy body
-- must be wrapped as a scalar subselect `(SELECT public.helper(...))`,
-- exactly as migrations 078/136/182/183/184/185/186 wrap their own helpers.
-- This migration creates and drops NO policy itself (that is migration
-- 193's job) — this rule is restated here only so the callers migration 193
-- adds honour it from day one.
--
-- WHY NO BACKFILL EXISTS — this migration adds no new table and no new
-- nullable-to-NOT-NULL column; it replaces function bodies only. Migration
-- 191 already covers the NOT NULL tightening this file's joins depend on.
--
-- UUID DEFAULTS: this migration creates no table and mints no `id` column,
-- so there is no UUID default to restate.
--
-- THIS FILE CREATES AND DROPS NO POLICY OF ANY KIND. It replaces functions
-- only. Every policy change belonging to this phase is migration 193's job.
-- Nothing in `handle_new_user()`, `member_type`, `industry_roles`,
-- `capability_grants`, or `project_members` is touched (D-52).
-- ============================================================

-- ─── (a) The delegation-lineage function (R-01/WSR-02, F6) ───────────────
-- The SQL twin of `lib/workspaces/grant-lineage.ts`'s `isGrantChainLive`.
-- The two must be changed together — a change to which links count as
-- "live" on one side without a matching change on the other would let the
-- TypeScript-side and SQL-side authorities silently drift apart.
--
-- Walks `parent_grant_id` upward from the named grant via `WITH RECURSIVE`
-- and returns TRUE only when (1) no row anywhere in the chain carries a
-- non-null `revoked_at` — a revoked link anywhere kills every descendant at
-- read time, with nothing cached (D-49) — and (2) some row in the chain has
-- a null `parent_grant_id` and `source = 'member_consent'` — a chain with
-- no live consent root confers nothing, closing the F6 bootstrap-abuse
-- path. The `depth` column bounds the walk at the SAME `MAX_GRANT_CHAIN_DEPTH`
-- (8) `lib/workspaces/grant-lineage.ts` exports, so a cycle introduced by a
-- future schema error terminates rather than loops — this is a
-- denial-of-service guard, not a business rule (D-21 already describes
-- exactly two tiers of authority by design).
CREATE OR REPLACE FUNCTION public.workspace_grant_lineage_live(p_grant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE chain AS (
    SELECT id, parent_grant_id, revoked_at, source, 0 AS depth
    FROM public.workspace_grants
    WHERE id = p_grant_id
    UNION ALL
    SELECT g.id, g.parent_grant_id, g.revoked_at, g.source, c.depth + 1
    FROM public.workspace_grants g
    JOIN chain c ON g.id = c.parent_grant_id
    WHERE c.depth < 8
  )
  SELECT
    -- every link in the chain must be unrevoked ...
    NOT EXISTS (SELECT 1 FROM chain WHERE revoked_at IS NOT NULL)
    -- ... and the chain must terminate at a live member-consent root
    AND EXISTS (SELECT 1 FROM chain WHERE parent_grant_id IS NULL AND source = 'member_consent')
$$;

-- Reached from the policy-evaluating role through
-- workspace_project_permission below.
REVOKE EXECUTE ON FUNCTION public.workspace_grant_lineage_live(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.workspace_grant_lineage_live(uuid) TO authenticated;

COMMENT ON FUNCTION public.workspace_grant_lineage_live(uuid) IS
  'The SQL twin of lib/workspaces/grant-lineage.ts''s isGrantChainLive() (MEMBER_CONSENT_SOURCE = ''member_consent'', MAX_GRANT_CHAIN_DEPTH = 8) — the two must be changed together. Walks parent_grant_id upward via WITH RECURSIVE and returns TRUE only when no link in the chain is revoked AND the chain terminates at an unrevoked source = ''member_consent'' root. Nothing is cached: revocation of any ancestor becomes visible to every descendant on the very next read (D-49), never on a cron tick. The depth bound is a denial-of-service guard against a cycle introduced by a future schema error, not a business rule. SECURITY DEFINER so it can be called from workspace_project_permission''s own body without re-entering any policy. Intended for RLS policy USING clauses wrapped as (SELECT ...), not a client-invoked RPC.';

-- ─── (b) workspace_member_role and is_workspace_owner — expires_at added ──
-- (R-11/WSR-17, F12)
-- CREATE OR REPLACE, not a new function: same signatures, same bodies as
-- migration 182, plus `AND (expires_at IS NULL OR expires_at > now())` in
-- the WHERE clause. This makes the DB-layer definition of "currently a live
-- member" match `lib/workspaces/access.ts`'s `requireWorkspaceAccess`
-- exactly. The API-layer check is deliberately KEPT, not removed as
-- duplication — two independent enforcement layers agreeing is this
-- codebase's established defence-in-depth pattern (migrations 078, 136,
-- 187, 190), not redundancy to eliminate.
CREATE OR REPLACE FUNCTION public.workspace_member_role(p_workspace_id UUID, p_uid UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_uid AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now())
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
      AND (expires_at IS NULL OR expires_at > now())
  )
$$;

-- Restated, not changed: migration 182's grant-back posture. These ARE
-- invoked from RLS policy bodies as the querying role, so they need GRANT
-- EXECUTE TO authenticated; anon has no legitimate workspace access and
-- must never be handed this oracle.
REVOKE EXECUTE ON FUNCTION public.workspace_member_role(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.workspace_member_role(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_workspace_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_workspace_owner(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.workspace_member_role(uuid, uuid) IS
  'Returns uid''s role on the given workspace (owner/admin/member/contractor/guest) among ACTIVE, unexpired memberships only, or NULL otherwise. As of migration 192 (R-11/WSR-17, F12) this definition matches lib/workspaces/access.ts''s requireWorkspaceAccess exactly — both now check expires_at, closing the gap where an expired-but-active-status contractor seat passed RLS while the API refused it. The API-layer check is kept as an independent second enforcement point, not removed as duplication. SECURITY DEFINER so it can be called from workspaces'' and workspace_invitations'' RLS policies without re-entering workspace_members'' own policies (would recurse with 42P17 — migrations 018, 064, 078, 136). Intended for RLS policy USING clauses wrapped as (SELECT ...), not a client-invoked RPC.';

COMMENT ON FUNCTION public.is_workspace_owner(uuid, uuid) IS
  'True when uid holds an ACTIVE, unexpired owner-role membership on the given workspace. As of migration 192 (R-11/WSR-17, F12) this definition matches lib/workspaces/access.ts''s requireWorkspaceAccess exactly — both now check expires_at. The API-layer check is kept as an independent second enforcement point, not removed as duplication. SECURITY DEFINER so it can be called from workspace_members'' and workspace_invitations'' RLS policies without re-entering workspace_members'' own policies (would recurse with 42P17). Intended for RLS policy USING clauses wrapped as (SELECT ...), not a client-invoked RPC.';

-- ─── (c) workspace_project_permission — six hops (R-02/WSR-05, R-04/WSR-06,
--     R-01/WSR-02) ──────────────────────────────────────────────────────
-- Replaces migration 186's four-hop body. The kill-switch conjunct
-- (public.workspace_access_enabled(), D-56/F7 hotfix) is preserved EXACTLY
-- as the first thing this function evaluates — do not disturb it. Hops 1-4
-- are migration 186's own attachment -> membership -> relationship -> grant
-- resolution, kept, with two changes required by migration 191's schema:
--   - the relationship join now requires r.id = a.relationship_id with NO
--     `a.relationship_id IS NULL` alternative — migration 191's NOT NULL on
--     workspace_attachments.relationship_id is what makes dropping that
--     fallback safe, and hop 5 below is what makes dropping it MANDATORY: a
--     NULL there would let this join match ANY accepted relationship in the
--     workspace, and hop 5's custody bind would then resolve against
--     whichever relationship happened to join — a wildcard, not a binding.
--   - the grant join now requires g.relationship_id = r.id with NO
--     `g.relationship_id IS NULL` alternative, for the identical reason,
--     made safe by migration 191's NOT NULL on workspace_grants.
--     relationship_id.
-- Hop 5 (NEW, R-04/WSR-06, F4): JOIN public.vault_projects p ON p.id =
-- a.project_id AND p.user_id = r.member_user_id. This is what binds access
-- to CURRENT custody — access now follows custody automatically, so a
-- transferred project drops out of the previous workspace's reach on the
-- very next read, with no cleanup step and no cron to fail. Recursion-safe
-- per the RECURSION DOCTRINE section above: this is a plain SELECT inside a
-- SECURITY DEFINER body, not a policy re-entry. `idx_vault_projects_user_id`
-- (confirmed present, 38.0.1-PREFLIGHT.md P6) backs this join.
-- Hop 6 (NEW, R-01/WSR-02): AND public.workspace_grant_lineage_live(g.id).
-- A grant whose delegation lineage does not terminate at a live
-- member-consent root, or that has a revoked ancestor anywhere in its
-- chain, confers nothing — re-validated fresh on every call, exactly as
-- lib/workspaces/grant-service.ts's resolveEffectivePermissions re-derives
-- everything on every call with nothing cached (T-38.0.1-09-05).
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
       AND r.id = a.relationship_id
       AND r.state = 'accepted'
       AND (r.effective_from IS NULL OR r.effective_from <= CURRENT_DATE)
       AND (r.terminates_on IS NULL OR r.terminates_on > CURRENT_DATE)
      JOIN public.workspace_grants g
        ON g.workspace_id = a.workspace_id
       AND g.relationship_id = r.id
       AND g.permission = p_permission
       AND g.revoked_at IS NULL
       AND (g.project_id IS NULL OR g.project_id = p_project_id)
      JOIN public.vault_projects p
        ON p.id = a.project_id
       AND p.user_id = r.member_user_id
      WHERE a.project_id = p_project_id
        AND a.detached_at IS NULL
        AND public.workspace_grant_lineage_live(g.id)
    )
$$;

REVOKE EXECUTE ON FUNCTION public.workspace_project_permission(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.workspace_project_permission(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.workspace_project_permission(uuid, uuid, text) IS
  'The single point at which a workspace can reach a Member''s project, v2 (migration 192). Resolves, inside this ONE SECURITY DEFINER function body: hop 1, a live attachment (workspace_attachments), hop 2, an active unexpired membership (workspace_members), hop 3, an accepted in-window roster relationship joined through the attachment''s own relationship_id with NO nullable fallback (workspace_roster_relationships), hop 4, an unrevoked grant on that SAME relationship for the requested permission, with NO nullable fallback (workspace_grants), hop 5, a JOIN to public.vault_projects requiring p.user_id = r.member_user_id -- the custody binding (R-04/WSR-06) that makes access follow current custody automatically, with no cleanup step and no cron, and hop 6, public.workspace_grant_lineage_live(g.id) -- the delegation-lineage re-validation (R-01/WSR-02) that a revoked ancestor or a chain with no live member-consent root confers nothing. Returns FALSE immediately when public.workspace_access_enabled() is FALSE (D-56/WS-31 kill switch, preserved from the F7 hotfix). STABLE, not cached anywhere: every hop is read live on every call, matching lib/workspaces/grant-service.ts''s resolveEffectivePermissions (T-38.0.1-09-05). Returns a boolean about a named permission only -- it never resolves, signs or returns a storage path or URL of any kind (custody D-01/D-09, D-40: no grant may become a shortcut around the existing narrow, asset-class-specific accessors). Intended for RLS policy USING/WITH CHECK clauses wrapped as a scalar subselect (SELECT ...), not a client-invoked RPC.';

-- ─── (d) Schema-cache reload ───────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
