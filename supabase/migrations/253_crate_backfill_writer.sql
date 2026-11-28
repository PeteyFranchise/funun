-- 253_crate_backfill_writer.sql
--
-- PHASE 50.5B (B4) — capture for songs admitted BEFORE byte-tied review existed.
--
-- HUMAN-GATED. Never `supabase db push` from an agent session.
-- DEPENDS ON 248 and 252.
--
-- THE HONESTY PROBLEM THIS SOLVES. Songs already admitted have no byte-tied
-- review, because the mechanism did not exist when they were admitted. Their
-- legacy verdict (sync_listings.quality_ok, migration 107) records that a human
-- approved THE SONG; it says nothing about which bytes. Capturing them through
-- crate_capture_admitted_song would require inventing a 'reviewed' row naming
-- the original staff member, which asserts they approved bytes they never heard.
-- That is precisely the forgery crate_quality_reviews exists to prevent.
--
-- So a backfill produces a DIFFERENT KIND OF ROW: provenance 'backfilled',
-- verdict 'unreviewed', reviewer_id NULL. The song is captured and the file is
-- held, and the record says plainly that nobody approved these exact bytes. Any
-- surface that later wants a byte-level guarantee can ask for provenance
-- 'reviewed' and will correctly not find one.

BEGIN;

