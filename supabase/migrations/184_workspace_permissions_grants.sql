-- ============================================================
-- Funūn — Phase 38 (member-organization-team-workspaces): Slice C
--                the permission model's storage.
-- Migration 184: public.workspace_grants, public.workspace_permission_bundles,
--                the workspace_grant_visible_to_member SECURITY DEFINER
--                helper, a two-table write lockdown, two non-recursive
--                SELECT policies, and column-level lockdown on
--                workspace_grants' administrative columns.
--
-- HUMAN-GATED — this project never runs `supabase db push`, `supabase db
-- reset`, or `supabase migration up` from an agent. That is the standing
-- convention stated verbatim in the headers of migrations 078, 080, 136,
-- 177, 181, 182 and 183. This file is authored and text-tested
-- (__tests__/migration-184.test.ts) but must not be applied automatically.
-- Owner decision taken during execution (2026-09-05): migrations 183, 184
-- and 185 are BATCHED into a single owner push sitting before Wave 6 — this
-- plan's (38-08) Task 3 blocking checkpoint records what the owner verifies
-- there.
--
-- MIGRATION NUMBERING (Phase 38 planner decision 1, restated from migrations
-- 182 and 183's headers): 182 = plan 38-03 (Slice A foundation; already
-- LIVE). 183 = plan 38-04 (Slice B: roster relationships + agreement
-- evidence + blocks; authored, not yet pushed). 184 (this file) = plan
-- 38-08 (Slice C: grants + bundles). Its siblings: 185 = plan 38-10
-- (attachments + custody transfers), 186 = plan 38-11 (the RLS workspace
-- branch extending project_member_role() and siblings). 187 and 188 remain
-- RESERVED for Phase 38.2's billing and beta-flag migrations and MUST NOT
-- be claimed by any plan in this phase.
--
-- UUID DEFAULTS: every id column below uses gen_random_uuid(), never
-- uuid_generate_v4() — uuid-ossp lives in the `extensions` schema and is
-- not on the migration session's search_path (migration 062's first push
-- attempt failed on exactly that; migrations 078, 136, 182 and 183 all
-- restate the rule; restated again here for the same reason).
--
-- THIS FILE IS ADDITIVE ONLY. It creates two new tables and one new
-- function. It does not create, alter or drop any policy, trigger, function
-- or column on any table that existed before this migration. In particular,
-- public.workspaces, public.workspace_members and public.workspace_members'
-- helper pair (migration 182), and public.workspace_roster_relationships
-- (migration 183) are READ FROM but never altered here. Nothing in
-- public.vault_projects or public.tracks is touched.
--
-- ─── GRANT CARDINALITY (planner decision, resolves 38-RESEARCH.md Open ────
--     Question 1): one row per (workspace_id, relationship_id, project_id,
-- permission). Normalized rather than a JSONB array — this is what makes
-- D-49's subset check a plain set-difference query, makes D-50's
-- per-permission audit natural (a row IS the audited fact), and is directly
-- indexable from inside a STABLE SQL helper. JSONB is used only for
-- workspace_permission_bundles.permissions below, which is UI sugar a
-- workspace may copy and edit and is never itself a security-relevant read
-- path (D-19).
--
-- ─── WHY THE PERMISSION LITERAL LIST IS DUPLICATED HERE (D-42, D-49) ──────
-- Postgres cannot import a TypeScript module, so the complete set of
-- grantable capabilities — WORKSPACE_PERMISSION_VALUES in
-- lib/workspaces/permissions.ts — is restated below as a literal CHECK
-- list. The database is the enforcement point that must hold even if every
-- application-layer check above it is someday bypassed or buggy, so this
-- duplication is required, not incidental. __tests__/migration-184.test.ts
-- builds the expected CHECK clause by joining the imported array and
-- asserts it appears verbatim in this file, so a TypeScript-side addition
-- or rename without a matching SQL change fails the suite instead of
-- drifting silently into production (38-RESEARCH.md Pitfall 3).
-- ============================================================

