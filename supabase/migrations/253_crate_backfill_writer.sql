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
  p_listing_id          UUID,
  p_bucket              TEXT,
  p_path                TEXT,
  p_sha256              TEXT,
  p_size_bytes          BIGINT,
  p_mime_type           TEXT,
  p_source_bucket       TEXT,
  p_source_path         TEXT,
  p_title               TEXT,
  p_primary_artist_name TEXT,
  p_payee_user_id       UUID,
  p_captured_by         UUID,
  p_source_track_id     UUID,
  p_source_project_id   UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_song_id     UUID;
  v_existing    UUID;
  v_review_id   UUID;
  v_artifact_id UUID;
  v_status      TEXT;
BEGIN
  -- Same database-side idempotency boundary as the normal path.
  SELECT id INTO v_existing FROM public.crate_songs WHERE source_listing_id = p_listing_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Backfill applies only to songs that really were admitted. Running it over a
  -- pending or rejected listing would fabricate a catalogue entry.
  SELECT status INTO v_status FROM public.sync_listings WHERE id = p_listing_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'listing % does not exist', p_listing_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_status <> 'admitted' THEN
    RAISE EXCEPTION 'listing % is %, not admitted; backfill captures admitted songs only',
      p_listing_id, v_status USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.crate_quality_reviews (
    listing_id, source_bucket, source_path, sha256, size_bytes, mime_type,
    provenance, reviewer_id, verdict, notes
  )
  VALUES (
    p_listing_id, p_source_bucket, p_source_path, p_sha256, p_size_bytes, p_mime_type,
    'backfilled', NULL, 'unreviewed',
    'Digest computed at backfill. No human approved these exact bytes; the song was admitted before byte-tied review existed.'
  )
  RETURNING id INTO v_review_id;

  INSERT INTO public.crate_songs (
    source_track_id, source_project_id, source_listing_id,
    title, primary_artist_name, payee_user_id, captured_by, lifecycle_state
  )
  VALUES (
    p_source_track_id, p_source_project_id, p_listing_id,
    p_title, p_primary_artist_name, p_payee_user_id, p_captured_by, 'draft'
  )
  RETURNING id INTO v_song_id;

  INSERT INTO public.crate_song_artifacts (
    crate_song_id, role, storage_bucket, storage_path, sha256, size_bytes,
    mime_type, source_bucket, source_path, status, captured_by, quality_review_id
  )
  VALUES (
    v_song_id, 'review_playback', p_bucket, p_path, p_sha256, p_size_bytes,
    p_mime_type, p_source_bucket, p_source_path, 'verified', p_captured_by, v_review_id
  )
  RETURNING id INTO v_artifact_id;

  INSERT INTO public.crate_song_current_artifacts (crate_song_id, role, artifact_id)
  VALUES (v_song_id, 'review_playback', v_artifact_id);

  INSERT INTO public.crate_song_events (crate_song_id, lifecycle_version_after, kind, actor, detail)
  VALUES (v_song_id, 0, 'captured_by_backfill', p_captured_by,
          jsonb_build_object('listing_id', p_listing_id, 'quality_review_id', v_review_id,
                             'provenance', 'backfilled'));

  RETURN v_song_id;
END;
$$;

ALTER FUNCTION public.crate_backfill_capture_song(
  UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID
) OWNER TO funun_crate_evidence;

REVOKE ALL ON FUNCTION public.crate_backfill_capture_song(
  UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crate_backfill_capture_song(
  UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID
) TO service_role;

COMMENT ON FUNCTION public.crate_backfill_capture_song(
  UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID
) IS
  'Captures a song admitted before byte-tied review existed. Produces a provenance=backfilled, verdict=unreviewed review row with no reviewer, because no human approved these exact bytes and saying otherwise would forge evidence. Admitted listings only, idempotent on source_listing_id.';

COMMIT;

NOTIFY pgrst, 'reload schema';
