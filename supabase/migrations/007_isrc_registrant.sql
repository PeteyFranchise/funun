-- ─── Migration 007: ISRC self-assignment ────────────────────────────
-- Lets an artist who holds their own ISRC registrant code mint compliant
-- ISRCs inside ArtistOS instead of depending on a distributor's code.
--
-- ISRC = CC (country) + XXX (registrant) + YY (year) + NNNNN (designation).
-- The registrant code + country are issued once to the artist by their
-- national ISRC agency (e.g. the RIAA / usisrc.org in the US). We store
-- them on the profile and track the last designation number issued per
-- 2-digit year so generated codes never collide.
--
-- NOTE: there is deliberately NO ISWC equivalent here. ISWCs are allocated
-- centrally by CISAC through a PRO and cannot be self-assigned — we only
-- validate and capture those.

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS isrc_country_code     TEXT,
  ADD COLUMN IF NOT EXISTS isrc_registrant_code  TEXT,
  ADD COLUMN IF NOT EXISTS isrc_year_counters    JSONB NOT NULL DEFAULT '{}'::jsonb;
