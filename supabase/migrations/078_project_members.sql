-- ============================================================
-- Funūn — Wave 4: Cross-Account Collaboration & Split-Sheet ↔ Project Sync
-- Migration 078: project_members guest-list table + RLS rewrite from
--                "you own it" to "you own it OR you're on its guest list"
--                on vault_projects and its four child tables.
--
-- An executor agent must NEVER run `supabase db push` for this migration.
-- The live push against the remote database is a human-gated checkpoint
-- (mirrors migrations 058/062/063/066/067/068/069/070's "do not push from
-- an executor agent" convention). This file is authored and tested
-- (string-assertion test in __tests__/migration-078.test.ts) but must not
-- be applied automatically.
--
-- MIGRATION NUMBERING: this is 078, not 077. `077_drop_artist_profiles_
-- compat_view.sql` was authored for Phase 20, then deliberately removed
-- from the repo (commit 1e497d0, 2026-07-25) so a plain `supabase db push`
-- would not apply it before migration 076's zero-downtime soak completes;
-- it is queued to be re-added verbatim at Phase 20's own push checkpoint.
-- 077 is RESERVED, not free, even though it currently looks free by a
-- naive `ls supabase/migrations/`. 079 is reserved for Phase 21's own
-- follow-up (the auto-membership trigger, 21-02). This migration's own
-- push MUST be sequenced strictly AFTER Phase 20's 076/077 are confirmed
-- live (`supabase migration list` LOCAL=REMOTE through 077) — both because
-- ROADMAP.md already declares this dependency and because stacking two
-- independent human-gated schema soaks at once multiplies operational
-- risk for no benefit (21-RESEARCH.md Pitfall 6).
--
-- UUID DEFAULTS: project_members.id uses gen_random_uuid(), NOT
-- uuid_generate_v4() — uuid-ossp lives in the `extensions` schema and is
-- not on the migration session's search_path (see migration 062's header
-- for the first push failure this caused).
--
-- ─── THE PROBLEM THIS MIGRATION SOLVES ───────────────────────────────────
-- project_members and vault_projects are the same SHAPE of relationship
-- migration 064 already fixed once for split_sheets ↔ split_sheet_parties:
-- two tables whose row-visibility rules each need to read the other.
-- vault_projects' RLS must know whether the caller is a project_members
-- row (to widen visibility), and project_members' own RLS must know
-- whether the caller owns the project (to see the full guest list). A
-- naive pair of cross-table `EXISTS (SELECT 1 FROM other_table ...)`
-- policies would recurse at REWRITE time with 42P17, exactly as migration
-- 018 did — breaking every authenticated read AND the readiness trigger
-- (which transitively reads vault_projects via calculate_vault_readiness()).
-- This migration ships the SECURITY DEFINER helper-pair fix from day one
-- (Pattern 1, 21-RESEARCH.md / 21-PATTERNS.md) rather than discovering the
-- recursion in production and patching it later as migration 064 had to.
--
-- ─── THE SECOND, MORE CONSEQUENTIAL PROBLEM ──────────────────────────────
-- tracks / vault_assets / vault_documents / tool_outputs each carry their
-- OWN user_id column (the row's creator) and migration 001 keyed both their
-- RLS AND every API mutation route's ownership check to that column, never
-- to the parent project's owner. Today row.user_id always equals
-- vault_projects.user_id because only the owner has ever written these
-- rows. The instant a second writer (an editor) exists, that conflation
-- breaks visibility both directions: the owner cannot see rows an editor
-- wrote under their own user_id, and the editor cannot see the owner's
-- pre-existing rows. Section (f) below rewrites all four child tables to
-- resolve access through project_id via the SAME is_project_owner /
-- project_member_role helpers used on vault_projects — never the row's own
-- user_id (21-RESEARCH.md Pitfall 1, the single most important correction
-- in this phase).
-- ============================================================

-- ─── (a) project_members table ───────────────────────────────────────────
-- user_id references auth.users directly, matching every other ownership
-- FK in this schema (vault_projects.user_id, collaborators.user_id,
-- split_sheet_parties.user_id all reference auth.users, never
-- artist_profiles/user_profiles — 21-RESEARCH.md Assumption A4).
CREATE TABLE public.project_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.vault_projects ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('owner', 'co-owner', 'editor', 'viewer')),
  added_by   UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX idx_project_members_project_id ON public.project_members (project_id);
