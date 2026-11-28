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
  p_listing_id   UUID,
  p_bucket       TEXT,
  p_path         TEXT,
  p_sha256       TEXT,
  p_size_bytes   BIGINT,
  p_mime_type    TEXT,
  p_captured_by  UUID
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
  v_review       public.crate_quality_reviews%ROWTYPE;
  v_listing      public.sync_listings%ROWTYPE;
  v_title        TEXT;
  v_artist_name  TEXT;
  v_artifact_id  UUID;
BEGIN
  -- M4 (review 2026-11-28): THE CALLER SUPPLIES ONLY WHAT IT ALONE CAN KNOW.
  -- The previous signature accepted the track, project, payee, title and artist
  -- name from the caller, so a service-role caller — and service_role is shared
  -- by ordinary application code — could attach any song's identity to any
  -- listing. Everything derivable is now derived HERE. What remains from the
  -- caller is the digest of the bytes it uploaded (Postgres cannot read Storage)
  -- and the acting staff id, for which service_role is the trusted attester.
  --
  -- M3: the listing row is locked FIRST, which is also step 1 of the global lock
  -- order, so a concurrent assessment advance and this capture cannot interleave
  -- into a cycle.
  SELECT * INTO v_listing FROM public.sync_listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing % does not exist', p_listing_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- M4: capture belongs to the admission decision, so the listing must be at the
  -- point of decision. Previously any status was accepted.
  IF v_listing.status <> 'pending_admit' THEN
    RAISE EXCEPTION 'listing % is %, not pending_admit; capture belongs to the admission decision',
      p_listing_id, v_listing.status USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- M4: the destination is not the caller's to choose.
  IF p_bucket <> 'crate-audio' THEN
    RAISE EXCEPTION 'captured artifacts live in crate-audio, not %', p_bucket
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_path IS NULL OR p_path !~ ('^captured/' || p_listing_id::text || '/') THEN
    RAISE EXCEPTION 'captured path % is not inside this listing''s prefix', p_path
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- M3 SCENARIO A: the CURRENT review is selected here rather than accepted as
  -- an argument. Previously the caller passed a review id and this function
  -- validated only that row, so a passing review already superseded by a later
  -- FAILING one still authorised capture.
  SELECT * INTO v_review
    FROM public.crate_quality_reviews
   WHERE listing_id = p_listing_id
   ORDER BY reviewed_at DESC, id DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing % has no quality review', p_listing_id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_review.provenance <> 'reviewed' THEN
    RAISE EXCEPTION 'the current record for listing % is %, not a review, and cannot authorise capture',
      p_listing_id, v_review.provenance USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_review.verdict <> 'passed' THEN
    RAISE EXCEPTION 'the current review for listing % did not pass', p_listing_id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- THE COMPARISON THIS WHOLE SLICE EXISTS FOR. The caller hashed the bytes it
  -- actually copied; the review holds the digest a human approved.
  IF p_sha256 IS DISTINCT FROM v_review.sha256 THEN
    RAISE EXCEPTION
      'captured bytes do not match the reviewed bytes for listing % (reviewed %, captured %)',
      p_listing_id, v_review.sha256, p_sha256
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF p_size_bytes IS DISTINCT FROM v_review.size_bytes THEN
    RAISE EXCEPTION 'captured size % does not match the reviewed size %',
      p_size_bytes, v_review.size_bytes USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- M3 SCENARIO B: idempotency is EXACT REPLAY, not "something exists". The old
  -- version returned any existing song before validating anything, so a retry
  -- could admit on stale captured bytes. A row that exists but holds different
  -- bytes is a conflict, not a success.
  SELECT * INTO v_existing FROM public.crate_songs WHERE source_listing_id = p_listing_id;
  IF FOUND THEN
    SELECT a.sha256 INTO v_existing_sha
      FROM public.crate_song_current_artifacts c
      JOIN public.crate_song_artifacts a
        ON a.id = c.artifact_id
     WHERE c.crate_song_id = v_existing.id AND c.role = 'review_playback';
    IF v_existing_sha IS DISTINCT FROM p_sha256 THEN
      RAISE EXCEPTION
        'listing % is already captured as song % holding different bytes (% vs %)',
        p_listing_id, v_existing.id, v_existing_sha, p_sha256
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN v_existing.id;
  END IF;

  -- Derived, not supplied.
  SELECT t.title INTO v_title FROM public.tracks t WHERE t.id = v_listing.track_id;
  SELECT u.artist_name INTO v_artist_name
    FROM public.user_profiles u WHERE u.id = v_listing.artist_user_id;

  INSERT INTO public.crate_songs (
    source_track_id, source_project_id, source_listing_id,
    title, primary_artist_name, payee_user_id, captured_by, lifecycle_state
  )
  VALUES (
    v_listing.track_id, v_listing.vault_project_id, p_listing_id,
    COALESCE(v_title, 'Untitled'), COALESCE(v_artist_name, ''),
    v_listing.artist_user_id, p_captured_by, 'draft'
  )
  RETURNING id INTO v_song_id;

  INSERT INTO public.crate_song_artifacts (
    crate_song_id, role, storage_bucket, storage_path, sha256, size_bytes,
    mime_type, source_bucket, source_path, status, captured_by, quality_review_id
  )
  VALUES (
    v_song_id, 'review_playback', p_bucket, p_path, p_sha256, p_size_bytes,
    p_mime_type, v_review.source_bucket, v_review.source_path, 'verified',
    p_captured_by, v_review.id
  )
  RETURNING id INTO v_artifact_id;

  INSERT INTO public.crate_song_current_artifacts (crate_song_id, role, artifact_id)
  VALUES (v_song_id, 'review_playback', v_artifact_id);

  INSERT INTO public.crate_song_events (crate_song_id, lifecycle_version_after, kind, actor, detail)
  VALUES (v_song_id, 0, 'captured', p_captured_by,
          jsonb_build_object('listing_id', p_listing_id, 'quality_review_id', v_review.id));

  RETURN v_song_id;
