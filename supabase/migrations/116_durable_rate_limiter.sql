-- Migration 116: durable, shared rate limiter (audit #7)
--
-- The app's rate limiter lived in a single serverless instance's memory: each
-- instance had its own counter, cold starts reset them, and an attacker could
-- spread requests across instances to bypass the limit entirely. It guards
-- signup / invite / waitlist / registration, so those guards were largely
-- theatre. This moves the count into ONE shared place all instances see.
--
-- rate_limit_hits: one row per recorded attempt. The RPC prunes a key's expired
-- rows on each call (active keys self-clean); a global sweep is optional and can
-- be added as a cron later if the table grows.
--
-- check_rate_limit(key, window_seconds, max): atomically (per-key advisory lock)
-- prune + count the window; if already at/over max return TRUE without recording
-- the blocked attempt, else record this attempt and return FALSE. SECURITY
-- DEFINER + service-role-only EXECUTE — the app calls it via the service client.
--
-- HUMAN-GATED PUSH. Until pushed, checkRateLimit() fails OPEN (the RPC errors →
-- treated as not-limited), i.e. no worse than today's ineffective limiter; once
-- pushed, limits are enforced across all instances. Ship the app change with or
-- before this migration.

CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  key    TEXT NOT NULL,
  hit_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_key_time
  ON public.rate_limit_hits (key, hit_at);

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
-- No RLS policies + explicit REVOKE: authenticated/anon can never read or write
-- this table. It is reached only through check_rate_limit() under service_role.
REVOKE ALL ON public.rate_limit_hits FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_window_seconds INT,
  p_max INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Serialize concurrent calls for the SAME key so prune→count→insert is atomic
  -- (else two simultaneous requests could both read count<max and both insert,
  -- allowing max+concurrency). Transaction-scoped; auto-released at commit.
  PERFORM pg_advisory_xact_lock(hashtext(p_key));

  DELETE FROM public.rate_limit_hits
    WHERE key = p_key
      AND hit_at < now() - make_interval(secs => p_window_seconds);

  SELECT count(*) INTO v_count
    FROM public.rate_limit_hits
    WHERE key = p_key
      AND hit_at >= now() - make_interval(secs => p_window_seconds);

  IF v_count >= p_max THEN
    RETURN TRUE;  -- at/over the limit — do NOT record the blocked attempt
  END IF;

  INSERT INTO public.rate_limit_hits (key, hit_at) VALUES (p_key, now());
  RETURN FALSE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) TO service_role;
