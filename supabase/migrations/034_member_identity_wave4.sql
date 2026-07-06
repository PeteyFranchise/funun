-- ============================================================
-- Funūn — Wave 4: Identity & Schema Foundation
-- Migration 034: member_type + search_vector + featured-spotlight integrity
-- Run via: supabase db push
-- ============================================================

-- ─── Identity columns on artist_profiles ────────────────────────────
-- member_type is the single most important architectural bet of Wave 4:
-- one unified member-identity table (artist_profiles), discriminated by
-- member_type, rather than a parallel industry_profiles table. The
-- pre-existing industry_profiles table (migration 001) is left
-- completely untouched (D-06) — it has zero writers anywhere in the app.
--
-- banner_url, pronouns, open_to, and featured_project_id already shipped
-- in migration 010 and carry live data. They are re-asserted here with
-- ADD COLUMN IF NOT EXISTS no-ops purely to document the full Phase 8
-- identity column set in one place — do NOT drop or retype them.
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS member_type TEXT NOT NULL DEFAULT 'artist'
    CHECK (member_type IN ('artist', 'industry')),
  ADD COLUMN IF NOT EXISTS banner_url          TEXT,
  ADD COLUMN IF NOT EXISTS pronouns            TEXT,
  ADD COLUMN IF NOT EXISTS open_to             JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS featured_project_id UUID;

-- ─── search_vector (people search, Phase 12) ────────────────────────
-- Even a custom wrapper function explicitly marked IMMUTABLE around
-- to_tsvector was rejected by Postgres's GENERATED ALWAYS AS ... STORED
-- immutability check (SQLSTATE 42P17), in both LANGUAGE sql and
-- LANGUAGE plpgsql forms — tried and failed against the live database.
-- Rather than keep guessing at the exact internal rule Postgres is
-- enforcing here, this uses the older, battle-tested pattern that
-- predates generated columns entirely: a plain tsvector column
-- maintained by a BEFORE INSERT/UPDATE trigger. Trigger function
-- bodies have no immutability restriction — STABLE calls like
-- to_tsvector are unconditionally fine inside one. genres and
-- industry_roles are TEXT[] columns that are nullable in practice
-- (DEFAULT '{}' but no NOT NULL constraint), and array_to_string()
-- returns NULL — not '' — when its array argument is NULL, which
-- would otherwise NULL out the entire concatenation via the ||
-- operator. Each array_to_string() call is wrapped in coalesce(..., '')
-- to guard against that.
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION artist_profiles_update_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.artist_name, '') || ' ' ||
    coalesce(array_to_string(NEW.genres, ' '), '') || ' ' ||
    coalesce(NEW.location, '') || ' ' ||
    coalesce(array_to_string(NEW.industry_roles, ' '), '') || ' ' ||
    coalesce(NEW.handle, '') || ' ' ||
    coalesce(NEW.bio, '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS artist_profiles_search_vector_trigger ON artist_profiles;
CREATE TRIGGER artist_profiles_search_vector_trigger
  BEFORE INSERT OR UPDATE ON artist_profiles
  FOR EACH ROW EXECUTE FUNCTION artist_profiles_update_search_vector();

-- Backfill existing rows — the trigger only fires on future INSERT/UPDATE.
UPDATE artist_profiles SET search_vector = to_tsvector('english',
  coalesce(artist_name, '') || ' ' ||
  coalesce(array_to_string(genres, ' '), '') || ' ' ||
  coalesce(location, '') || ' ' ||
  coalesce(array_to_string(industry_roles, ' '), '') || ' ' ||
  coalesce(handle, '') || ' ' ||
  coalesce(bio, '')
)
WHERE search_vector IS NULL;

-- Built-in tsvector_ops GIN index (NOT gin_trgm_ops — a tsvector column
-- takes a plain GIN index; trigram indexes are for raw text similarity,
-- a different strategy the ROADMAP's "GIN trigram" phrasing conflated).
CREATE INDEX IF NOT EXISTS idx_artist_profiles_search_vector
  ON artist_profiles USING GIN (search_vector);

-- ─── D-16: featured-spotlight integrity ─────────────────────────────
-- A member can pin a project id as their Featured spotlight. Without
-- these triggers a private-draft vault_project id could leak through
-- the public profile spotlight (T-08-01, information disclosure).
CREATE OR REPLACE FUNCTION check_featured_project_is_public()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.featured_project_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM vault_projects
      WHERE id = NEW.featured_project_id AND is_public = true
    ) THEN
      RAISE EXCEPTION 'featured_project_id must reference a public vault_project';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER artist_profiles_featured_project_check
  BEFORE INSERT OR UPDATE OF featured_project_id ON artist_profiles
  FOR EACH ROW EXECUTE FUNCTION check_featured_project_is_public();

-- Self-null when a featured project is later unpublished
-- (is_public flips true -> false) so the dangling reference can never
-- resolve to a private draft after the fact.
--
-- SECURITY DEFINER is required (WR-01 fix): without it the function runs
-- as the invoking user (the project owner B who is unpublishing). The
-- "Artists manage own profile" RLS policy (auth.uid() = id) filters the
-- UPDATE to only B's own artist_profiles row — it silently updates zero
-- rows for user A who featured B's project. A's featured_project_id then
-- dangles at a private-draft UUID that is in the public SELECT grant,
-- leaking the project id (T-08-01). SECURITY DEFINER + SET search_path
-- lets the trigger run as its owner (bypassing RLS) so it can null out
-- any profile that references the newly-private project.
-- All table references are schema-qualified to prevent search_path hijack.
CREATE OR REPLACE FUNCTION clear_featured_if_unpublished()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.is_public = false AND OLD.is_public = true THEN
    UPDATE public.artist_profiles SET featured_project_id = NULL
    WHERE featured_project_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vault_projects_clear_featured_on_unpublish
  AFTER UPDATE OF is_public ON vault_projects
  FOR EACH ROW EXECUTE FUNCTION clear_featured_if_unpublished();