END;
$$;

-- M1 (review 2026-11-28): REACQUIRE THE MEMBERSHIP. 248 grants
-- funun_crate_evidence to CURRENT_USER, transfers ownership, then REVOKES it
-- again. PostgreSQL requires the executor to be able to SET ROLE to the new
-- owner, so without this every ALTER FUNCTION ... OWNER TO below fails on a
-- hosted runner that has no superuser bypass.
GRANT funun_crate_evidence TO CURRENT_USER;

ALTER FUNCTION public.crate_capture_admitted_song(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, UUID)
  OWNER TO funun_crate_evidence;

REVOKE ALL ON FUNCTION public.crate_capture_admitted_song(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crate_capture_admitted_song(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, UUID)
  TO service_role;

COMMENT ON FUNCTION public.crate_capture_admitted_song(
  UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, UUID
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
  -- M2 (review 2026-11-28): REFUSE TO QUEUE A LIVE ARTIFACT. Two concurrent
  -- admissions of one listing used to share a destination path, so the loser
  -- enqueued for deletion the very object holding the WINNER's required
  -- review_playback. Per-attempt paths now make the collision unlikely; this
  -- check makes the deletion impossible, which is the half that must not depend
  -- on getting path generation right.
  IF EXISTS (
    SELECT 1 FROM public.crate_song_artifacts
     WHERE storage_bucket = p_bucket AND storage_path = p_path
  ) THEN
    RAISE EXCEPTION 'refusing to queue %/% for deletion: a captured artifact references it',
      p_bucket, p_path USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- M5: a NEW INCARNATION of a previously seen path is a fresh job. Reviving
  -- only 'deleted' left a reused path stuck at failed_terminal forever, and a
  -- revived row kept its old attempts, lease and error, so it could return
  -- straight to terminal handling or carry a stale lease. Everything resets
  -- except lease_generation, which must only ever increase or a fenced-out
  -- worker could have its late result accepted.
  INSERT INTO public.crate_capture_orphans (storage_bucket, storage_path)
  VALUES (p_bucket, p_path)
  ON CONFLICT (storage_bucket, storage_path) DO UPDATE
    SET state            = 'pending',
        attempts         = 0,
        last_error       = NULL,
        lease_owner      = NULL,
        lease_expires_at = NULL,
        lease_generation = public.crate_capture_orphans.lease_generation + 1,
        enqueued_at      = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

ALTER FUNCTION public.crate_enqueue_capture_orphan(TEXT, TEXT) OWNER TO funun_crate_evidence;
REVOKE ALL ON FUNCTION public.crate_enqueue_capture_orphan(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crate_enqueue_capture_orphan(TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.crate_enqueue_capture_orphan(TEXT, TEXT) IS
  'Records a copied object left behind by a failed capture. Refuses any path a captured artifact references, so a concurrent loser can never queue the winner''s live review_playback for deletion. A reused path is reset to a fresh job, except lease_generation which only increases so a fenced-out worker''s late result is still rejected.';

REVOKE funun_crate_evidence FROM CURRENT_USER;

COMMIT;

NOTIFY pgrst, 'reload schema';
