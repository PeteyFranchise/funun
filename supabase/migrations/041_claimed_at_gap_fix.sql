-- ============================================================
-- Funūn — Wave 4: Identity & Schema Foundation
-- Migration 041: claimed_at gap fix
-- Run via: supabase db push
-- ============================================================

-- Migration 026 was supposed to add artist_profiles.claimed_at, but
-- pushing this milestone's migrations against the live database
-- surfaced that 026's artist_profiles ALTER never actually landed
-- there — the live schema's history has a real gap beyond what the
-- CLI's bookkeeping table reflects (migration 040's GRANT SELECT
-- (..., claimed_at) failed with "column does not exist" because
-- migration 034 already succeeded and was recorded as applied before
-- this gap was discovered, so re-editing 034 has no effect on this
-- database — db push skips migrations already in its history).
-- This is a standalone, idempotent migration so it actually runs.
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
