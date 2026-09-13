-- ============================================================
-- Funūn — Phase 38.2-01: workspace billing foundation.
-- Candidate migration 221. OWNER ACTION REQUIRED.
--
-- HUMAN-GATED: do not apply automatically. Run the Phase 38.2 pre-apply
-- gate, apply only in an owner-approved window, then run the post-apply
-- verifier. This migration is additive. It does not alter the Member-level
-- public.subscriptions table, detach projects, delete rights evidence, or
-- create any Stripe customer, checkout, invoice, or charge.
-- ============================================================

CREATE TABLE public.workspace_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  plan_key TEXT NOT NULL DEFAULT 'beta_free'
    CHECK (plan_key IN ('beta_free', 'workspace_starter', 'workspace_growth', 'workspace_custom')),
  status TEXT NOT NULL DEFAULT 'beta_active'
    CHECK (status IN ('beta_active', 'active', 'past_due', 'paused', 'canceled')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_subscription_provider_shape CHECK (
    (plan_key = 'beta_free' AND stripe_subscription_id IS NULL)
    OR plan_key <> 'beta_free'
  )
);

CREATE UNIQUE INDEX workspace_subscriptions_stripe_customer_unique
  ON public.workspace_subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX workspace_subscriptions_stripe_subscription_unique
  ON public.workspace_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX workspace_subscriptions_status
  ON public.workspace_subscriptions (status, updated_at DESC);

ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_subscriptions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.workspace_subscriptions TO service_role;

CREATE TRIGGER workspace_subscriptions_updated_at
  BEFORE UPDATE ON public.workspace_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.workspace_billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  subscription_id UUID NOT NULL REFERENCES public.workspace_subscriptions(id) ON DELETE RESTRICT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('provisioned', 'status_changed', 'plan_changed', 'provider_linked', 'provider_updated', 'provider_unlinked')),
  from_plan_key TEXT,
  to_plan_key TEXT,
  from_status TEXT,
  to_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX workspace_billing_events_workspace_created
  ON public.workspace_billing_events (workspace_id, created_at DESC);

ALTER TABLE public.workspace_billing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_billing_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.workspace_billing_events TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_workspace_billing_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'workspace_billing_events is append-only';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_workspace_billing_event_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER protect_workspace_billing_events
  BEFORE UPDATE OR DELETE ON public.workspace_billing_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_workspace_billing_event_mutation();

CREATE OR REPLACE FUNCTION public.provision_workspace_beta_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subscription_id UUID;
BEGIN
  INSERT INTO public.workspace_subscriptions (workspace_id, plan_key, status)
  VALUES (NEW.id, 'beta_free', 'beta_active')
  ON CONFLICT (workspace_id) DO NOTHING
  RETURNING id INTO v_subscription_id;

  IF v_subscription_id IS NOT NULL THEN
    INSERT INTO public.workspace_billing_events (
      workspace_id, subscription_id, actor_user_id, event_type, to_plan_key, to_status
    ) VALUES (
      NEW.id, v_subscription_id, NEW.created_by, 'provisioned', 'beta_free', 'beta_active'
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_workspace_beta_subscription() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER provision_workspace_beta_subscription_after_insert
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.provision_workspace_beta_subscription();

WITH inserted AS (
  INSERT INTO public.workspace_subscriptions (workspace_id, plan_key, status)
  SELECT w.id, 'beta_free', 'beta_active'
  FROM public.workspaces w
  ON CONFLICT (workspace_id) DO NOTHING
  RETURNING id, workspace_id
)
INSERT INTO public.workspace_billing_events (
  workspace_id, subscription_id, actor_user_id, event_type, to_plan_key, to_status
)
SELECT i.workspace_id, i.id, w.created_by, 'provisioned', 'beta_free', 'beta_active'
FROM inserted i
JOIN public.workspaces w ON w.id = i.workspace_id;

CREATE OR REPLACE FUNCTION public.workspace_writes_allowed(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT s.status IN ('beta_active', 'active')
    FROM public.workspace_subscriptions s
    WHERE s.workspace_id = p_workspace_id
  ), FALSE);
