-- ============================================================
-- Funūn — Wave 2: Rights & Registration Rails
-- Migration 022: genres array on artist_profiles
-- Replaces the single genre TEXT field with a multi-select array
-- so artists can tag all genres that apply to their work.
-- The legacy genre TEXT column is kept for backward compat.
-- ============================================================

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS genres TEXT[] DEFAULT '{}';
