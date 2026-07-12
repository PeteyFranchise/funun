-- ============================================================
-- Funūn — Wave 4: Rich Member Profile
-- Migration 043: artist_profiles.allow_resharing (D-07)
-- Run via: supabase db push
-- ============================================================

-- Global toggle: whether the artist's public releases can be shared via
-- the ShareButton / public player's Web-Share flow. D-07: defaults ON —
-- the toggle is an opt-out, not an opt-in. Single profile-wide boolean
-- (RESEARCH.md A3: no per-project override is in scope for Phase 9).
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS allow_resharing boolean NOT NULL DEFAULT true;

-- allow_resharing is NOT sensitive/private data (unlike legal_first_name,
-- contact_phone, etc. locked down in migration 040) — it must be
-- PUBLIC-readable so app/u/[handle]/page.tsx and app/r/[projectId]/page.tsx
-- can gate the Share button for anonymous/session-bound readers, not just
-- the service-role client. Per the migration-031/040 column-privilege
-- rule (STATE.md CRITICAL note), the grant ships in this SAME migration
-- that adds the column — a newly added column has no column-level ACL
-- entry of its own yet, even though migration 040 already REVOKEd blanket
-- table-level SELECT from authenticated/anon. Mirrors migration 040's
-- GRANT SELECT (col-list) TO authenticated, anon shape exactly, just
-- scoped to the one new column so this migration doesn't have to
-- re-duplicate 040's full existing column list.
GRANT SELECT (allow_resharing) ON artist_profiles TO authenticated, anon;

-- No REVOKE here — allow_resharing was never previously granted (the
-- column is new), and it is not part of the PRIVATE set, so there is
-- nothing to revoke.