$$;

REVOKE ALL ON FUNCTION public.workspace_writes_allowed(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_writes_allowed(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.set_workspace_billing_state(
  p_workspace_id UUID,
  p_actor_user_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_plan_key TEXT,
  p_status TEXT,
  p_stripe_customer_id TEXT DEFAULT NULL,
  p_stripe_subscription_id TEXT DEFAULT NULL,
  p_current_period_start TIMESTAMPTZ DEFAULT NULL,
  p_current_period_end TIMESTAMPTZ DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current public.workspace_subscriptions%ROWTYPE;
  v_event_type TEXT;
BEGIN
  IF p_plan_key NOT IN ('beta_free', 'workspace_starter', 'workspace_growth', 'workspace_custom')
     OR p_status NOT IN ('beta_active', 'active', 'past_due', 'paused', 'canceled') THEN
    RETURN 'invalid_state';
  END IF;
  IF p_plan_key = 'beta_free' AND p_stripe_subscription_id IS NOT NULL THEN
    RETURN 'invalid_provider_shape';
  END IF;

  SELECT * INTO v_current
  FROM public.workspace_subscriptions
  WHERE workspace_id = p_workspace_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_current.updated_at <> p_expected_updated_at THEN RETURN 'stale'; END IF;

  v_event_type := CASE
    WHEN v_current.plan_key IS DISTINCT FROM p_plan_key THEN 'plan_changed'
    WHEN v_current.status IS DISTINCT FROM p_status THEN 'status_changed'
    WHEN v_current.stripe_customer_id IS NULL AND p_stripe_customer_id IS NOT NULL THEN 'provider_linked'
    WHEN v_current.stripe_customer_id IS NOT NULL AND p_stripe_customer_id IS NULL THEN 'provider_unlinked'
    ELSE NULL
  END;

  IF v_event_type IS NULL
     AND v_current.stripe_customer_id IS NOT DISTINCT FROM p_stripe_customer_id
     AND v_current.stripe_subscription_id IS NOT DISTINCT FROM p_stripe_subscription_id
     AND v_current.current_period_start IS NOT DISTINCT FROM p_current_period_start
     AND v_current.current_period_end IS NOT DISTINCT FROM p_current_period_end THEN
    RETURN 'unchanged';
  END IF;

  UPDATE public.workspace_subscriptions
  SET plan_key = p_plan_key,
      status = p_status,
      stripe_customer_id = p_stripe_customer_id,
      stripe_subscription_id = p_stripe_subscription_id,
      current_period_start = p_current_period_start,
      current_period_end = p_current_period_end
  WHERE id = v_current.id;

  INSERT INTO public.workspace_billing_events (
    workspace_id, subscription_id, actor_user_id, event_type,
    from_plan_key, to_plan_key, from_status, to_status
  ) VALUES (
    p_workspace_id, v_current.id, p_actor_user_id, COALESCE(v_event_type, 'provider_updated'),
    v_current.plan_key, p_plan_key, v_current.status, p_status
  );

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, action, target_type, target_id, changes_redacted
  ) VALUES (
    p_workspace_id, p_actor_user_id, 'workspace.billing.changed',
    'workspace_subscription', v_current.id, true
  );

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.set_workspace_billing_state(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_workspace_billing_state(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
  TO service_role;

COMMENT ON TABLE public.workspace_subscriptions IS
  'D-44/D-45: the workspace billing identity, separate from every Member subscription. beta_free is measured but not enforced. A non-active status makes workspace mutations read-only through workspace_writes_allowed; it never changes personal catalogue access.';
COMMENT ON TABLE public.workspace_billing_events IS
  'Append-only workspace billing lifecycle history. Contains plan/status transitions only, never payment instruments or Member payout/tax data.';
COMMENT ON FUNCTION public.workspace_writes_allowed(UUID) IS
  'D-46 fail-closed write predicate. Missing or lapsed billing state returns false. Reads and personal Member catalogue paths do not call this function.';

NOTIFY pgrst, 'reload schema';