CREATE INDEX idx_project_members_user_id    ON public.project_members (user_id);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- ─── (b) Guest-list write lockdown ────────────────────────────────────────
-- Mirrors capability_grants' doctrine (migration 042): no client PostgREST
-- write path exists in v1. The only membership writers are this
-- migration's owner backfill (g) and Plan 21-02's SECURITY DEFINER
-- auto-membership trigger. Guest-list management API (add/remove/promote
-- via a service-role route) is a documented deferral — see 21-01-PLAN.md
-- "Planner decisions" #2.
REVOKE INSERT, UPDATE, DELETE ON public.project_members FROM authenticated, anon;

-- ─── (c) SECURITY DEFINER helper pair ─────────────────────────────────────
-- Copies migration 064's proven shape exactly. Takes the user id as a
-- parameter rather than calling auth.uid() internally so SET search_path =
-- '' does not have to reach into the auth schema (same shape as no_block()
-- in migration 035 and is_split_sheet_initiator/is_split_sheet_party in
-- migration 064). STABLE lets the planner cache the result within a single
-- statement when the policy wraps the call as (SELECT ...).
CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vault_projects
    WHERE id = p_project_id AND user_id = p_uid
  )
$$;

CREATE OR REPLACE FUNCTION public.project_member_role(p_project_id UUID, p_uid UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.project_members
  WHERE project_id = p_project_id AND user_id = p_uid
$$;

-- These two helpers ARE invoked from RLS policy bodies as the querying
-- role (unlike calculate_vault_readiness(), which is trigger-internal
-- only) so they need GRANT EXECUTE TO authenticated — follow migration
-- 064's grant, not 070's revoke-only, for these two specifically. anon has
-- no legitimate vault access and must not get a SECURITY DEFINER oracle
-- for "does user X own/have a role on project Y".
REVOKE EXECUTE ON FUNCTION public.is_project_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_project_owner(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.project_member_role(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.project_member_role(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.is_project_owner(uuid, uuid) IS
  'True when uid owns the given vault project. SECURITY DEFINER so it can be called from project_members'' RLS policy without re-entering vault_projects'' own policies (would recurse — see migration 064''s precedent, reapplied here in migration 078). Intended for RLS policy USING clauses wrapped as (SELECT ...), not a client-invoked RPC.';

COMMENT ON FUNCTION public.project_member_role(uuid, uuid) IS
  'Returns uid''s role on the given project (owner/co-owner/editor/viewer), or NULL if not a member. SECURITY DEFINER so it can be called from vault_projects'' and the child tables'' RLS policies without re-entering project_members'' own policies (would recurse). Intended for RLS policy USING clauses wrapped as (SELECT ...), not a client-invoked RPC.';

-- ─── (d) project_members own SELECT policy ────────────────────────────────
-- Least-privilege per 21-RESEARCH.md Open Question 2: an editor/viewer
-- sees only their own row (enough to render "You're a viewer" — the
-- project OWNER's name is already resolvable via vault_projects.user_id).
-- Owner and co-owner see the full guest list (they manage it).
CREATE POLICY "project_members_select" ON public.project_members
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) = 'co-owner'
  );

-- ─── (e) vault_projects: split the single combined policy into ───────────
--         four per-operation policies (SELECT widens; INSERT/DELETE stay
--         owner-only; UPDATE widens to co-owner/editor).
-- "Public vault projects discoverable" (is_public = true) is untouched —
-- it is orthogonal to ownership/membership.
DROP POLICY IF EXISTS "Artists manage own vault projects" ON public.vault_projects;

CREATE POLICY "vault_projects_select_owner_or_member" ON public.vault_projects
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (SELECT public.project_member_role(id, auth.uid())) IS NOT NULL
  );

CREATE POLICY "vault_projects_update_owner_or_editor" ON public.vault_projects
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (SELECT public.project_member_role(id, auth.uid())) IN ('co-owner', 'editor')
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR (SELECT public.project_member_role(id, auth.uid())) IN ('co-owner', 'editor')
  );

CREATE POLICY "vault_projects_insert_own" ON public.vault_projects
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "vault_projects_delete_owner_only" ON public.vault_projects
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ─── (f) Child-table rewrite: tracks, vault_assets, vault_documents, ─────
--         tool_outputs (21-RESEARCH.md Pattern 2 / Pitfall 1). Access
--         resolves through project_id via the SAME helpers used above —
--         never the row's own user_id.

-- tracks (project_id NOT NULL — no nullable fallback needed).
DROP POLICY IF EXISTS "Artists manage own tracks" ON public.tracks;

CREATE POLICY "tracks_select_project_owner_or_member" ON public.tracks
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IS NOT NULL
  );

