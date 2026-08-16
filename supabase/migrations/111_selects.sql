-- ============================================================
-- Funūn — Phase 31 Slice 1 (AE Client Workspace + Selects)
-- Migration 111: the Selects domain
--
-- WHY: every Slice-1 API/UI/player plan reads and writes these tables.
-- A Selects is the AE-built, client-co-edited shortlist that replaces an
-- email of MP3 links (31-CONTEXT.md, crate-lead-engine-BUILD-SPEC.md §2):
-- an AE assembles it from The Crate (rights-ready catalogue), sends it, and
-- from then on both the AE and the client can add/remove tracks with
-- attribution until the client narrows to a final pick.
--
-- WHAT: four tables —
--   1. selects — the shortlist itself. buyer_org_id (the client) + created_by
--      (the AE) is the same dual-attribution shape as buyer_briefs (106);
--      brief_id optionally threads it back to the Brief Builder brief it
--      grew out of. share_token is the SOLE authorization for the public,
--      unauthenticated /selects/[token] player (31-13) — cryptographically
--      random via gen_random_bytes(16), never a sequential/guessable id
--      (T-31-03). download_enabled/download_max_seconds are the D-02
--      per-Selects download gate the AE sets at send time.
--   2. selects_tracks — the co-edited line items. track_id is a NOT NULL
--      UUID FK straight to public.tracks(id) ON DELETE CASCADE, matching
--      migration 096's sync_listings.track_id convention EXACTLY (Pitfall
--      3 — NOT a generic text ref) so rights-ready status can always be
--      re-evaluated at read time via lib/deals/catalog.ts. source
--      distinguishes crate-sourced from AI-suggested adds (co-edit
--      provenance); removed_at/removed_by is a soft-remove for the
--      Removed tray, never a hard delete of co-edit history.
--   3. selects_reactions — per-track buyer feedback (love/pass/more_like_
--      this). reacted_by is NULL for a guest viewer; viewer_key carries
--      session/link attribution for that guest case. Two partial unique
--      indexes enforce one reaction per (authenticated reactor, track) and
--      one per (guest viewer_key, track) without colliding on NULLs.
--   4. selects_saved_searches — D-12: an AE's saved Crate filter presets,
--      optionally team-shared.
--
-- SECURITY POSTURE (T-31-02/T-31-03/T-31-04, mirrors migration 089's
-- zero-RLS-policy shape + migration 106's buyer-readable-arm shape):
-- selects_tracks and selects_saved_searches are staff-only — RLS enabled,
-- ZERO policies, full REVOKE from authenticated/anon — reachable only via
-- a requireStaff-gated service-role route; the public token player also
-- reads via the service role (bearing the share_token, not RLS). selects
-- and selects_reactions get ONE additional buyer-readable arm: a buyer-org
-- member may SELECT a selects row once it has left draft (status IN sent/
-- approved/changes_requested — drafts are never buyer-visible) via the
-- existing public.is_buyer_org_member() helper (migration 080), and may
-- INSERT/SELECT only their OWN reaction rows. No ae_user_id or routing
-- internal is added to any authenticated GRANT (T-31-04).
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (matches Phases 16/21/25/28/32's standing convention). Draft + text-
-- tested only (__tests__/migration-111.test.ts); the owner reviews and
-- pushes via `supabase db push` at the 31-02 Task 3 checkpoint. Do NOT
-- edit migrations 001-110 (already landed).
-- ============================================================

-- ─── (a) selects ────────────────────────────────────────────────────────
CREATE TABLE public.selects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_org_id        UUID NOT NULL REFERENCES public.buyer_orgs ON DELETE CASCADE,
  created_by          UUID NOT NULL REFERENCES auth.users,
  brief_id            UUID REFERENCES public.buyer_briefs ON DELETE SET NULL,
  name                TEXT NOT NULL,
  cover_note          TEXT,
  share_token         TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                        'draft', 'sent', 'approved', 'changes_requested'
                      )),
  download_enabled    BOOLEAN NOT NULL DEFAULT true,
  download_max_seconds INT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at             TIMESTAMPTZ
);

