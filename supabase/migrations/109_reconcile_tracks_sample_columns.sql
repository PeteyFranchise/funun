-- ============================================================
-- Funūn — reconcile migration 005 drift: restore the missing
-- tracks.has_sample / tracks.sample_details columns on the remote
-- Migration 109
--
-- WHY: Migration 005 (005_stage3_additions.sql) added
-- tracks.has_sample (BOOLEAN DEFAULT false) and tracks.sample_details
-- (TEXT) via ADD COLUMN IF NOT EXISTS. supabase_migrations records 005 as
-- applied on the remote, but the columns DO NOT EXIST there (verified:
-- "column tracks.has_sample does not exist") — a recorded-vs-actual schema
-- drift discovered during Phase 30. lib/deals/catalog-query.ts
-- (loadCatalogPage, which backs the buyer Crate) and the Phase 30 catalogue
-- surfaces SELECT these columns and would 500 against the live remote once
-- real rows exist (today it is masked only because the catalogue renders a
-- fixture and sync_listings is empty).
--
-- WHAT: re-add the two columns to migration 005's EXACT intended shape,
-- using ADD COLUMN IF NOT EXISTS so this is idempotent — it restores them
-- where missing and is a harmless no-op if a later push finds them present.
-- Additive only; touches nothing else.
--
-- SCOPE NOTE: migration 005 ALSO created a Stage-3 sample-clearance
-- readiness function that references has_sample. If that function is ALSO
-- missing on the remote (a broader 005 drift), that is a SEPARATE
-- investigation — this migration only restores the two columns the live
-- catalogue query directly depends on. The app runs today, which suggests
-- the function is either present or off the hot path; confirm separately if
-- needed.
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (matches migrations 080/081/089/090/096/106/107/108's convention). The
-- owner reviews and pushes. Do NOT edit migrations 080-108 (already landed).
-- ============================================================

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS has_sample     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sample_details TEXT;

NOTIFY pgrst, 'reload schema';
