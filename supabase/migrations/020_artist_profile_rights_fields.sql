-- ============================================================
-- Funūn — Wave 2: Rights & Registration Rails
-- Migration 020: rights registry fields on artist_profiles
-- Mirrors the collaborator roster fields so an artist's own
-- PRO/IPI/publisher/MLC/SoundExchange data lives in their profile
-- and can auto-populate split sheets and metadata without re-entry.
-- ============================================================

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS pro              TEXT,
  ADD COLUMN IF NOT EXISTS ipi              TEXT,
  ADD COLUMN IF NOT EXISTS publisher        TEXT,
  ADD COLUMN IF NOT EXISTS mlc_id           TEXT,
  ADD COLUMN IF NOT EXISTS soundexchange_id TEXT;
