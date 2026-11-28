-- 251_crate_quality_review_writer.sql
--
-- PHASE 50.5B — the narrow writer for byte-tied quality reviews.
--
-- HUMAN-GATED. Never `supabase db push` from an agent session.
-- DEPENDS ON 248 being applied first.
--
-- WHY THIS IS A SEPARATE MIGRATION. Owner decision 2026-11-27 retired the
-- "exactly two migrations" rule for this umbrella. Each narrow SECURITY DEFINER
-- writer now ships with the slice that owns and tests it, so the SQL, its caller,
-- its permissions and its tests are one reviewable change. The contract migration
-- is allocated LAST, above every expand, because a clean replay runs migrations
-- in number order and a contract numbered below a later expand would tear down
-- transitional schema before that expand's consumers existed.
--
-- WHY A FUNCTION AT ALL. 248 revokes every write privilege on
-- crate_quality_reviews from service_role and transfers ownership to
-- funun_crate_evidence. That is the point: ordinary application code cannot
-- forge or erase evidence. Writes arrive only through functions like this one,
-- owned by the evidence role, with a fixed search_path.

BEGIN;

CREATE OR REPLACE FUNCTION public.crate_record_quality_review(
  p_listing_id    UUID,
  p_source_bucket TEXT,
  p_source_path   TEXT,
  p_sha256        TEXT,
  p_size_bytes    BIGINT,
  p_mime_type     TEXT,
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
  v_id UUID;
BEGIN
  -- Argument validation lives here rather than only in the caller, because a
  -- SECURITY DEFINER function runs with the evidence owner's rights and must not
  -- assume its caller checked anything.
  IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'sha256 must be 64 lowercase hex characters'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_size_bytes IS NULL OR p_size_bytes <= 0 THEN
    RAISE EXCEPTION 'size_bytes must be positive'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_verdict IS NULL OR p_verdict NOT IN ('passed', 'failed') THEN
    RAISE EXCEPTION 'verdict must be passed or failed'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_reviewer_id IS NULL THEN
    RAISE EXCEPTION 'reviewer_id is required: a review with no reviewer is not evidence of a review'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- The listing must exist. A review naming a listing that does not exist is
  -- unanchored evidence.
  IF NOT EXISTS (SELECT 1 FROM public.sync_listings WHERE id = p_listing_id) THEN
    RAISE EXCEPTION 'listing % does not exist', p_listing_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  INSERT INTO public.crate_quality_reviews (
    listing_id, source_bucket, source_path, sha256, size_bytes,
    mime_type, reviewer_id, verdict, notes
  )
  VALUES (
    p_listing_id, p_source_bucket, p_source_path, p_sha256, p_size_bytes,
    p_mime_type, p_reviewer_id, p_verdict, p_notes
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- M1 (review 2026-11-28): REACQUIRE THE MEMBERSHIP. 248 grants
-- funun_crate_evidence to CURRENT_USER, transfers ownership, then REVOKES it
-- again. PostgreSQL requires the executor to be able to SET ROLE to the new
-- owner, so without this every ALTER FUNCTION ... OWNER TO below fails on a
-- hosted runner that has no superuser bypass.
GRANT funun_crate_evidence TO CURRENT_USER;

-- Owned by the evidence role, which is what gives it the rights its callers lack.
ALTER FUNCTION public.crate_record_quality_review(
  UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, UUID, TEXT, TEXT
) OWNER TO funun_crate_evidence;

-- Nobody by default; the application role by exception.
REVOKE ALL ON FUNCTION public.crate_record_quality_review(
  UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crate_record_quality_review(
  UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, UUID, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.crate_record_quality_review(
  UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, UUID, TEXT, TEXT
) IS
  'Records a quality review against the exact bytes reviewed. The ONLY write path into crate_quality_reviews: 248 revokes direct write from service_role. The digest is computed by trusted server code that downloaded and read back the object, because Postgres cannot read Storage; this function validates and records it. A correction is a new row, never an update, enforced by the append-only trigger in 248.';

REVOKE funun_crate_evidence FROM CURRENT_USER;

COMMIT;

NOTIFY pgrst, 'reload schema';
