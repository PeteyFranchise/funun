-- ============================================================
-- Funūn - reset a dead Stripe Checkout Session so the deal can be re-charged
--
-- HUMAN-GATED: do not apply from an executor/agent session. The owner must
-- review and apply this explicitly.
--
-- Why: after checkout.session.async_payment_failed (a delayed method such as
-- ACH bounced) or checkout.session.expired, the deal stays 'awaiting_payment'
-- pointing at a session that can never complete. claim_license_checkout
-- (migration 215) returns 'existing' with that dead URL for the same
-- economics fingerprint, so the admin cannot issue a new checkout.
--
-- reset_license_checkout moves such a deal back to 'unpaid' and clears the
-- stored session id, url, fingerprint and claim lease. It only acts when the
-- deal is currently 'awaiting_payment' or 'creating_payment' AND its stored
-- Checkout Session id equals the argument, so it can never touch a paid deal
-- or a deal that has since been given a newer session. It does not clear
-- stripe_payment_intent_id or paid_at (only complete_license_checkout writes
-- those). Called only by app/api/webhooks/stripe/route.ts.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.reset_license_checkout(
  p_deal_id UUID,
  p_checkout_session_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_deal_id IS NULL OR NULLIF(BTRIM(p_checkout_session_id), '') IS NULL THEN
    RAISE EXCEPTION 'deal and checkout session id are required';
  END IF;

  -- The WHERE clause is the whole guard. A single UPDATE re-checks it against
  -- the latest committed row, so a concurrent complete_license_checkout that
  -- flips the deal to 'paid' first makes this a no-op (FOUND = false).
  UPDATE public.license_requests
  SET payment_status = 'unpaid',
      stripe_checkout_session_id = NULL,
      stripe_checkout_url = NULL,
      stripe_checkout_economics_fingerprint = NULL,
      checkout_claim_token = NULL,
      checkout_claimed_at = NULL,
      checkout_economics_fingerprint = NULL
  WHERE id = p_deal_id
    AND payment_status IN ('awaiting_payment', 'creating_payment')
    AND stripe_checkout_session_id = p_checkout_session_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_license_checkout(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_license_checkout(UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
