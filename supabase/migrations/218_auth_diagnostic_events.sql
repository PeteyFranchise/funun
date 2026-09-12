-- HUMAN-GATED MIGRATION — DO NOT APPLY WITHOUT THE OWNER'S EXPLICIT APPROVAL.
-- Privacy-safe authentication diagnostics. This table intentionally contains
-- no user ID, email, IP, user-agent, URL, provider message, credential, or token.

BEGIN;

CREATE TABLE public.auth_diagnostic_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id text NOT NULL UNIQUE,
  event_code text NOT NULL,
  stage text NOT NULL,
  surface text NOT NULL,
  workspace_intent text,
  runtime text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_diagnostic_events_correlation_format
    CHECK (correlation_id ~ '^AUTH-[A-F0-9]{12}$'),
  CONSTRAINT auth_diagnostic_events_code_allowed CHECK (event_code IN (
    'sign_in_failed', 'signup_failed', 'invitation_claim_failed',
    'recovery_request_failed', 'recovery_verify_failed', 'password_update_failed',
    'signout_failed', 'account_switch_signout_failed',
    'callback_client_failed', 'callback_exchange_failed'
  )),
  CONSTRAINT auth_diagnostic_events_stage_allowed CHECK (stage IN (
    'credentials', 'invitation_claim', 'recovery_request', 'recovery_verification',
    'password_change', 'session_cleanup', 'callback_initialization', 'code_exchange'
  )),
  CONSTRAINT auth_diagnostic_events_surface_allowed CHECK (surface IN (
    'signin', 'signup', 'forgot_password', 'update_password', 'auth_callback', 'account_menu'
  )),
  CONSTRAINT auth_diagnostic_events_workspace_allowed
    CHECK (workspace_intent IS NULL OR workspace_intent IN ('personal', 'team')),
  CONSTRAINT auth_diagnostic_events_runtime_allowed CHECK (runtime IN ('browser', 'server'))
);

CREATE INDEX auth_diagnostic_events_created_at_idx
  ON public.auth_diagnostic_events (created_at DESC);
CREATE INDEX auth_diagnostic_events_code_created_at_idx
  ON public.auth_diagnostic_events (event_code, created_at DESC);

ALTER TABLE public.auth_diagnostic_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.auth_diagnostic_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.auth_diagnostic_events TO service_role;

CREATE OR REPLACE FUNCTION public.prune_auth_diagnostic_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.auth_diagnostic_events
  WHERE created_at < now() - interval '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_auth_diagnostic_events()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prune_auth_diagnostic_events()
  TO service_role;

COMMENT ON TABLE public.auth_diagnostic_events IS
  'Privacy-safe auth failure telemetry. Allowlisted operational fields only; 30-day retention is enforced by a service-only scheduled cleanup.';

COMMIT;
