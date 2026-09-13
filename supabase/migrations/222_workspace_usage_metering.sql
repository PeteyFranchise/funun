-- ============================================================
-- Funūn — Phase 38.2-02: workspace usage metering.
-- Candidate migration 222. OWNER ACTION REQUIRED.
--
-- HUMAN-GATED: do not apply automatically. This ledger measures beta use;
-- it does not enforce a limit, consume a Member credit, or authorize access.
-- Events contain only an allowlisted metric, quantity, opaque source kind/id,
-- and timestamps — never prompts, contract text, paths, emails, or rights data.
-- ============================================================

CREATE TABLE public.workspace_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  metric TEXT NOT NULL CHECK (metric IN (
    'storage_bytes_ingested',
    'ai_requests',
    'ai_input_tokens',
    'ai_output_tokens',
    'esign_requests',
    'audio_processing_seconds'
  )),
  quantity BIGINT NOT NULL CHECK (quantity > 0),
  idempotency_key TEXT NOT NULL CHECK (
    length(btrim(idempotency_key)) BETWEEN 1 AND 200
    AND idempotency_key = btrim(idempotency_key)
  ),
  source_kind TEXT NOT NULL CHECK (source_kind IN (
    'storage', 'ai', 'esign', 'audio_processing', 'system_adjustment'
  )),
  source_id UUID,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX workspace_usage_events_workspace_metric_time
  ON public.workspace_usage_events (workspace_id, metric, occurred_at DESC);
CREATE INDEX workspace_usage_events_retention_time
  ON public.workspace_usage_events (occurred_at);

ALTER TABLE public.workspace_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_usage_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.workspace_usage_events TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_workspace_usage_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'workspace_usage_events is append-only';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_workspace_usage_event_mutation()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER protect_workspace_usage_events
  BEFORE UPDATE OR DELETE ON public.workspace_usage_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_workspace_usage_event_mutation();

CREATE OR REPLACE FUNCTION public.record_workspace_usage(
  p_workspace_id UUID,
  p_metric TEXT,
  p_quantity BIGINT,
  p_idempotency_key TEXT,
  p_source_kind TEXT,
  p_source_id UUID DEFAULT NULL,
  p_actor_user_id UUID DEFAULT NULL,
  p_occurred_at TIMESTAMPTZ DEFAULT now()
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inserted UUID;
BEGIN
  IF p_metric NOT IN (
    'storage_bytes_ingested', 'ai_requests', 'ai_input_tokens',
    'ai_output_tokens', 'esign_requests', 'audio_processing_seconds'
  ) OR p_source_kind NOT IN (
    'storage', 'ai', 'esign', 'audio_processing', 'system_adjustment'
  ) OR p_quantity <= 0
    OR p_idempotency_key IS NULL
    OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200
    OR p_idempotency_key <> btrim(p_idempotency_key)
    OR p_occurred_at IS NULL
    OR p_occurred_at > now() + interval '5 minutes' THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.workspace_usage_events (
    workspace_id, metric, quantity, idempotency_key, source_kind,
    source_id, actor_user_id, occurred_at
  ) VALUES (
    p_workspace_id, p_metric, p_quantity, p_idempotency_key, p_source_kind,
    p_source_id, p_actor_user_id, p_occurred_at
  )
  ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_inserted;

  RETURN v_inserted IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.record_workspace_usage(UUID, TEXT, BIGINT, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_workspace_usage(UUID, TEXT, BIGINT, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ)
  TO service_role;

CREATE OR REPLACE FUNCTION public.workspace_usage_summary(
  p_workspace_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
) RETURNS TABLE(metric TEXT, total_quantity BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to
     OR p_to - p_from > interval '370 days' THEN
    RAISE EXCEPTION 'workspace usage range must be positive and no longer than 370 days';
  END IF;

  RETURN QUERY
  SELECT e.metric, sum(e.quantity)::BIGINT
  FROM public.workspace_usage_events e
  WHERE e.workspace_id = p_workspace_id
    AND e.occurred_at >= p_from
    AND e.occurred_at < p_to
  GROUP BY e.metric
  ORDER BY e.metric;
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_usage_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_usage_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  TO service_role;

COMMENT ON TABLE public.workspace_usage_events IS
  'D-47 beta-only workspace usage observations. Append-only, idempotent, service-only, and never an authorization or billing-enforcement source.';
COMMENT ON FUNCTION public.record_workspace_usage(UUID, TEXT, BIGINT, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ) IS
  'Best-effort idempotent usage recorder. Returns false for invalid or duplicate observations; callers must never block creative work on this result.';
COMMENT ON FUNCTION public.workspace_usage_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Service-only bounded aggregate for the workspace plan surface. Maximum range is 370 days.';

NOTIFY pgrst, 'reload schema';