-- ─── (a) public.workspace_grants — one row per granted permission ────────
-- relationship_id is nullable: a grant with relationship_id NULL applies
-- workspace-wide (not yet tied to one roster relationship); project_id is
-- nullable: NULL means the grant applies across the whole relationship,
-- non-null narrows OR widens it for exactly one project (D-20). source
-- distinguishes an individually-ticked permission from one issued as part
-- of a bundle — high-sensitivity permissions are always 'individual'
-- because D-40 forbids them from ever appearing in a bundle in the first
-- place.
CREATE TABLE public.workspace_grants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
  relationship_id UUID REFERENCES public.workspace_roster_relationships ON DELETE CASCADE,
  project_id      UUID REFERENCES public.vault_projects ON DELETE CASCADE,
  -- The complete set of capabilities this system can express. Payout
  -- capabilities and tax-information capabilities are deliberately absent
  -- from this list — not a value defaulting to false, but a name this
  -- column can never hold. No future feature can reach either capability
  -- through this table without a new migration a reviewer would see and
  -- have to justify against D-42 explicitly (T-38-08-01).
  permission      TEXT NOT NULL
                  CHECK (permission IN ('view_summaries', 'view_metadata', 'edit_metadata', 'access_writers_room', 'upload_audio', 'download_protected_audio', 'access_clean_masters', 'invite_collaborators', 'view_split_sheets', 'view_contracts', 'upload_contracts', 'request_signatures', 'view_private_rights_identifiers', 'edit_rights_information', 'manage_registrations', 'approve_releases', 'deliver_assets', 'view_earnings', 'act_on_behalf')),
  source          TEXT NOT NULL DEFAULT 'individual'
                  CHECK (source IN ('bundle', 'individual')),
  granted_by      UUID NOT NULL REFERENCES auth.users,
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID REFERENCES auth.users,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.workspace_grants IS
  'One row per granted permission (planner decision: normalized, not a JSONB set — makes D-49''s subset check a set-difference query and D-50''s per-permission audit natural). The permission CHECK list above is the COMPLETE set of capabilities this system can express. Payout-processing capabilities and tax-information capabilities are deliberately outside that list — structurally excluded (D-42), not a permission defaulting to false. No future feature can reach either capability without a new migration adding it to this CHECK list, which a reviewer would see.';

-- Load-bearing for migration 186's per-row helper (38-RESEARCH.md Pattern 2
-- caveat): because the project id argument varies per row, the helper
-- cannot be hoisted to a single per-statement InitPlan the way a
-- zero-argument or uid-only helper can — each invocation must resolve as an
-- index-only lookup against these indexes rather than a sequential scan, or
-- migration 186's project-row read path pays a full scan on every request.
--
-- UNIQUE with NULLS NOT DISTINCT so two live grant rows that both have a
-- NULL project_id (a relationship-wide grant) correctly collide as the same
-- grant, rather than Postgres treating every NULL as distinct and silently
-- allowing duplicate relationship-wide grants for the same permission.
CREATE UNIQUE INDEX idx_workspace_grants_unique_live
  ON public.workspace_grants (workspace_id, relationship_id, project_id, permission) NULLS NOT DISTINCT
  WHERE revoked_at IS NULL;

