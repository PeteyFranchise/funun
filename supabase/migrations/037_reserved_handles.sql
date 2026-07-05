-- ============================================================
-- Funūn — Wave 4: The Green Room
-- Migration 037: reserved_handles table + seed
-- Run via: supabase db push
-- ============================================================

-- Handle-claim path lookup table (D-13/D-14). Growable later via a
-- plain INSERT — no new migration needed as the reserved list grows.
-- Handles are stored lowercased to match the existing case-insensitive
-- handle convention (see migration 010's
-- artist_profiles_handle_lower_uniq unique index on lower(handle));
-- claim-validation must lowercase-compare against this table.
CREATE TABLE IF NOT EXISTS reserved_handles (handle TEXT PRIMARY KEY, reason TEXT);

ALTER TABLE reserved_handles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reserved_handles_select_all" ON reserved_handles;

-- Handle-claim validation needs to look up against it from the client
-- session (authenticated) and, for the public /u/[handle] impersonation
-- check, from anon as well. No INSERT/UPDATE/DELETE policy for users —
-- the list grows via service-role INSERT only.
CREATE POLICY "reserved_handles_select_all" ON reserved_handles FOR SELECT USING (true);

-- Seed: system/brand words (D-14) plus a broad set of well-known
-- music-platform/brand names to prevent impersonation-style squatting.
-- ON CONFLICT DO NOTHING keeps re-running this migration idempotent.
INSERT INTO reserved_handles (handle, reason) VALUES
  -- system / brand (D-14 mandated)
  ('admin', 'system'),
  ('api', 'system'),
  ('settings', 'system'),
  ('signin', 'system'),
  ('signup', 'system'),
  ('dashboard', 'system'),
  ('vault', 'system'),
  ('launchpad', 'system'),
  ('help', 'system'),
  ('support', 'system'),
  ('about', 'system'),
  ('terms', 'system'),
  ('privacy', 'system'),
  ('funun', 'brand'),
  ('funun-official', 'brand'),
  ('official', 'system'),
  -- well-known music-platform / distributor / PRO brand names (Claude's discretion, D-14)
  ('spotify', 'brand'),
  ('applemusic', 'brand'),
  ('apple-music', 'brand'),
  ('soundcloud', 'brand'),
  ('youtube', 'brand'),
  ('youtubemusic', 'brand'),
  ('tidal', 'brand'),
  ('deezer', 'brand'),
  ('bandcamp', 'brand'),
  ('pandora', 'brand'),
  ('amazonmusic', 'brand'),
  ('audiomack', 'brand'),
  ('distrokid', 'brand'),
  ('tunecore', 'brand'),
  ('cdbaby', 'brand'),
  ('ascap', 'brand'),
  ('bmi', 'brand'),
  ('sesac', 'brand'),
  ('socan', 'brand'),
  ('soundexchange', 'brand'),
  ('songtrust', 'brand'),
  ('dropbox', 'brand'),
  ('resend', 'brand'),
  ('stripe', 'brand'),
  ('supabase', 'brand'),
  ('instagram', 'brand'),
  ('tiktok', 'brand'),
  ('threads', 'brand'),
  ('twitter', 'brand'),
  ('meta', 'brand'),
  ('facebook', 'brand'),
  -- reserved single-word role/brand terms (impersonation risk)
  ('artist', 'impersonation'),
  ('producer', 'impersonation'),
  ('label', 'impersonation'),
  ('publisher', 'impersonation'),
  ('curator', 'impersonation'),
  ('verified', 'impersonation'),
  ('moderator', 'impersonation'),
  ('root', 'system'),
  ('system', 'system'),
  ('null', 'system'),
  ('undefined', 'system')
ON CONFLICT DO NOTHING;
