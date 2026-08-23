-- Migration 125: bound durable rate-limit storage and validate RPC inputs

ALTER TABLE public.rate_limit_hits
  ADD COLUMN expires_at TIMESTAMPTZ;

UPDATE public.rate_limit_hits
SET expires_at = hit_at + INTERVAL '24 hours'
WHERE expires_at IS NULL;

ALTER TABLE public.rate_limit_hits
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX idx_rate_limit_hits_expiry
  ON public.rate_limit_hits (expires_at);

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
  v_key TEXT := BTRIM(p_key);
BEGIN
  IF v_key IS NULL OR v_key = '' OR char_length(v_key) > 256 THEN
    RAISE EXCEPTION 'rate-limit key must contain 1 to 256 characters';
  END IF;

  IF p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'rate-limit window must be between 1 and 86400 seconds';
  END IF;

  IF p_max IS NULL OR p_max < 1 OR p_max > 10000 THEN
    RAISE EXCEPTION 'rate-limit maximum must be between 1 and 10000';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_key));

  DELETE FROM public.rate_limit_hits
  WHERE key = v_key
    AND expires_at <= NOW();

  SELECT count(*) INTO v_count
  FROM public.rate_limit_hits
  WHERE key = v_key
    AND hit_at >= NOW() - make_interval(secs => p_window_seconds);

  IF v_count >= p_max THEN
    RETURN TRUE;
  END IF;

  INSERT INTO public.rate_limit_hits (key, hit_at, expires_at)
  VALUES (v_key, NOW(), NOW() + make_interval(secs => p_window_seconds));
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_hits(
  p_batch_size INT DEFAULT 10000
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted INT;
BEGIN
  IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 50000 THEN
    RAISE EXCEPTION 'cleanup batch size must be between 1 and 50000';
  END IF;

  DELETE FROM public.rate_limit_hits
  WHERE ctid IN (
    SELECT ctid
    FROM public.rate_limit_hits
    WHERE expires_at <= NOW()
    ORDER BY expires_at
    LIMIT p_batch_size
  );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_rate_limit_hits(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_hits(INT) TO service_role;
