-- 254_crate_review_captured_artifact.sql
--
-- PHASE 50.5B — the promotion path: a real review OF THE CAPTURED OBJECT.
--
-- HUMAN-GATED. Never `supabase db push` from an agent session.
-- DEPENDS ON 248, 252 and 253.
--
-- WHY THIS EXISTS. A backfilled song holds bytes copied from the live object,
-- attested by an operator, approved by nobody. Owner decision 2026-11-28: such a
-- song reaches no buyer until staff review it. This is how it stops being
-- backfilled.
--
-- THE WARNING THIS ENCODES, and it is the whole reason the function is shaped
-- this way: re-review must review THE IMMUTABLE CAPTURED OBJECT, not whatever
-- `tracks.audio_file_url` points at by the time staff get to it. If staff
-- reviewed the live Vault file and we recorded a pass against the captured copy,
-- a song could pass review while a DIFFERENT stored object is the one actually
-- approved — the exact race byte-tied review exists to close, re-entering
-- through the back door. So the caller hashes the object in crate-audio, and
-- this function refuses unless that digest still equals the artifact's recorded
-- sha256.
--
-- PROMOTION IS APPEND-ONLY. The attestation is never erased: it stays as
-- truthful history of how the song entered The Crate. The review is a new row,
-- and the reviewed artifact is a NEW ARTIFACT VERSION superseding the attested
-- one, using the linear lineage chain 248 established. Nothing is rewritten.

BEGIN;

CREATE OR REPLACE FUNCTION public.crate_review_captured_artifact(
  p_crate_song_id UUID,
  p_sha256        TEXT,
  p_reviewer_id   UUID,
  p_verdict       TEXT,
  p_notes         TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_song        public.crate_songs%ROWTYPE;
  v_current     public.crate_song_artifacts%ROWTYPE;
  v_review_id   UUID;
  v_new_id      UUID;
BEGIN
  IF p_verdict IS NULL OR p_verdict NOT IN ('passed', 'failed') THEN
    RAISE EXCEPTION 'verdict must be passed or failed' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_reviewer_id IS NULL THEN
    RAISE EXCEPTION 'a review with no reviewer is not evidence of a review'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Song row first: step 1 of the global lock order.
  SELECT * INTO v_song FROM public.crate_songs WHERE id = p_crate_song_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'captured song % does not exist', p_crate_song_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT a.* INTO v_current
    FROM public.crate_song_current_artifacts c
    JOIN public.crate_song_artifacts a ON a.id = c.artifact_id
   WHERE c.crate_song_id = p_crate_song_id AND c.role = 'review_playback';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'captured song % has no current review_playback', p_crate_song_id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_current.backfill_attestation_id IS NULL THEN
    RAISE EXCEPTION 'captured song % is already reviewed; a correction is a new review, not a promotion',
      p_crate_song_id USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- THE DIGEST RECHECK. The caller hashed the object in crate-audio. If it no
  -- longer matches what the artifact records, the stored object changed since
  -- capture and nothing here may be treated as a review of it.
  IF p_sha256 IS DISTINCT FROM v_current.sha256 THEN
    RAISE EXCEPTION
      'the captured object for song % no longer hashes to its recorded digest (recorded %, found %)',
      p_crate_song_id, v_current.sha256, p_sha256
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  INSERT INTO public.crate_quality_reviews (
    listing_id, source_bucket, source_path, sha256, size_bytes, mime_type,
    reviewer_id, verdict, notes
  )
  VALUES (
    (SELECT source_listing_id FROM public.crate_songs WHERE id = p_crate_song_id),
    v_current.storage_bucket, v_current.storage_path, v_current.sha256,
    v_current.size_bytes, v_current.mime_type, p_reviewer_id, p_verdict,
    COALESCE(p_notes, 'Review of the captured object, promoting a backfilled capture.')
  )
  RETURNING id INTO v_review_id;

  -- A failed review leaves the song exactly as it was: still backfilled, still
  -- buyer-invisible. The review row stands as the record that someone looked.
  IF p_verdict = 'failed' THEN
    RETURN v_review_id;
  END IF;

  -- The promoted artifact is a SUCCESSOR, not an edit: same bytes, same path,
  -- now resting on a human review instead of an attestation.
  INSERT INTO public.crate_song_artifacts (
    crate_song_id, role, storage_bucket, storage_path, sha256, size_bytes,
    mime_type, source_bucket, source_path, status, captured_by,
    quality_review_id, supersedes_artifact_id, chain_version, supersedes_version
  )
  VALUES (
    p_crate_song_id, 'review_playback', v_current.storage_bucket, v_current.storage_path,
    v_current.sha256, v_current.size_bytes, v_current.mime_type,
    v_current.source_bucket, v_current.source_path, 'verified', p_reviewer_id,
    v_review_id, v_current.id, v_current.chain_version + 1, v_current.chain_version
  )
  RETURNING id INTO v_new_id;

  UPDATE public.crate_song_current_artifacts
     SET artifact_id = v_new_id, updated_at = now()
   WHERE crate_song_id = p_crate_song_id AND role = 'review_playback';

  INSERT INTO public.crate_song_events (crate_song_id, lifecycle_version_after, kind, actor, detail)
  VALUES (p_crate_song_id, v_song.lifecycle_version, 'backfill_promoted_by_review', p_reviewer_id,
          jsonb_build_object('quality_review_id', v_review_id,
                             'superseded_artifact_id', v_current.id,
                             'backfill_attestation_id', v_current.backfill_attestation_id));

  RETURN v_review_id;
END;
$$;

-- M1: reacquire the membership 248 released before transferring ownership.
GRANT funun_crate_evidence TO CURRENT_USER;

ALTER FUNCTION public.crate_review_captured_artifact(UUID, TEXT, UUID, TEXT, TEXT)
  OWNER TO funun_crate_evidence;
REVOKE ALL ON FUNCTION public.crate_review_captured_artifact(UUID, TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crate_review_captured_artifact(UUID, TEXT, UUID, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.crate_review_captured_artifact(UUID, TEXT, UUID, TEXT, TEXT) IS
  'Promotes a backfilled capture by reviewing THE CAPTURED OBJECT, never the live Vault file: the caller hashes the crate-audio copy and this refuses unless it still matches the artifact''s recorded digest. Append-only — the attestation survives as history, the review is a new row, and the reviewed artifact is a new version superseding the attested one.';

REVOKE funun_crate_evidence FROM CURRENT_USER;

COMMIT;

NOTIFY pgrst, 'reload schema';
