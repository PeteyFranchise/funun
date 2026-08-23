-- Migration 123: crash-recoverable background-job leases (audit #6)
--
-- A worker can die after claim_next_job() marks a row processing. Migration
-- 118 had no lease or claim identity, so that row stayed active forever and
-- its dedup_key prevented replacement work. Add a bounded lease, fence every
-- worker with a fresh claim_token, and reclaim expired work before each claim.
--
-- HUMAN-GATED PUSH. Deploy the app companion with this migration. Scheduling
-- /api/cron/process-jobs remains a separate owner/Vercel-plan decision.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS claim_token UUID,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

-- Rows stranded by the pre-lease implementation are immediately recoverable.
UPDATE public.jobs
   SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
       started_at = CASE WHEN attempts >= max_attempts THEN started_at ELSE NULL END,
       finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END,
       result = jsonb_build_object('error', 'job claim recovered during lease migration'),
       claim_token = NULL,
       lease_expires_at = NULL
 WHERE status = 'processing';

DROP FUNCTION IF EXISTS public.claim_next_job(TEXT);

CREATE FUNCTION public.claim_next_job(
  p_type TEXT DEFAULT NULL,
  p_lease_seconds INT DEFAULT 120
)
RETURNS SETOF public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim_token UUID := gen_random_uuid();
BEGIN
  IF p_lease_seconds < 15 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'p_lease_seconds must be between 15 and 900'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Reclaim crashed/timed-out workers. Exhausted jobs become terminal; work
  -- with attempts remaining returns to pending and can be claimed below.
  UPDATE public.jobs
     SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
         started_at = CASE WHEN attempts >= max_attempts THEN started_at ELSE NULL END,
         finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END,
         result = jsonb_build_object('error', 'job lease expired'),
         claim_token = NULL,
         lease_expires_at = NULL
   WHERE status = 'processing'
     AND (lease_expires_at IS NULL OR lease_expires_at <= now());

  RETURN QUERY
  UPDATE public.jobs j
     SET status = 'processing',
         started_at = now(),
         finished_at = NULL,
         attempts = j.attempts + 1,
         claim_token = v_claim_token,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds)
   WHERE j.id = (
     SELECT c.id
       FROM public.jobs c
      WHERE c.status = 'pending'
        AND c.attempts < c.max_attempts
        AND (p_type IS NULL OR c.type = p_type)
      ORDER BY c.created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
   )
  RETURNING j.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_next_job(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_job(TEXT, INT) TO service_role;

NOTIFY pgrst, 'reload schema';
