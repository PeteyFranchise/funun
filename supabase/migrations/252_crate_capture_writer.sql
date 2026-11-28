-- 252_crate_capture_writer.sql
--
-- PHASE 50.5B — the admission capture writer.
--
-- HUMAN-GATED. Never `supabase db push` from an agent session.
-- DEPENDS ON 248 (schema and write boundary) and 251 (quality review writer).
--
-- THE DIVISION OF LABOUR, SETTLED. Postgres cannot read Storage, so any design
-- where this function hashes the bytes is impossible. Trusted server code copies
-- the reviewed object into the private crate-audio bucket, READS THE COPY BACK,
-- and computes the digest. This function compares that digest against the
-- immutable crate_quality_reviews.sha256 and REFUSES ON MISMATCH before anything
-- is committed. A mismatch means the artist swapped the file between review and
-- admission.
--
-- CAPTURE IS NOT ATOMIC WITH THE STORAGE COPY, and cannot be: Storage and
-- Postgres do not share a transaction. The ordering is chosen so the failure mode
-- is the tolerable one. An orphaned private copy is always preferable to an
-- admitted song with no artifact, so the caller copies first and admits only
-- after this function commits; a failed capture leaves a file to clean up, never
-- a buyer-visible song with nothing behind it.

BEGIN;

CREATE OR REPLACE FUNCTION public.crate_capture_admitted_song(
  p_listing_id         UUID,
  p_quality_review_id  UUID,
  p_bucket             TEXT,
  p_path               TEXT,
  p_sha256             TEXT,
  p_size_bytes         BIGINT,
  p_mime_type          TEXT,
  p_title              TEXT,
  p_primary_artist_name TEXT,
  p_payee_user_id      UUID,
  p_captured_by        UUID,
  p_source_track_id    UUID,
  p_source_project_id  UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_song_id     UUID;
  v_existing    UUID;
  v_review      public.crate_quality_reviews%ROWTYPE;
  v_artifact_id UUID;
BEGIN
  -- IDEMPOTENCY, IN THE DATABASE RATHER THAN THE CALLER. source_listing_id is
  -- UNIQUE precisely so a retried admission cannot mint a second captured song.
  -- Returning the existing id rather than raising lets the caller treat a retry
  -- as success and clean up the copy it just made.
  SELECT id INTO v_existing FROM public.crate_songs WHERE source_listing_id = p_listing_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_review FROM public.crate_quality_reviews WHERE id = p_quality_review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quality review % does not exist', p_quality_review_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- The review must be of THIS listing. A passing review of another song is not
  -- authority to capture this one.
  IF v_review.listing_id <> p_listing_id THEN
    RAISE EXCEPTION 'quality review % belongs to listing %, not %',
      p_quality_review_id, v_review.listing_id, p_listing_id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_review.verdict <> 'passed' THEN
    RAISE EXCEPTION 'quality review % did not pass', p_quality_review_id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- A BACKFILLED row is not a review. Its digest was computed when the song was
  -- migrated and no human approved those bytes, so it can never authorise a
  -- normal capture. Stated explicitly rather than relying on the verdict check
  -- above to catch it by implication.
  IF v_review.provenance <> 'reviewed' THEN
    RAISE EXCEPTION 'quality review % is %, not a review, and cannot authorise capture',
      p_quality_review_id, v_review.provenance
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- THE COMPARISON THIS WHOLE SLICE EXISTS FOR. The caller hashed the bytes it
  -- actually copied; the review holds the digest of the bytes a human approved.
  -- If they differ the file changed in between, and no amount of good faith in
  -- the caller makes the capture legitimate.
  IF p_sha256 IS DISTINCT FROM v_review.sha256 THEN
    RAISE EXCEPTION
      'captured bytes do not match the reviewed bytes for listing % (reviewed %, captured %)',
      p_listing_id, v_review.sha256, p_sha256
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  INSERT INTO public.crate_songs (
    source_track_id, source_project_id, source_listing_id,
    title, primary_artist_name, payee_user_id, captured_by, lifecycle_state
  )
  VALUES (
    p_source_track_id, p_source_project_id, p_listing_id,
    p_title, p_primary_artist_name, p_payee_user_id, p_captured_by, 'draft'
  )
  RETURNING id INTO v_song_id;

  -- D-18: the reviewed playback is REQUIRED at admission and must name the
  -- review whose digest it matched. A master or instrumental is a candidate
  -- captured separately; stems are not captured at admission at all.
  INSERT INTO public.crate_song_artifacts (
    crate_song_id, role, storage_bucket, storage_path, sha256, size_bytes,
    mime_type, source_bucket, source_path, status, captured_by, quality_review_id
  )
  VALUES (
    v_song_id, 'review_playback', p_bucket, p_path, p_sha256, p_size_bytes,
    p_mime_type, v_review.source_bucket, v_review.source_path, 'verified',
    p_captured_by, p_quality_review_id
  )
  RETURNING id INTO v_artifact_id;

  INSERT INTO public.crate_song_current_artifacts (crate_song_id, role, artifact_id)
  VALUES (v_song_id, 'review_playback', v_artifact_id);

  INSERT INTO public.crate_song_events (crate_song_id, lifecycle_version_after, kind, actor, detail)
  VALUES (v_song_id, 0, 'captured', p_captured_by,
          jsonb_build_object('listing_id', p_listing_id, 'quality_review_id', p_quality_review_id));

  RETURN v_song_id;
END;
$$;

ALTER FUNCTION public.crate_capture_admitted_song(
  UUID, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID
) OWNER TO funun_crate_evidence;

REVOKE ALL ON FUNCTION public.crate_capture_admitted_song(
  UUID, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crate_capture_admitted_song(
  UUID, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID
) TO service_role;

COMMENT ON FUNCTION public.crate_capture_admitted_song(
  UUID, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID
) IS
  'Captures an admitted song: compares the caller-computed digest of the copied bytes against the immutable quality review and refuses on mismatch, then commits the captured song, its required review_playback artifact and the current pointer in one transaction. Idempotent on source_listing_id, so a retry returns the existing song rather than minting a second one.';

-- Orphan cleanup also needs a writer: 248 revokes direct write from service_role
-- on every table including the queue. Without this, a failed capture could not
-- even record the file it left behind.
CREATE OR REPLACE FUNCTION public.crate_enqueue_capture_orphan(
  p_bucket TEXT,
  p_path   TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.crate_capture_orphans (storage_bucket, storage_path)
  VALUES (p_bucket, p_path)
  ON CONFLICT (storage_bucket, storage_path) DO UPDATE
    SET state = CASE WHEN public.crate_capture_orphans.state = 'deleted'
                     THEN 'pending' ELSE public.crate_capture_orphans.state END
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

ALTER FUNCTION public.crate_enqueue_capture_orphan(TEXT, TEXT) OWNER TO funun_crate_evidence;
REVOKE ALL ON FUNCTION public.crate_enqueue_capture_orphan(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crate_enqueue_capture_orphan(TEXT, TEXT) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