CREATE POLICY "tracks_write_project_owner_or_editor" ON public.tracks
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
  )
  WITH CHECK (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
  );

-- vault_assets (project_id NOT NULL — no nullable fallback needed).
DROP POLICY IF EXISTS "Artists manage own assets" ON public.vault_assets;

CREATE POLICY "vault_assets_select_project_owner_or_member" ON public.vault_assets
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IS NOT NULL
  );

CREATE POLICY "vault_assets_write_project_owner_or_editor" ON public.vault_assets
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
  )
  WITH CHECK (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
  );

-- vault_documents (project_id NULLABLE — migration 001 line 168 has no NOT
-- NULL constraint). Add the standalone/unattached-row fallback to BOTH
-- policies so an owner's pre-existing unattached documents stay reachable.
DROP POLICY IF EXISTS "Artists manage own documents" ON public.vault_documents;

CREATE POLICY "vault_documents_select_project_owner_or_member" ON public.vault_documents
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IS NOT NULL
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
  );

CREATE POLICY "vault_documents_write_project_owner_or_editor" ON public.vault_documents
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
  );

-- tool_outputs (project_id NULLABLE, ON DELETE SET NULL — migration 001
-- line 191). Same nullable fallback as vault_documents above.
DROP POLICY IF EXISTS "Artists manage own outputs" ON public.tool_outputs;

CREATE POLICY "tool_outputs_select_project_owner_or_member" ON public.tool_outputs
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IS NOT NULL
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
  );

CREATE POLICY "tool_outputs_write_project_owner_or_editor" ON public.tool_outputs
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
    OR (project_id IS NULL AND user_id = (SELECT auth.uid()))
  );

-- ─── (g) Owner-membership backfill ─────────────────────────────────────
-- Every pre-existing vault_projects row gets an 'owner' project_members
-- row so "you own it OR you're on its guest list" is true for every
-- current owner from the moment this migration lands — no existing owner
-- loses access, and 21-RLS-SMOKE-CHECKLIST.md's backfill check has
-- something to verify against. ON CONFLICT DO NOTHING makes this
-- idempotent against a retried/partial migration run.
INSERT INTO public.project_members (project_id, user_id, role, added_by)
SELECT id, user_id, 'owner', user_id
FROM public.vault_projects
ON CONFLICT (project_id, user_id) DO NOTHING;

-- ─── (h) Readiness trigger — confirmed already hardened ──────────────────
-- calculate_vault_readiness() is SECURITY DEFINER SET search_path = '' as
-- of migration 070 (21-RESEARCH.md Pitfall 3 — already mitigated for the
-- score-recompute step itself; NOT redefined here). What THIS migration
-- adds is the missing other half: section (e)'s widened vault_projects
-- UPDATE policy (owner OR co-owner/editor) is what lets an editor's child
-- write's readiness recompute actually succeed — 070's DEFINER fix alone
-- only protects the trigger's own internal UPDATE, not the editor's
-- original tracks/vault_assets/vault_documents/tool_outputs INSERT
-- succeeding under the child-table policies in (f) above.

-- ─── (i) Schema-cache reload ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
