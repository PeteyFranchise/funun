-- ============================================================
-- 010 — Public showcase profile fields
-- Adds the fields the public "Your Profile" page (user-profile.html)
-- needs: a shareable handle, a public toggle, identity media, roles,
-- open-to status, and a featured release. v1 is showcase-only; the
-- social layer (follow / DM / wall / endorsements) lands in a later
-- migration. vault_projects.is_public already exists for release links.
--
-- Note on access: artist_profiles already has a permissive
-- "Public profiles visible" SELECT policy (USING true). is_public is the
-- APPLICATION-LEVEL gate for whether the public page renders; we do not
-- tighten the existing RLS here.
-- Idempotent. Run via: supabase db push (or the management query API).
-- ============================================================

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS handle              TEXT,
  ADD COLUMN IF NOT EXISTS is_public           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avatar_url          TEXT,
  ADD COLUMN IF NOT EXISTS banner_url          TEXT,
  ADD COLUMN IF NOT EXISTS pronouns            TEXT,
  ADD COLUMN IF NOT EXISTS verified            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS roles               JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS open_to             JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS featured_project_id UUID;

-- Featured release points at one of the artist's vault projects.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'artist_profiles_featured_project_fk'
  ) THEN
    ALTER TABLE artist_profiles
      ADD CONSTRAINT artist_profiles_featured_project_fk
      FOREIGN KEY (featured_project_id) REFERENCES vault_projects(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Case-insensitive unique handle (NULLs allowed → un-set handles don't clash).
CREATE UNIQUE INDEX IF NOT EXISTS artist_profiles_handle_lower_uniq
  ON artist_profiles (lower(handle))
  WHERE handle IS NOT NULL;

-- Fast lookup of public profiles.
CREATE INDEX IF NOT EXISTS artist_profiles_is_public_idx
  ON artist_profiles (is_public)
  WHERE is_public = true;