CREATE INDEX idx_selects_buyer_org_created ON public.selects (buyer_org_id, created_at DESC);
CREATE INDEX idx_selects_share_token ON public.selects (share_token);

DROP TRIGGER IF EXISTS selects_updated_at ON public.selects;
CREATE TRIGGER selects_updated_at
  BEFORE UPDATE ON public.selects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.selects IS
  'Phase 31 Slice 1: an AE-built, client-co-edited shortlist (the "Selects"), the outbound artifact of the AE pipeline funnel. Dual attribution (buyer_org_id + created_by), same shape as buyer_briefs (106). share_token is the SOLE authorization for the public, unauthenticated /selects/[token] player (31-13) — cryptographically random via gen_random_bytes(16), never a sequential id (T-31-03). download_enabled/download_max_seconds are the D-02 per-Selects download gate the AE sets at send time.';

COMMENT ON COLUMN public.selects.share_token IS
  'Unguessable UNIQUE token (gen_random_bytes(16) hex) — the only way an unauthenticated viewer reaches this Selects. Never derive a share URL from selects.id.';

-- ─── (b) selects_tracks ─────────────────────────────────────────────────
CREATE TABLE public.selects_tracks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selects_id  UUID NOT NULL REFERENCES public.selects ON DELETE CASCADE,
  track_id    UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  note        TEXT,
  position    INT NOT NULL DEFAULT 0,
  added_by    UUID REFERENCES auth.users,
  source      TEXT NOT NULL DEFAULT 'crate' CHECK (source IN ('crate', 'suggested')),
  removed_at  TIMESTAMPTZ,
  removed_by  UUID REFERENCES auth.users,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_selects_tracks_selects_position ON public.selects_tracks (selects_id, position);

COMMENT ON TABLE public.selects_tracks IS
  'Co-edited line items of a Selects. track_id references public.tracks(id) — matches migration 096''s sync_listings.track_id convention EXACTLY (Pitfall 3), never a generic text ref, so rights-ready status is always re-evaluated at read time (lib/deals/catalog.ts). source is co-edit provenance (crate vs AI-suggested); removed_at/removed_by is a soft-remove for the Removed tray, never a hard delete of co-edit history.';

