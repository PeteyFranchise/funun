-- Migration 175: durable admission for application-buffered multipart uploads.

CREATE TABLE public.upload_admission_claims (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation         TEXT NOT NULL CHECK (char_length(operation) BETWEEN 1 AND 80),
  idempotency_key   UUID NOT NULL,
  declared_bytes    BIGINT NOT NULL CHECK (declared_bytes > 0),
  usage_day         DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::DATE,
  lease_expires_at  TIMESTAMPTZ NOT NULL,
  finished_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX idx_upload_admission_daily
  ON public.upload_admission_claims (user_id, usage_day, created_at);
CREATE INDEX idx_upload_admission_retention
  ON public.upload_admission_claims (created_at);
CREATE INDEX idx_upload_admission_active
  ON public.upload_admission_claims (user_id, lease_expires_at)
  WHERE finished_at IS NULL;

ALTER TABLE public.upload_admission_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upload_admission_claims FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_upload_admission(
  p_operation TEXT,
  p_declared_bytes BIGINT,
  p_daily_count_limit INTEGER,
  p_daily_byte_limit BIGINT,
  p_concurrency_limit INTEGER,
  p_idempotency_key UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_day DATE := (now() AT TIME ZONE 'UTC')::DATE;
  v_claim_id UUID;
  v_count INTEGER;
  v_bytes BIGINT;
  v_active INTEGER;
  v_count_limit INTEGER := LEAST(GREATEST(p_daily_count_limit, 1), 100);
  v_byte_limit BIGINT := LEAST(GREATEST(p_daily_byte_limit, 1048576), 2147483648);
  v_concurrency_limit INTEGER := LEAST(GREATEST(p_concurrency_limit, 1), 4);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(BTRIM(p_operation), '') IS NULL OR char_length(p_operation) > 80
     OR p_declared_bytes <= 0 OR p_declared_bytes > 268435456
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'invalid_upload_admission' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('upload:' || v_uid::TEXT || ':' || v_day::TEXT, 0));

  SELECT id INTO v_claim_id
  FROM public.upload_admission_claims
  WHERE user_id = v_uid AND idempotency_key = p_idempotency_key;
  IF v_claim_id IS NOT NULL THEN
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'duplicate', 'claimId', v_claim_id);
  END IF;

  UPDATE public.upload_admission_claims
  SET finished_at = lease_expires_at
  WHERE user_id = v_uid AND finished_at IS NULL AND lease_expires_at <= now();

  SELECT count(*)::INTEGER INTO v_active
  FROM public.upload_admission_claims
  WHERE user_id = v_uid AND finished_at IS NULL AND lease_expires_at > now();
  IF v_active >= v_concurrency_limit THEN
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'concurrency');
  END IF;

  SELECT count(*)::INTEGER, COALESCE(sum(declared_bytes), 0)
  INTO v_count, v_bytes
  FROM public.upload_admission_claims
  WHERE user_id = v_uid AND usage_day = v_day;
  IF v_count >= v_count_limit OR v_bytes + p_declared_bytes > v_byte_limit THEN
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'daily_limit');
  END IF;

  INSERT INTO public.upload_admission_claims (
    user_id, operation, idempotency_key, declared_bytes, usage_day, lease_expires_at
  ) VALUES (
    v_uid,
    BTRIM(p_operation),
    p_idempotency_key,
    p_declared_bytes,
    v_day,
    now() + interval '90 seconds'
  ) RETURNING id INTO v_claim_id;

  -- Claims are only needed for abuse investigation and daily accounting.
  DELETE FROM public.upload_admission_claims
  WHERE created_at < now() - interval '90 days';

  RETURN jsonb_build_object('allowed', TRUE, 'claimId', v_claim_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_upload_admission(p_claim_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.upload_admission_claims
  SET finished_at = now()
  WHERE id = p_claim_id AND user_id = auth.uid() AND finished_at IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_upload_admission(TEXT, BIGINT, INTEGER, BIGINT, INTEGER, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_upload_admission(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_upload_admission(TEXT, BIGINT, INTEGER, BIGINT, INTEGER, UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_upload_admission(UUID)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
