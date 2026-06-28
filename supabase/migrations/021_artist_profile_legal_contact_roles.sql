-- ============================================================
-- Funūn — Wave 2: Rights & Registration Rails
-- Migration 021: legal identity, contact info, and industry roles
-- on artist_profiles so a fully set-up artist auto-fills into
-- collaborator forms and split sheets without re-entry in the studio.
-- ============================================================

ALTER TABLE artist_profiles
  -- Legal name (separate from artist/stage name)
  ADD COLUMN IF NOT EXISTS legal_first_name  TEXT,
  ADD COLUMN IF NOT EXISTS legal_middle_name TEXT,
  ADD COLUMN IF NOT EXISTS legal_last_name   TEXT,
  ADD COLUMN IF NOT EXISTS legal_name_suffix TEXT,

  -- Contact (for contracts and split sheets)
  ADD COLUMN IF NOT EXISTS contact_phone    TEXT,
  ADD COLUMN IF NOT EXISTS mailing_address  JSONB DEFAULT '{}',

  -- Industry roles — master list of hats this person wears
  -- stored as an array of role slugs (e.g. ['songwriter','producer'])
  ADD COLUMN IF NOT EXISTS industry_roles   TEXT[] DEFAULT '{}';