-- The covering index migration 186's hot path depends on (38-RESEARCH.md
-- Pattern 2 caveat, restated above) — an index-only lookup keyed exactly on
-- the three columns that helper's WHERE clause filters on.
CREATE INDEX idx_workspace_grants_covering
  ON public.workspace_grants (workspace_id, permission, project_id)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_workspace_grants_relationship
  ON public.workspace_grants (relationship_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.workspace_grants ENABLE ROW LEVEL SECURITY;

-- ─── (b) public.workspace_permission_bundles — editable preset bundles ────
-- workspace_id NULL means a system preset available to every workspace
-- (seeded below); non-null means a workspace has copied and customized one.
-- Bundles are DATA, never the authorization source — nothing anywhere keys
-- behavior off a bundle key or a workspace role name (D-19). Issuing a
-- grant always re-runs the D-49 subset/tier checks against the individual
-- permissions a bundle names; the bundle row itself never bypasses them.
CREATE TABLE public.workspace_permission_bundles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces ON DELETE CASCADE,
  key          TEXT NOT NULL,
  label        TEXT NOT NULL,
  permissions  JSONB NOT NULL DEFAULT '[]',
  is_system    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by   UUID REFERENCES auth.users,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_workspace_permission_bundles_workspace_key
  ON public.workspace_permission_bundles (workspace_id, key)
  WHERE workspace_id IS NOT NULL;

CREATE UNIQUE INDEX idx_workspace_permission_bundles_system_key
  ON public.workspace_permission_bundles (key)
  WHERE workspace_id IS NULL;

ALTER TABLE public.workspace_permission_bundles ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS workspace_permission_bundles_updated_at ON public.workspace_permission_bundles;
CREATE TRIGGER workspace_permission_bundles_updated_at
  BEFORE UPDATE ON public.workspace_permission_bundles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Four editable system presets, seeded once and never re-seeded on a
-- retried migration (ON CONFLICT DO NOTHING against the partial unique
-- index above). Each permissions array is exactly the list
-- lib/workspaces/permissions.ts's WORKSPACE_PERMISSION_BUNDLES exports for
-- that key — __tests__/migration-184.test.ts asserts this equality per
-- bundle rather than spot-checking one, and separately asserts none of the
-- four names a bundle-excluded permission (D-40, T-38-08-02). Nothing keys
-- behavior off these key strings or these label strings anywhere in the
-- application — bundles are data a workspace may copy and edit (D-19).
INSERT INTO public.workspace_permission_bundles (workspace_id, key, label, permissions, is_system)
VALUES
  (
    NULL, 'read_only', 'Read Only',
    '["view_summaries", "view_metadata", "view_split_sheets", "view_contracts"]'::jsonb,
    TRUE
  ),
  (
    NULL, 'day_to_day', 'Day to Day',
    '["view_summaries", "view_metadata", "view_split_sheets", "view_contracts", "edit_metadata", "access_writers_room", "upload_audio", "download_protected_audio", "invite_collaborators", "manage_registrations"]'::jsonb,
    TRUE
  ),
  (
    NULL, 'full_operational', 'Full Operational',
    '["view_summaries", "view_metadata", "view_split_sheets", "view_contracts", "edit_metadata", "access_writers_room", "upload_audio", "download_protected_audio", "invite_collaborators", "manage_registrations", "upload_contracts"]'::jsonb,
    TRUE
  ),
  (
    NULL, 'operational_plus_authority', 'Operational + Authority',
    '["view_summaries", "view_metadata", "view_split_sheets", "view_contracts", "edit_metadata", "access_writers_room", "upload_audio", "download_protected_audio", "invite_collaborators", "manage_registrations", "upload_contracts", "request_signatures", "edit_rights_information", "approve_releases", "deliver_assets", "act_on_behalf"]'::jsonb,
    TRUE
  )
ON CONFLICT (key) WHERE workspace_id IS NULL DO NOTHING;

-- ─── (c) Write lockdown — no client PostgREST write path on either table ──
--         (078 section (b) / 136 / 182 section (e) / 183 section (d)'s
--         posture, restated here). Every write — issuing, narrowing,
--         revoking a grant, or editing a bundle — goes through a
--         service-role API route that has already proved caller authority
--         (plan 38-09) (T-38-08-05).
REVOKE INSERT, UPDATE, DELETE ON public.workspace_grants FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.workspace_permission_bundles FROM authenticated, anon;

-- ─── (d) SECURITY DEFINER helper + own-table SELECT policies ──────────────
-- workspace_grants has no member-identity column of its own — the member a
-- grant concerns is reached only through relationship_id. Routed through
-- SECURITY DEFINER rather than inlined as a bare cross-table EXISTS inside
-- a policy body, avoiding the same 018-shaped recursion migrations 182 and
-- 183's own helper pairs exist to prevent (T-38-08-07). Copies migration
-- 183's workspace_agreement_evidence_visible() shape exactly.
CREATE OR REPLACE FUNCTION public.workspace_grant_visible_to_member(p_grant_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_grants g
    JOIN public.workspace_roster_relationships r ON r.id = g.relationship_id
    WHERE g.id = p_grant_id
      AND r.member_user_id = p_uid
  )
$$;

REVOKE EXECUTE ON FUNCTION public.workspace_grant_visible_to_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.workspace_grant_visible_to_member(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.workspace_grant_visible_to_member(uuid, uuid) IS
  'True when p_uid is the Member named on the roster relationship a grant is attached to (via relationship_id). A Member must be able to see exactly which permissions a workspace holds over them -- that transparency is what makes delegated access trustworthy (D-50). workspace_grants carries no member-identity column of its own, so this predicate joins through relationship_id inside a SECURITY DEFINER body rather than a bare cross-table EXISTS in a policy, avoiding the 42P17 recursion shape (migrations 018, 064, 078, 136, 182, 183). Intended for RLS policy USING clauses wrapped as (SELECT ...), not a client-invoked RPC.';

-- Any active member of the grant's own workspace sees every grant issued in
-- that workspace (they administer it); the Member on the other side of the
-- grant's relationship also sees it, even if they hold no seat on the
-- workspace itself (D-50).
CREATE POLICY "workspace_grants_select" ON public.workspace_grants
  FOR SELECT TO authenticated
  USING (
    (SELECT public.workspace_member_role(workspace_id, auth.uid())) IS NOT NULL
    OR (SELECT public.workspace_grant_visible_to_member(id, auth.uid()))
  );

-- System presets (workspace_id IS NULL) are readable by every authenticated
-- caller so any workspace can browse and copy them; a workspace's own
-- customized bundle is readable only by that workspace's active members.
CREATE POLICY "workspace_permission_bundles_select" ON public.workspace_permission_bundles
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NULL
    OR (SELECT public.workspace_member_role(workspace_id, auth.uid())) IS NOT NULL
  );

-- ─── (e) Column-level SELECT lockdown (migration 080 §(g) convention) ─────
-- Row RLS restricts which ROWS a caller sees; it says nothing about which
-- COLUMNS. REVOKE-then-GRANT an explicit allowlist so a session client
-- cannot read administrative columns via direct PostgREST even on rows it
-- is otherwise permitted to see. granted_by and revoked_by are withheld
-- from authenticated — who issued or revoked a grant is administrative
-- metadata that the both-sides audit log (D-50) already carries with
-- proper visibility to both the workspace and the affected Member
-- (T-38-08-06, accepted risk: the same facts remain available through that
-- intended disclosure surface).
REVOKE SELECT ON public.workspace_grants FROM authenticated, anon;
GRANT SELECT (id, workspace_id, relationship_id, project_id, permission, source, granted_at, revoked_at, created_at)
  ON public.workspace_grants TO authenticated;

-- ─── (f) Schema-cache reload ───────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
