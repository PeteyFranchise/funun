-- ============================================================
-- Funūn — Wave 4 follow-on: Phase 16 GTM Beta Launch & Buyer Portal
-- Migration 083: buyer_shortlists (org-shared saves, D-14c) +
--                 tracks.metadata GIN index (buyer catalog descriptor
--                 filtering, D-16c)
--
-- An executor agent must NEVER run `supabase db push` for this migration.
-- The live push against the remote database is a human-gated checkpoint
-- (mirrors migrations 058/062/063/064/066-070/075/076/078/080/081's "do
-- not push from an executor agent" convention) — the checkpoint task at
-- the end of 16-05-PLAN.md owns the push, `supabase migration list`
-- confirmation, and the adversarial buyer-session checks.
--
-- ─── org-shared shortlists (D-14c) ───────────────────────────────────────
-- A save by ANY member of a buyer org is visible to the WHOLE org (scout
-- saves → approver reviews), so the SELECT policy scopes rows to buyer-org
-- membership, not to created_by. Reuses migration 080's
-- is_buyer_org_member() SECURITY DEFINER helper — buyer_shortlists does
-- not read from itself, so this is not a NEW recursion case, but the
-- helper is the established, already-audited way every buyer-org-scoped
-- policy in this phase resolves org membership (080/081 precedent).
--
-- UNIQUE(org_id, vault_project_id) makes a second member's save of the
-- same project an idempotent no-op at the DB layer (the route upserts with
-- ignoreDuplicates rather than surfacing a raw 23505 to the caller).
--
-- Writes are server-owned (migration 040/056/058 doctrine, reapplied at
-- 080/081): INSERT/UPDATE/DELETE are revoked from authenticated/anon.
-- org_id is derived from the caller's buyer_members row inside the
-- service-role route, never trusted from the request body — a member
-- cannot write into another company's shortlist (T-16-19).
--
-- ─── tracks.metadata GIN index (D-16c) ───────────────────────────────────
-- Plan 16-00's descriptors object (moods/energy/vocal) lives inside
-- tracks.metadata JSONB with no supporting index. The buyer catalog route
-- (16-05 Task 2) filters on it via jsonb containment reads (the same
-- technique Phase 12's people-search open_to filter uses on artist_profiles/
-- user_profiles) — without a GIN index this forces a sequential scan
-- across every track as the catalog grows. Added here, in the same
-- migration as the other net-new buyer-catalog-serving schema, rather than
-- a separate migration.
-- ============================================================

-- ─── (a) buyer_shortlists ────────────────────────────────────────────────
CREATE TABLE public.buyer_shortlists (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID REFERENCES public.buyer_orgs ON DELETE CASCADE NOT NULL,
  vault_project_id UUID REFERENCES public.vault_projects ON DELETE CASCADE NOT NULL,
  created_by       UUID REFERENCES auth.users NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, vault_project_id)
);

CREATE INDEX idx_buyer_shortlists_org_id           ON public.buyer_shortlists (org_id);
CREATE INDEX idx_buyer_shortlists_vault_project_id ON public.buyer_shortlists (vault_project_id);

COMMENT ON TABLE public.buyer_shortlists IS
  'Phase 16 org-shared shortlists (D-14c): a save by any member of a buyer org is visible to the whole org (scout saves, approver reviews). Invisible to artists — no artist-facing surface, no notification, no write path from this feature into any artist-visible table. Server-owned writes; see the REVOKE below. org_id is always derived from the caller''s buyer_members row, never the request body (T-16-19).';

-- ─── (b) RLS — org-scoped SELECT (D-14c) ─────────────────────────────────
ALTER TABLE public.buyer_shortlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buyer_shortlists_select_own_org" ON public.buyer_shortlists
  FOR SELECT TO authenticated
  USING ((SELECT public.is_buyer_org_member(buyer_shortlists.org_id, auth.uid())));

-- ─── (c) Write lockdown — every write is server-owned ────────────────────
-- No INSERT/UPDATE/DELETE policy exists in v1: save/remove goes through
-- POST/DELETE /api/buyer/shortlists (16-05 Task 3) after a membership +
-- rights-ready-authorization check (authorizeRequestTarget, mirroring the
-- catalog route's own gate), never direct PostgREST.
REVOKE INSERT, UPDATE, DELETE ON public.buyer_shortlists FROM authenticated, anon;

-- ─── (d) Column-level SELECT lockdown (migration 040/058/080/081 convention) ─
-- No admin-only column exists on this table (unlike license_requests), but
-- every prior buyer-surface table in this phase applies the explicit
-- REVOKE-then-GRANT allowlist as defense in depth against a future column
-- addition silently becoming client-readable. anon gets nothing — buyer
-- shortlist data is never public (D-05).
REVOKE SELECT ON public.buyer_shortlists FROM authenticated, anon;
GRANT SELECT (id, org_id, vault_project_id, created_by, created_at)
  ON public.buyer_shortlists TO authenticated;

-- ─── (e) tracks.metadata GIN index (D-16c) ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tracks_metadata_gin ON public.tracks USING GIN (metadata);

COMMENT ON INDEX public.idx_tracks_metadata_gin IS
  'Serves buyer catalog descriptor filtering (D-16c mood/energy/vocal jsonb containment reads on tracks.metadata->descriptors, plan 16-05) — without this index the filter forces a sequential scan across every track as the catalog grows.';

-- ─── (f) Schema-cache reload ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