CREATE OR REPLACE FUNCTION public.crate_backfill_capture_song(
  p_listing_id  UUID,
  p_bucket      TEXT,
  p_path        TEXT,
  p_sha256      TEXT,
  p_size_bytes  BIGINT,
  p_mime_type   TEXT,
  p_operator_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_song_id      UUID;
  v_existing     public.crate_songs%ROWTYPE;
  v_existing_sha TEXT;
  v_review_id    UUID;
  v_artifact_id  UUID;
  v_listing      public.sync_listings%ROWTYPE;
  v_title        TEXT;
  v_artist_name  TEXT;
  v_source_path  TEXT;
BEGIN
  -- M4 (review 2026-11-28): identity is DERIVED here, not supplied. The previous
  -- signature took the track, project, payee, title and artist name from the
  -- caller, so a backfill could invent a catalogue entry's provenance wholesale.
  -- M3: the listing is locked first, matching the global lock order.
  SELECT * INTO v_listing FROM public.sync_listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing % does not exist', p_listing_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_listing.status <> 'admitted' THEN
    RAISE EXCEPTION 'listing % is %, not admitted; backfill captures admitted songs only',
      p_listing_id, v_listing.status USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- M7 (review 2026-11-28): A BACKFILL IS AN OPERATOR ACT, NEVER THE ARTIST'S.
  -- The script passed the artist's id as the capture actor, so an append-only
  -- row would have recorded the artist as having performed a migration an
  -- operator ran. Refused structurally rather than only fixed in the caller,
  -- because the row is immutable once written.
  IF p_operator_id IS NULL THEN
    RAISE EXCEPTION 'backfill requires an explicit operator id' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_operator_id = v_listing.artist_user_id THEN
    RAISE EXCEPTION
      'the artist cannot be recorded as the backfill operator for listing %', p_listing_id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_bucket <> 'crate-audio' THEN
    RAISE EXCEPTION 'captured artifacts live in crate-audio, not %', p_bucket
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_path IS NULL OR p_path !~ ('^captured/' || p_listing_id::text || '/') THEN
    RAISE EXCEPTION 'captured path % is not inside this listing''s prefix', p_path
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Exact-replay idempotency, as in the normal path: an existing capture holding
  -- DIFFERENT bytes is a conflict, not a success.
  SELECT * INTO v_existing FROM public.crate_songs WHERE source_listing_id = p_listing_id;
  IF FOUND THEN
    SELECT a.sha256 INTO v_existing_sha
      FROM public.crate_song_current_artifacts c
      JOIN public.crate_song_artifacts a ON a.id = c.artifact_id
     WHERE c.crate_song_id = v_existing.id AND c.role = 'review_playback';
    IF v_existing_sha IS DISTINCT FROM p_sha256 THEN
      RAISE EXCEPTION 'listing % is already captured holding different bytes', p_listing_id
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN v_existing.id;
  END IF;

  SELECT t.title, t.audio_file_url INTO v_title, v_source_path
    FROM public.tracks t WHERE t.id = v_listing.track_id;
  SELECT u.artist_name INTO v_artist_name
    FROM public.user_profiles u WHERE u.id = v_listing.artist_user_id;

  INSERT INTO public.crate_quality_reviews (
    listing_id, source_bucket, source_path, sha256, size_bytes, mime_type,
    provenance, reviewer_id, verdict, notes
  )
  VALUES (
    p_listing_id, 'track-audio', COALESCE(v_source_path, ''), p_sha256, p_size_bytes, p_mime_type,
    'backfilled', NULL, 'unreviewed',
    'Digest computed at backfill from the object as it stood then. No human approved these bytes, and this does NOT establish that they are the recording that was admitted: the upload route permits replacing a track''s audio after admission.'
  )
  RETURNING id INTO v_review_id;

  INSERT INTO public.crate_songs (
    source_track_id, source_project_id, source_listing_id,
    title, primary_artist_name, payee_user_id, captured_by, lifecycle_state
  )
  VALUES (
    v_listing.track_id, v_listing.vault_project_id, p_listing_id,
    COALESCE(v_title, 'Untitled'), COALESCE(v_artist_name, ''),
    v_listing.artist_user_id, p_operator_id, 'draft'
  )
  RETURNING id INTO v_song_id;

  INSERT INTO public.crate_song_artifacts (
    crate_song_id, role, storage_bucket, storage_path, sha256, size_bytes,
    mime_type, source_bucket, source_path, status, captured_by, quality_review_id
  )
  VALUES (
    v_song_id, 'review_playback', p_bucket, p_path, p_sha256, p_size_bytes,
    p_mime_type, 'track-audio', COALESCE(v_source_path, ''), 'verified',
    p_operator_id, v_review_id
  )
  RETURNING id INTO v_artifact_id;

  INSERT INTO public.crate_song_current_artifacts (crate_song_id, role, artifact_id)
  VALUES (v_song_id, 'review_playback', v_artifact_id);

  INSERT INTO public.crate_song_events (crate_song_id, lifecycle_version_after, kind, actor, detail)
  VALUES (v_song_id, 0, 'captured_by_backfill', p_operator_id,
          jsonb_build_object('listing_id', p_listing_id, 'quality_review_id', v_review_id,
                             'provenance', 'backfilled'));

  RETURN v_song_id;
END;
$$;

-- M1 (review 2026-11-28): REACQUIRE THE MEMBERSHIP. 248 grants
-- funun_crate_evidence to CURRENT_USER, transfers ownership, then REVOKES it
-- again. PostgreSQL requires the executor to be able to SET ROLE to the new
-- owner, so without this every ALTER FUNCTION ... OWNER TO below fails on a
-- hosted runner that has no superuser bypass.
GRANT funun_crate_evidence TO CURRENT_USER;

ALTER FUNCTION public.crate_backfill_capture_song(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, UUID)
  OWNER TO funun_crate_evidence;

REVOKE ALL ON FUNCTION public.crate_backfill_capture_song(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crate_backfill_capture_song(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, UUID)
  TO service_role;

COMMENT ON FUNCTION public.crate_backfill_capture_song(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, UUID)
  IS
  'Captures a song admitted before byte-tied review existed. Produces a provenance=backfilled, verdict=unreviewed review row with no reviewer, because no human approved these exact bytes and saying otherwise would forge evidence. Admitted listings only, idempotent on source_listing_id.';

REVOKE funun_crate_evidence FROM CURRENT_USER;

COMMIT;

NOTIFY pgrst, 'reload schema';
