-- Migration 173: durable paid-AI admission and bounded Selects telemetry

-- ─── Paid AI admission ledger ─────────────────────────────────────────

CREATE TABLE public.ai_usage_claims (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation         TEXT NOT NULL CHECK (char_length(operation) BETWEEN 1 AND 80),
  idempotency_key   UUID NOT NULL,
  units             INTEGER NOT NULL CHECK (units BETWEEN 1 AND 20),
  usage_day         DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::DATE,
  lease_expires_at  TIMESTAMPTZ NOT NULL,
  finished_at       TIMESTAMPTZ,
  succeeded         BOOLEAN,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX idx_ai_usage_claims_daily
  ON public.ai_usage_claims (user_id, usage_day, created_at);
CREATE INDEX idx_ai_usage_claims_global_daily
  ON public.ai_usage_claims (usage_day, created_at);
CREATE INDEX idx_ai_usage_claims_retention
  ON public.ai_usage_claims (created_at);
CREATE INDEX idx_ai_usage_claims_active
  ON public.ai_usage_claims (user_id, lease_expires_at)
  WHERE finished_at IS NULL;

ALTER TABLE public.ai_usage_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_claims FROM PUBLIC, anon, authenticated;

CREATE TABLE public.ai_usage_policy (
  singleton                 BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  enabled                   BOOLEAN NOT NULL DEFAULT TRUE,
  global_daily_unit_limit   INTEGER NOT NULL DEFAULT 10000
    CHECK (global_daily_unit_limit BETWEEN 1 AND 1000000),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.ai_usage_policy (singleton) VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.ai_usage_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_policy FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_ai_usage(
  p_operation TEXT,
  p_units INTEGER,
  p_daily_limit INTEGER,
  p_concurrency_limit INTEGER,
  p_idempotency_key UUID,
  p_lease_seconds INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_day DATE := (now() AT TIME ZONE 'UTC')::DATE;
  v_used INTEGER := 0;
  v_active INTEGER := 0;
  v_claim_id UUID;
  v_daily_limit INTEGER := LEAST(GREATEST(p_daily_limit, 1), 50);
  v_concurrency_limit INTEGER := LEAST(GREATEST(p_concurrency_limit, 1), 4);
  v_global_used INTEGER := 0;
  v_global_limit INTEGER;
  v_enabled BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(BTRIM(p_operation), '') IS NULL OR char_length(p_operation) > 80
     OR p_units < 1 OR p_units > 20
     OR p_idempotency_key IS NULL
     OR p_lease_seconds < 15 OR p_lease_seconds > 300 THEN
    RAISE EXCEPTION 'invalid_ai_usage_claim' USING ERRCODE = '22023';
  END IF;

  -- All claims take the global lock first and then the per-user lock. This
  -- makes the platform kill switch/daily ceiling race-safe without deadlocks.
  PERFORM pg_advisory_xact_lock(hashtextextended('ai-global:' || v_day::TEXT, 0));
  SELECT enabled, global_daily_unit_limit INTO v_enabled, v_global_limit
  FROM public.ai_usage_policy
  WHERE singleton = TRUE;
  IF NOT COALESCE(v_enabled, FALSE) THEN
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'global_limit');
  END IF;

  SELECT COALESCE(sum(units), 0)::INTEGER INTO v_global_used
  FROM public.ai_usage_claims
  WHERE usage_day = v_day;
  IF v_global_used + p_units > v_global_limit THEN
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'global_limit');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::TEXT || ':' || v_day::TEXT, 0));

  SELECT id INTO v_claim_id
  FROM public.ai_usage_claims
  WHERE user_id = v_uid AND idempotency_key = p_idempotency_key;
  IF v_claim_id IS NOT NULL THEN
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'duplicate', 'claimId', v_claim_id);
  END IF;

  UPDATE public.ai_usage_claims
  SET finished_at = lease_expires_at,
      succeeded = FALSE
  WHERE user_id = v_uid
    AND finished_at IS NULL
    AND lease_expires_at <= now();

  SELECT count(*)::INTEGER INTO v_active
  FROM public.ai_usage_claims
  WHERE user_id = v_uid
    AND finished_at IS NULL
    AND lease_expires_at > now();
  IF v_active >= v_concurrency_limit THEN
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'concurrency');
  END IF;

  SELECT COALESCE(sum(units), 0)::INTEGER INTO v_used
  FROM public.ai_usage_claims
  WHERE user_id = v_uid AND usage_day = v_day;
  IF v_used + p_units > v_daily_limit THEN
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'daily_limit');
  END IF;

  INSERT INTO public.ai_usage_claims (
    user_id, operation, idempotency_key, units, usage_day, lease_expires_at
  ) VALUES (
    v_uid,
    BTRIM(p_operation),
    p_idempotency_key,
    p_units,
    v_day,
    now() + make_interval(secs => p_lease_seconds)
  ) RETURNING id INTO v_claim_id;

  DELETE FROM public.ai_usage_claims
  WHERE created_at < now() - interval '90 days';

  RETURN jsonb_build_object('allowed', TRUE, 'claimId', v_claim_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_ai_usage(p_claim_id UUID, p_succeeded BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.ai_usage_claims
  SET finished_at = now(), succeeded = p_succeeded
  WHERE id = p_claim_id
    AND user_id = auth.uid()
    AND finished_at IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_usage(TEXT, INTEGER, INTEGER, INTEGER, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_ai_usage(UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_usage(TEXT, INTEGER, INTEGER, INTEGER, UUID, INTEGER)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_ai_usage(UUID, BOOLEAN)
  TO authenticated;

-- ─── Bounded Selects daily aggregates ─────────────────────────────────

CREATE TABLE public.selects_track_engagement_daily (
  selects_id       UUID NOT NULL REFERENCES public.selects(id) ON DELETE CASCADE,
  selects_track_id UUID NOT NULL REFERENCES public.selects_tracks(id) ON DELETE CASCADE,
  viewer_key       TEXT NOT NULL CHECK (char_length(viewer_key) BETWEEN 8 AND 200),
  engagement_day   DATE NOT NULL,
  audible_seconds  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (audible_seconds BETWEEN 0 AND 21600),
  event_count      INTEGER NOT NULL DEFAULT 0 CHECK (event_count BETWEEN 0 AND 10000),
  ended_count      INTEGER NOT NULL DEFAULT 0 CHECK (ended_count BETWEEN 0 AND 1000),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (selects_track_id, viewer_key, engagement_day)
);

CREATE INDEX idx_selects_track_engagement_daily_selects
  ON public.selects_track_engagement_daily (selects_id, engagement_day);

CREATE TABLE public.selects_opens_daily (
  selects_id     UUID NOT NULL REFERENCES public.selects(id) ON DELETE CASCADE,
  viewer_key     TEXT NOT NULL CHECK (char_length(viewer_key) BETWEEN 8 AND 200),
  engagement_day DATE NOT NULL,
  open_count     INTEGER NOT NULL DEFAULT 0 CHECK (open_count BETWEEN 0 AND 100),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (selects_id, viewer_key, engagement_day)
);

ALTER TABLE public.selects_track_engagement_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selects_opens_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.selects_track_engagement_daily FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.selects_opens_daily FROM PUBLIC, anon, authenticated;

-- Preserve the most recent raw history before switching writes to aggregates.
INSERT INTO public.selects_track_engagement_daily (
  selects_id, selects_track_id, viewer_key, engagement_day,
  audible_seconds, event_count, ended_count
)
SELECT
  selects_id,
  selects_track_id,
  COALESCE(NULLIF(viewer_key, ''), 'anonymous'),
  (created_at AT TIME ZONE 'UTC')::DATE,
  LEAST(sum(delta_seconds), 21600),
  LEAST(count(*), 10000)::INTEGER,
  LEAST(count(*) FILTER (WHERE event = 'ended'), 1000)::INTEGER
FROM public.selects_track_engagement
WHERE created_at >= now() - interval '90 days'
GROUP BY selects_id, selects_track_id, COALESCE(NULLIF(viewer_key, ''), 'anonymous'),
  (created_at AT TIME ZONE 'UTC')::DATE
ON CONFLICT (selects_track_id, viewer_key, engagement_day) DO NOTHING;

INSERT INTO public.selects_opens_daily (selects_id, viewer_key, engagement_day, open_count)
SELECT
  selects_id,
  COALESCE(NULLIF(viewer_key, ''), 'anonymous'),
  (opened_at AT TIME ZONE 'UTC')::DATE,
  LEAST(count(*), 100)::INTEGER
FROM public.selects_opens
WHERE opened_at >= now() - interval '90 days'
GROUP BY selects_id, COALESCE(NULLIF(viewer_key, ''), 'anonymous'),
  (opened_at AT TIME ZONE 'UTC')::DATE
ON CONFLICT (selects_id, viewer_key, engagement_day) DO NOTHING;

-- Preserve the superseded raw tables as a read-only historical archive. New
-- writes and readers use the bounded aggregates below. Deleting old raw data
-- is an operational retention decision and must not happen implicitly during
-- a security migration.

CREATE OR REPLACE FUNCTION public.record_selects_engagement_event(
  p_selects_id UUID,
  p_selects_track_id UUID,
  p_viewer_key TEXT,
  p_delta_seconds NUMERIC,
  p_event TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_day DATE := (now() AT TIME ZONE 'UTC')::DATE;
  v_existing BOOLEAN;
  v_rows INTEGER;
BEGIN
  IF p_selects_id IS NULL OR p_event IS NULL
     OR NULLIF(BTRIM(p_viewer_key), '') IS NULL
     OR char_length(BTRIM(p_viewer_key)) NOT BETWEEN 8 AND 200
     OR p_event NOT IN ('open', 'heartbeat', 'pause', 'ended', 'unload') THEN
    RAISE EXCEPTION 'invalid_selects_engagement_event' USING ERRCODE = '22023';
  END IF;
  IF p_event <> 'open' AND (
    p_selects_track_id IS NULL OR p_delta_seconds IS NULL
    OR p_delta_seconds <= 0 OR p_delta_seconds > 15
  ) THEN
    RAISE EXCEPTION 'invalid_selects_engagement_delta' USING ERRCODE = '22023';
  END IF;
  IF p_event <> 'open' AND NOT EXISTS (
    SELECT 1 FROM public.selects_tracks
    WHERE id = p_selects_track_id AND selects_id = p_selects_id AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'selects_track_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_selects_id::TEXT, 0));

  DELETE FROM public.selects_track_engagement_daily
  WHERE selects_id = p_selects_id AND engagement_day < v_day - 90;
  DELETE FROM public.selects_opens_daily
  WHERE selects_id = p_selects_id AND engagement_day < v_day - 90;

  IF p_event = 'open' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.selects_opens_daily
      WHERE selects_id = p_selects_id
        AND viewer_key = BTRIM(p_viewer_key)
        AND engagement_day = v_day
    ) INTO v_existing;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.selects_track_engagement_daily
      WHERE selects_track_id = p_selects_track_id
        AND viewer_key = BTRIM(p_viewer_key)
        AND engagement_day = v_day
    ) INTO v_existing;
  END IF;

  IF NOT v_existing THEN
    SELECT (
      (SELECT count(*) FROM public.selects_track_engagement_daily WHERE selects_id = p_selects_id)
      + (SELECT count(*) FROM public.selects_opens_daily WHERE selects_id = p_selects_id)
    )::INTEGER INTO v_rows;
    IF v_rows >= 10000 THEN
      RAISE EXCEPTION 'selects_engagement_capacity_reached' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF p_event = 'open' THEN
    INSERT INTO public.selects_opens_daily (
      selects_id, viewer_key, engagement_day, open_count
    ) VALUES (
      p_selects_id, BTRIM(p_viewer_key), v_day, 1
    )
    ON CONFLICT (selects_id, viewer_key, engagement_day) DO UPDATE
    SET open_count = LEAST(public.selects_opens_daily.open_count + 1, 100),
        updated_at = now();
  ELSE
    INSERT INTO public.selects_track_engagement_daily (
      selects_id, selects_track_id, viewer_key, engagement_day,
      audible_seconds, event_count, ended_count
    ) VALUES (
      p_selects_id,
      p_selects_track_id,
      BTRIM(p_viewer_key),
      v_day,
      p_delta_seconds,
      1,
      CASE WHEN p_event = 'ended' THEN 1 ELSE 0 END
    )
    ON CONFLICT (selects_track_id, viewer_key, engagement_day) DO UPDATE
    SET audible_seconds = LEAST(
          public.selects_track_engagement_daily.audible_seconds + EXCLUDED.audible_seconds,
          21600
        ),
        event_count = LEAST(public.selects_track_engagement_daily.event_count + 1, 10000),
        ended_count = LEAST(
          public.selects_track_engagement_daily.ended_count + EXCLUDED.ended_count,
          1000
        ),
        updated_at = now();
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.selects_engagement_summaries(p_selects_ids UUID[])
RETURNS TABLE(
  selects_id UUID,
  selects_track_id UUID,
  audible_seconds NUMERIC,
  qualified_listens BIGINT,
  replay_count BIGINT,
  opens BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH viewer_track AS (
    SELECT
      daily.selects_id,
      daily.selects_track_id,
      daily.viewer_key,
      sum(daily.audible_seconds) AS audible_seconds,
      sum(daily.ended_count) AS replay_count
    FROM public.selects_track_engagement_daily daily
    WHERE daily.selects_id = ANY(p_selects_ids)
    GROUP BY daily.selects_id, daily.selects_track_id, daily.viewer_key
  ), track_rollup AS (
    SELECT
      viewer_track.selects_id,
      viewer_track.selects_track_id,
      sum(viewer_track.audible_seconds) AS audible_seconds,
      count(*) FILTER (WHERE viewer_track.audible_seconds >= 30) AS qualified_listens,
      sum(viewer_track.replay_count)::BIGINT AS replay_count
    FROM viewer_track
    GROUP BY viewer_track.selects_id, viewer_track.selects_track_id
  ), open_rollup AS (
    SELECT daily.selects_id, sum(daily.open_count)::BIGINT AS opens
    FROM public.selects_opens_daily daily
    WHERE daily.selects_id = ANY(p_selects_ids)
    GROUP BY daily.selects_id
  )
  SELECT
    COALESCE(track_rollup.selects_id, open_rollup.selects_id),
    track_rollup.selects_track_id,
    COALESCE(track_rollup.audible_seconds, 0),
    COALESCE(track_rollup.qualified_listens, 0),
    COALESCE(track_rollup.replay_count, 0),
    COALESCE(open_rollup.opens, 0)
  FROM track_rollup
  FULL OUTER JOIN open_rollup USING (selects_id)
$$;

-- Persist an AI-generated Selects starter as one transaction. The route
-- validates staff scope before invoking this service-only function; keeping
-- all revives/inserts and the optional cover-note update together prevents a
-- model result from leaving a half-written starter when one row fails.
CREATE OR REPLACE FUNCTION public.persist_selects_ai_draft(
  p_selects_id UUID,
  p_staff_id UUID,
  p_cover_note TEXT,
  p_tracks JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_selects public.selects%ROWTYPE;
  v_item JSONB;
  v_track_id UUID;
  v_reason TEXT;
  v_rights_ready BOOLEAN;
  v_existing public.selects_tracks%ROWTYPE;
  v_next_position INTEGER;
  v_persisted JSONB := '[]'::JSONB;
  v_seen UUID[] := ARRAY[]::UUID[];
BEGIN
  IF p_selects_id IS NULL OR p_staff_id IS NULL
     OR jsonb_typeof(p_tracks) <> 'array'
     OR jsonb_array_length(p_tracks) > 10 THEN
    RAISE EXCEPTION 'invalid_selects_ai_draft' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_selects
  FROM public.selects
  WHERE id = p_selects_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'selects_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(max(position), -1) + 1 INTO v_next_position
  FROM public.selects_tracks
  WHERE selects_id = p_selects_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_tracks)
  LOOP
    BEGIN
      v_track_id := NULLIF(v_item ->> 'trackId', '')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_selects_ai_draft_track' USING ERRCODE = '22023';
    END;
    v_reason := LEFT(NULLIF(BTRIM(v_item ->> 'reason'), ''), 160);
    v_rights_ready := COALESCE((v_item ->> 'rightsReady')::BOOLEAN, FALSE);

    IF v_track_id IS NULL OR v_track_id = ANY(v_seen) THEN
      CONTINUE;
    END IF;
    v_seen := array_append(v_seen, v_track_id);

    SELECT * INTO v_existing
    FROM public.selects_tracks
    WHERE selects_id = p_selects_id AND track_id = v_track_id
    ORDER BY (removed_at IS NULL) DESC, created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.selects_tracks
      SET removed_at = NULL,
          removed_by = NULL,
          note = v_reason
      WHERE id = v_existing.id;
    ELSE
      INSERT INTO public.selects_tracks (
        selects_id, track_id, note, position, added_by, source
      ) VALUES (
        p_selects_id, v_track_id, v_reason, v_next_position, p_staff_id, 'crate'
      );
      v_next_position := v_next_position + 1;
    END IF;

    v_persisted := v_persisted || jsonb_build_array(jsonb_build_object(
      'trackId', v_track_id,
      'reason', COALESCE(v_reason, ''),
      'rightsReady', v_rights_ready
    ));
  END LOOP;

  IF NULLIF(BTRIM(v_selects.cover_note), '') IS NULL
     AND NULLIF(BTRIM(p_cover_note), '') IS NOT NULL THEN
    UPDATE public.selects
    SET cover_note = LEFT(BTRIM(p_cover_note), 800)
    WHERE id = p_selects_id;
    v_selects.cover_note := LEFT(BTRIM(p_cover_note), 800);
  END IF;

  RETURN jsonb_build_object(
    'coverNote', COALESCE(v_selects.cover_note, ''),
    'tracks', v_persisted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_selects_engagement_event(UUID, UUID, TEXT, NUMERIC, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.selects_engagement_summaries(UUID[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.persist_selects_ai_draft(UUID, UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_selects_engagement_event(UUID, UUID, TEXT, NUMERIC, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.selects_engagement_summaries(UUID[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.persist_selects_ai_draft(UUID, UUID, TEXT, JSONB)
  TO service_role;

NOTIFY pgrst, 'reload schema';