-- ─── (c) selects_reactions ──────────────────────────────────────────────
CREATE TABLE public.selects_reactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selects_track_id  UUID NOT NULL REFERENCES public.selects_tracks ON DELETE CASCADE,
  reacted_by        UUID REFERENCES auth.users,
  viewer_key        TEXT,
  reaction          TEXT NOT NULL CHECK (reaction IN ('love', 'pass', 'more_like_this')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One reaction per authenticated reactor per track.
CREATE UNIQUE INDEX selects_reactions_reactor_track_uniq
  ON public.selects_reactions (selects_track_id, reacted_by)
  WHERE reacted_by IS NOT NULL;

-- One reaction per guest viewer_key per track (link-based guest attribution).
CREATE UNIQUE INDEX selects_reactions_viewer_track_uniq
  ON public.selects_reactions (selects_track_id, viewer_key)
  WHERE reacted_by IS NULL AND viewer_key IS NOT NULL;

COMMENT ON TABLE public.selects_reactions IS
  'Per-track buyer feedback (love/pass/more_like_this). reacted_by is NULL for a guest viewer; viewer_key carries session/link attribution for that guest case (31-CONTEXT.md guest-lead identification — consent-first, never fingerprinting). Two partial unique indexes enforce one reaction per (reactor, track) without colliding on NULLs.';

-- ─── (d) selects_saved_searches (D-12) ───────────────────────────────────
CREATE TABLE public.selects_saved_searches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by     UUID NOT NULL REFERENCES auth.users,
  name           TEXT NOT NULL,
  filters        JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_team_shared BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.selects_saved_searches IS
  'D-12: an AE''s saved Crate filter preset, optionally team-shared (is_team_shared). Staff-only.';

-- ─── (e) RLS — enable on all four ────────────────────────────────────────
ALTER TABLE public.selects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selects_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selects_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selects_saved_searches ENABLE ROW LEVEL SECURITY;

-- selects_tracks / selects_saved_searches: ZERO policies (mirrors migration
-- 089's funun_staff/staff_audit_log shape) — an RLS-enabled table with no
-- policies denies ALL row access to authenticated/anon by construction.
-- Reachable only via the service role (requireStaff-gated routes; the
-- public token player also reads selects_tracks via the service role).

-- ─── (f) selects — the one buyer-readable arm ────────────────────────────
-- A buyer-org member may see their org's Selects once it has left draft.
-- Drafts are never buyer-visible (T-31-02). Mirrors migration 106's
-- buyer_briefs_select_own_org shape exactly, reusing the migration 080
-- SECURITY DEFINER helper — no self-referential recursion (the policy
-- reads that helper + selects' own columns, never selects via a subquery).
CREATE POLICY "selects_select_buyer_sent" ON public.selects
  FOR SELECT TO authenticated
  USING (
    status IN ('sent', 'approved', 'changes_requested')
    AND (SELECT public.is_buyer_org_member(selects.buyer_org_id, auth.uid()))
  );

-- ─── (g) selects_reactions — buyer writes/reads only their own reaction ──
-- Scoped through selects_tracks -> selects so a buyer can only react to a
-- track that belongs to a non-draft Selects for their own org; reacted_by
-- must equal the caller (never impersonate another reactor).
CREATE POLICY "selects_reactions_select_own" ON public.selects_reactions
  FOR SELECT TO authenticated
  USING (
    reacted_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.selects_tracks st
      JOIN public.selects s ON s.id = st.selects_id
      WHERE st.id = selects_reactions.selects_track_id
        AND s.status IN ('sent', 'approved', 'changes_requested')
        AND (SELECT public.is_buyer_org_member(s.buyer_org_id, auth.uid()))
    )
  );

CREATE POLICY "selects_reactions_insert_own" ON public.selects_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    reacted_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.selects_tracks st
      JOIN public.selects s ON s.id = st.selects_id
      WHERE st.id = selects_reactions.selects_track_id
        AND s.status IN ('sent', 'approved', 'changes_requested')
        AND (SELECT public.is_buyer_org_member(s.buyer_org_id, auth.uid()))
    )
  );

-- ─── (h) Write lockdown — every non-buyer write is server-owned ─────────
-- selects: no client INSERT/UPDATE/DELETE path — Selects creation, track
-- add/remove/reorder, status transitions, and the share-token mint all go
-- through validated service-role routes (requireStaff for the AE side).
REVOKE INSERT, UPDATE, DELETE ON public.selects FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.selects_tracks FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.selects_saved_searches FROM authenticated, anon;

-- selects_reactions: UPDATE/DELETE stay server-owned (no edit/undo of a
-- submitted reaction in v1); INSERT/SELECT are the buyer arm above.
REVOKE UPDATE, DELETE ON public.selects_reactions FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.selects_reactions FROM anon;

-- ─── (i) Column-level SELECT lockdown on selects (migration 040/058/080/
--         106 convention) — RLS restricts ROWS, this restricts COLUMNS.
--         created_by (the AE) is a staff-internal identity and is
--         deliberately withheld from the buyer-readable arm (T-31-04).
REVOKE SELECT ON public.selects FROM authenticated, anon;
GRANT SELECT (
  id, buyer_org_id, brief_id, name, cover_note, share_token, status,
  download_enabled, download_max_seconds, created_at, updated_at, sent_at
) ON public.selects TO authenticated;

REVOKE SELECT ON public.selects_reactions FROM authenticated;
GRANT SELECT (id, selects_track_id, reacted_by, viewer_key, reaction, created_at)
  ON public.selects_reactions TO authenticated;

-- ─── (j) Schema-cache reload ─────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
