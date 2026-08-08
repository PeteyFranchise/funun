-- ============================================================
-- Funūn — Phase 26: Sync-Library Inclusion & Artist Submission
-- Migration 096: sync_listings table + capability_grants extension +
--                 vault_documents.type widening
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (matches Phases 16/21/25/28's standing convention). Draft + text-tested
-- only; the owner reviews and pushes via Codex (see 26-01-PLAN.md Task 2).
-- Run via: supabase db push
-- ============================================================

-- Replaces the `isRightsReady` / `is_public + readiness` placeholder
-- (lib/deals/catalog.ts) with a real per-SONG admission state machine.
-- SONG-LEVEL per 26-CONTEXT.md "Resolves OQ#2 (granularity) + OQ#1 (data
-- model)": a buyer licenses one song at a time, so the individual track —
-- not the vault_project — is the listing's unit. Submission is batched
-- (an artist may submit 1 song, several, or a whole release) but each
-- song is reviewed and admitted individually via its own row here.
--
-- Two entry paths converge on the same state machine (26-CONTEXT.md
-- "Two entry paths into the sync library"): an admin-invited artist and a
-- self-applying artist both land in `applied`/`invited` and pass through
-- the SAME staff admit/reject gate (owner reversed the earlier
-- "invited skips review" default — see UI-phase decision #2). The
-- `entry_source` column is metadata for the curation queue, not a
-- different flow gate.

-- ─── (a) sync_listings ────────────────────────────────────────────────
CREATE TABLE sync_listings (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vault_project_id            UUID NOT NULL REFERENCES vault_projects(id) ON DELETE CASCADE,
  track_id                    UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  artist_user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status                      TEXT NOT NULL DEFAULT 'applied' CHECK (status IN (
    'applied', 'invited', 'agreement_pending', 'pending_admit',
    'admitted', 'rejected', 'withdrawn', 'removed'
  )),
  entry_source                TEXT NOT NULL CHECK (entry_source IN ('admin_invited', 'self_applied')),
  blanket_agreement_document_id UUID REFERENCES vault_documents(id) ON DELETE SET NULL,
  rejection_reason            TEXT,
  removal_reason               TEXT,
  applied_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at                  TIMESTAMPTZ,
  decided_by                  UUID REFERENCES auth.users(id),
  admitted_at                 TIMESTAMPTZ,
  withdrawn_at                TIMESTAMPTZ,
  removed_at                  TIMESTAMPTZ,
  removed_by                  UUID REFERENCES auth.users(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE sync_listings IS
  'Per-song sync-library admission state machine (Phase 26, SONG-LEVEL per 26-CONTEXT.md). rejection_reason: optional staff reason shown to the artist on a rejected row (UI-phase decision #1). removal_reason: optional leadership takedown reason on an already-admitted song (26-CONTEXT.md "Staff removal / takedown" — a distinct action from the artist''s own withdrawn and the pre-admission rejected, tracked here as a separate terminal status + removed_by/removed_at actor metadata rather than overloading withdrawn).';

COMMENT ON COLUMN sync_listings.entry_source IS
  'Metadata for the curation queue only (invited vs self-applied) — both paths pass through the SAME staff admit/reject gate (UI-phase decision #2, owner reversed the earlier "invited skips review" default).';

-- Partial unique index (mirrors capability_grants_active_uniq, migration
-- 042): one ACTIVE listing per song. A terminal row (rejected/withdrawn/
-- removed) falls outside the predicate, so re-submission after any
-- terminal outcome is allowed without a manual cleanup step.
CREATE UNIQUE INDEX sync_listings_active_track_uniq
  ON sync_listings (track_id)
  WHERE status IN ('applied', 'invited', 'agreement_pending', 'pending_admit', 'admitted');

-- Staff curation-queue lookup (mirrors idx_capability_grants_pending,
-- migration 042): songs awaiting a staff admit decision, oldest first.
CREATE INDEX idx_sync_listings_queue
  ON sync_listings (status, applied_at)
  WHERE status IN ('applied', 'pending_admit');

ALTER TABLE sync_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_listings_select_own" ON sync_listings;

-- An artist can see only their own listing rows. Buyers never read this
-- table directly (T-26-02) — the catalogue gate (Plan 26-06) is the only
-- cross-artist read path, and it runs server-side via the service client.
CREATE POLICY "sync_listings_select_own" ON sync_listings
  FOR SELECT USING (artist_user_id = auth.uid());

-- Column-lockdown doctrine (standing project practice since migration 031,
-- reapplied in 040/042/078): all writes route through service_role API
-- routes (Wave 2's submit/invite/admin routes), never direct
-- authenticated/anon PostgREST access. Closes T-26-01 (Elevation of
-- Privilege — an authenticated caller cannot self-insert a fabricated
-- 'admitted' row) and T-26-02 (Information Disclosure — anon cannot read
-- any row, only the owning artist can via the RLS policy above).
REVOKE INSERT, UPDATE, DELETE ON sync_listings FROM authenticated, anon;
REVOKE SELECT ON sync_listings FROM anon;

-- ─── (b) capability_grants extension (sync_library capability) ────────
-- DROP + re-ADD rather than editing migration 042 in place (standing
-- project convention — see 081's vault_documents.type widening for the
-- same pattern). Widens the capability enum to add 'sync_library'
-- (26-CONTEXT.md: admission mints a "sync-library participant" grant on
-- acceptance) and the source enum to add 'admin_invited'/'self_applied'
-- (the two entry paths), keeping every existing value untouched.
ALTER TABLE capability_grants DROP CONSTRAINT IF EXISTS capability_grants_capability_check;

ALTER TABLE capability_grants ADD CONSTRAINT capability_grants_capability_check
  CHECK (capability IN ('artist', 'industry', 'sync_library'));

COMMENT ON CONSTRAINT capability_grants_capability_check ON capability_grants IS
  'Widened in migration 096 to add sync_library (Phase 26) alongside migration 042''s original artist/industry values. A sync_library grant marks an artist as an admitted sync-library participant, minted on first admission regardless of entry path.';

ALTER TABLE capability_grants DROP CONSTRAINT IF EXISTS capability_grants_source_check;

ALTER TABLE capability_grants ADD CONSTRAINT capability_grants_source_check
  CHECK (source IN ('signup', 'self_serve_instant', 'admin_approved', 'backfill', 'admin_invited', 'self_applied'));

COMMENT ON CONSTRAINT capability_grants_source_check ON capability_grants IS
  'Widened in migration 096 to add admin_invited/self_applied (Phase 26''s two sync-library entry paths — 26-CONTEXT.md) alongside migration 042''s original four values.';

-- ─── (c) vault_documents.type widening (blanket_agreement) ────────────
-- Mirrors migration 081's DROP/re-ADD pattern verbatim (never edit a
-- landed migration in place). Adds blanket_agreement to the six values
-- 081 already established, so the signed artist->Funun blanket agreement
-- (26-CONTEXT.md OQ#4) can land in Contract Locker without a 23514
-- check_violation.
ALTER TABLE public.vault_documents DROP CONSTRAINT IF EXISTS vault_documents_type_check;

ALTER TABLE public.vault_documents ADD CONSTRAINT vault_documents_type_check
  CHECK (type IN (
    'split_sheet',
    'copyright_registration',
    'hire_right',
    'sample_clearance',
    'distribution_agreement',
    'sync_license',
    'blanket_agreement'
  ));

COMMENT ON CONSTRAINT vault_documents_type_check ON public.vault_documents IS
  'Widened in migration 096 to add blanket_agreement (Phase 26) alongside migration 081''s sync_license addition and migration 001''s original five document types, so the sync-library blanket-agreement e-sign flow (Plan 26-04) can insert a signed document into Contract Locker without a 23514 check_violation.';
