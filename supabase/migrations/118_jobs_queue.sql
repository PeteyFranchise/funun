-- Migration 118: durable background-job queue (audit #5 / #10)
--
-- Heavy work (watermark-preview rendering #5, vault-export assembly #10) ran
-- inside the web request — fire-and-forget promises that a frozen serverless
-- instance could drop, and 10s-bounded inline assembly that timed out. This is
-- the shared queue those move to: enqueue a job, a Vercel Cron worker route
-- (every minute on Pro) claims + runs it off the request path, the client polls
-- status.
--
-- claim_next_job() uses FOR UPDATE SKIP LOCKED so concurrent worker invocations
-- never grab the same job. Idempotent enqueue is enforced by a partial unique
-- index on dedup_key for active (pending/processing) jobs — two viewers of the
-- same Selects track can't start two renders.
--
-- HUMAN-GATED PUSH. The worker only runs once Vercel Pro's frequent cron is
-- live + the vercel.json entry is deployed; until then jobs simply queue.

CREATE TABLE IF NOT EXISTS public.jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  dedup_key    TEXT,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  result       JSONB,
  attempts     INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ
);

-- At most ONE active job per dedup_key (idempotent enqueue).
CREATE UNIQUE INDEX IF NOT EXISTS jobs_active_dedup
  ON public.jobs (dedup_key)
  WHERE status IN ('pending', 'processing') AND dedup_key IS NOT NULL;

-- Fast claim of the oldest pending job.
CREATE INDEX IF NOT EXISTS jobs_pending_created
  ON public.jobs (created_at)
  WHERE status = 'pending';

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (worker + enqueue helpers + status route)
-- touches this table. Clients read job status through an ownership-checked API
-- route, never PostgREST directly.
REVOKE ALL ON public.jobs FROM authenticated, anon;

-- Atomically claim the oldest pending job (or one matching p_type when given),
-- flipping it to 'processing'. SKIP LOCKED lets multiple worker invocations run
-- without ever claiming the same row. Returns the claimed row, or nothing.
CREATE OR REPLACE FUNCTION public.claim_next_job(p_type TEXT DEFAULT NULL)
RETURNS SETOF public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.jobs j
     SET status = 'processing',
         started_at = now(),
         attempts = j.attempts + 1
   WHERE j.id = (
     SELECT c.id
       FROM public.jobs c
      WHERE c.status = 'pending'
        AND (p_type IS NULL OR c.type = p_type)
      ORDER BY c.created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
   )
  RETURNING j.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_next_job(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_job(TEXT) TO service_role;
