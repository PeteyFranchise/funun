-- ============================================================
-- Funūn Beta hardening — atomic Stripe Checkout creation
--
-- HUMAN-GATED: do not apply from an executor/agent session. The owner must
-- review, apply, and run the accompanying production verifier explicitly.
-- ============================================================

BEGIN;

ALTER TABLE public.license_requests
  ADD COLUMN checkout_claim_token UUID,
  ADD COLUMN checkout_claimed_at TIMESTAMPTZ,
  ADD COLUMN checkout_economics_fingerprint TEXT,
  ADD COLUMN stripe_checkout_economics_fingerprint TEXT,
  ADD COLUMN stripe_checkout_url TEXT;

ALTER TABLE public.license_requests
  DROP CONSTRAINT IF EXISTS license_requests_payment_status_check;

ALTER TABLE public.license_requests
  ADD CONSTRAINT license_requests_payment_status_check
  CHECK (payment_status IN ('unpaid', 'creating_payment', 'awaiting_payment', 'paid'));

CREATE OR REPLACE FUNCTION public.claim_license_checkout(
  p_deal_id UUID,
  p_claim_token UUID,
  p_economics_fingerprint TEXT,
  p_lease_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
  outcome TEXT,
  checkout_session_id TEXT,
  checkout_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deal public.license_requests%ROWTYPE;
BEGIN
  IF p_deal_id IS NULL OR p_claim_token IS NULL OR NULLIF(BTRIM(p_economics_fingerprint), '') IS NULL THEN
    RAISE EXCEPTION 'deal, claim token, and economics fingerprint are required';
  END IF;
  IF p_lease_seconds < 60 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'claim lease must be between 60 and 900 seconds';
  END IF;

  SELECT * INTO v_deal
  FROM public.license_requests
  WHERE id = p_deal_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  IF v_deal.payment_status = 'paid' THEN
    RETURN QUERY SELECT 'paid'::TEXT, v_deal.stripe_checkout_session_id, v_deal.stripe_checkout_url;
    RETURN;
  END IF;
  IF v_deal.payment_status = 'awaiting_payment'
     AND v_deal.stripe_checkout_economics_fingerprint = p_economics_fingerprint
     AND v_deal.stripe_checkout_session_id IS NOT NULL THEN
    RETURN QUERY SELECT 'existing'::TEXT, v_deal.stripe_checkout_session_id, v_deal.stripe_checkout_url;
    RETURN;
  END IF;
  IF v_deal.payment_status = 'creating_payment'
     AND v_deal.checkout_claimed_at >= NOW() - make_interval(secs => p_lease_seconds) THEN
    RETURN QUERY SELECT 'busy'::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  UPDATE public.license_requests
  SET payment_status = 'creating_payment',
      checkout_claim_token = p_claim_token,
      checkout_claimed_at = NOW(),
      checkout_economics_fingerprint = p_economics_fingerprint
  WHERE id = p_deal_id;

  RETURN QUERY SELECT 'claimed'::TEXT, NULL::TEXT, NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_license_checkout(
  p_deal_id UUID,
  p_claim_token UUID,
  p_economics_fingerprint TEXT,
  p_checkout_session_id TEXT,
  p_checkout_url TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.license_requests
  SET payment_status = 'awaiting_payment',
      stripe_checkout_session_id = p_checkout_session_id,
      stripe_checkout_url = p_checkout_url,
      stripe_checkout_economics_fingerprint = p_economics_fingerprint,
      checkout_claim_token = NULL,
      checkout_claimed_at = NULL,
      checkout_economics_fingerprint = NULL
  WHERE id = p_deal_id
    AND payment_status = 'creating_payment'
    AND checkout_claim_token = p_claim_token
    AND checkout_economics_fingerprint = p_economics_fingerprint;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_license_checkout_claim(
  p_deal_id UUID,
  p_claim_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.license_requests
  SET payment_status = 'unpaid',
      checkout_claim_token = NULL,
      checkout_claimed_at = NULL,
      checkout_economics_fingerprint = NULL
  WHERE id = p_deal_id
    AND payment_status = 'creating_payment'
    AND checkout_claim_token = p_claim_token;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_license_checkout(
  p_deal_id UUID,
  p_checkout_session_id TEXT,
  p_economics_fingerprint TEXT,
  p_payment_intent_id TEXT,
  p_amount_cents INTEGER,
  p_currency TEXT,
  p_application_fee_cents INTEGER,
  p_transfer_destination TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deal public.license_requests%ROWTYPE;
  v_expected_fee INTEGER;
  v_expected_destination TEXT;
BEGIN
  SELECT * INTO v_deal
  FROM public.license_requests
  WHERE id = p_deal_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_deal.payment_status = 'paid' THEN
    RETURN v_deal.stripe_checkout_session_id = p_checkout_session_id;
  END IF;

  SELECT ROUND(v_deal.gross_fee_cents * v_deal.commission_pct / 100.0)::INTEGER,
         up.stripe_connect_account_id
  INTO v_expected_fee, v_expected_destination
  FROM public.vault_projects vp
  JOIN public.user_profiles up ON up.id = vp.user_id
  WHERE vp.id = v_deal.vault_project_id;

  IF v_deal.gross_fee_cents IS NULL
     OR v_deal.commission_pct IS NULL
     OR p_amount_cents IS DISTINCT FROM v_deal.gross_fee_cents
     OR LOWER(p_currency) IS DISTINCT FROM 'usd'
     OR p_application_fee_cents IS DISTINCT FROM v_expected_fee
     OR p_transfer_destination IS DISTINCT FROM v_expected_destination
     OR p_economics_fingerprint IS DISTINCT FROM COALESCE(
       v_deal.stripe_checkout_economics_fingerprint,
       v_deal.checkout_economics_fingerprint
     )
     OR (
       v_deal.stripe_checkout_session_id IS NOT NULL
       AND v_deal.stripe_checkout_session_id <> p_checkout_session_id
     ) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.license_requests
  SET payment_status = 'paid',
      stripe_checkout_session_id = p_checkout_session_id,
      stripe_checkout_economics_fingerprint = p_economics_fingerprint,
      stripe_payment_intent_id = p_payment_intent_id,
      paid_at = NOW(),
      checkout_claim_token = NULL,
      checkout_claimed_at = NULL,
      checkout_economics_fingerprint = NULL
  WHERE id = p_deal_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_license_checkout(UUID, UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_license_checkout(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_license_checkout_claim(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_license_checkout(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_license_checkout(UUID, UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_license_checkout(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_license_checkout_claim(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_license_checkout(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, INTEGER, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
