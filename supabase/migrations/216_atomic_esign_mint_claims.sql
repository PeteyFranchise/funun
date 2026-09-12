-- ============================================================
-- Funūn Beta hardening — atomic e-sign mint admission
--
-- HUMAN-GATED: do not apply from an executor/agent session. Provider-facing
-- behavior must be verified in a sandbox before production enablement.
-- ============================================================

BEGIN;

CREATE TABLE public.esign_mint_claims (
  instrument_kind TEXT NOT NULL CHECK (instrument_kind IN ('split_sheet', 'blanket_agreement')),
  subject_id UUID NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_token UUID NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider_request_id TEXT,
  provider_template_id TEXT,
  provider_recorded_at TIMESTAMPTZ,
  PRIMARY KEY (instrument_kind, subject_id)
);

ALTER TABLE public.esign_mint_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.esign_mint_claims FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.esign_mint_claims TO service_role;

CREATE UNIQUE INDEX idx_esign_envelopes_one_active_per_sheet
  ON public.esign_envelopes (split_sheet_id)
  WHERE status IN ('pending', 'completing');

CREATE UNIQUE INDEX idx_vault_documents_one_blanket_agreement
  ON public.vault_documents (user_id)
  WHERE type = 'blanket_agreement' AND status IN ('pending', 'signed', 'verified');

CREATE OR REPLACE FUNCTION public.claim_esign_mint(
  p_instrument_kind TEXT,
  p_subject_id UUID,
  p_actor_user_id UUID,
  p_claim_token UUID,
  p_lease_seconds INTEGER DEFAULT 900
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.esign_mint_claims%ROWTYPE;
BEGIN
  IF p_instrument_kind NOT IN ('split_sheet', 'blanket_agreement')
     OR p_subject_id IS NULL OR p_actor_user_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION 'valid instrument, subject, actor, and claim token are required';
  END IF;
  IF p_lease_seconds < 60 OR p_lease_seconds > 1800 THEN
    RAISE EXCEPTION 'claim lease must be between 60 and 1800 seconds';
  END IF;

  IF p_instrument_kind = 'split_sheet' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.split_sheets
      WHERE id = p_subject_id AND initiator_user_id = p_actor_user_id
        AND status IN ('approved', 'draft')
    ) THEN RETURN 'not_eligible'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.esign_envelopes
      WHERE split_sheet_id = p_subject_id AND status IN ('pending', 'completing', 'completed')
    ) THEN RETURN 'existing'; END IF;
  ELSE
    IF p_subject_id <> p_actor_user_id THEN RETURN 'not_eligible'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.vault_documents
      WHERE user_id = p_subject_id AND type = 'blanket_agreement'
        AND status IN ('pending', 'signed', 'verified')
    ) THEN RETURN 'existing'; END IF;
  END IF;

  INSERT INTO public.esign_mint_claims (
    instrument_kind, subject_id, actor_user_id, claim_token, claimed_at
  ) VALUES (
    p_instrument_kind, p_subject_id, p_actor_user_id, p_claim_token, NOW()
  ) ON CONFLICT (instrument_kind, subject_id) DO NOTHING;
  IF FOUND THEN RETURN 'claimed'; END IF;

  SELECT * INTO v_claim
  FROM public.esign_mint_claims
  WHERE instrument_kind = p_instrument_kind AND subject_id = p_subject_id
  FOR UPDATE;

  -- Once a provider id exists, automatic retries stay blocked until a
  -- reconciliation worker or operator attaches/voids that provider object.
  IF v_claim.provider_request_id IS NOT NULL THEN RETURN 'reconcile'; END IF;
  IF v_claim.claimed_at >= NOW() - make_interval(secs => p_lease_seconds) THEN RETURN 'busy'; END IF;

  UPDATE public.esign_mint_claims
  SET actor_user_id = p_actor_user_id,
      claim_token = p_claim_token,
      claimed_at = NOW(),
      provider_request_id = NULL,
      provider_template_id = NULL,
      provider_recorded_at = NULL
  WHERE instrument_kind = p_instrument_kind AND subject_id = p_subject_id;
  RETURN 'claimed';
END;
$$;

CREATE OR REPLACE FUNCTION public.record_esign_mint_provider(
  p_instrument_kind TEXT,
  p_subject_id UUID,
  p_claim_token UUID,
  p_provider_request_id TEXT,
  p_provider_template_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.esign_mint_claims
  SET provider_request_id = p_provider_request_id,
      provider_template_id = p_provider_template_id,
      provider_recorded_at = NOW()
  WHERE instrument_kind = p_instrument_kind
    AND subject_id = p_subject_id
    AND claim_token = p_claim_token
    AND provider_request_id IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_esign_mint_claim(
  p_instrument_kind TEXT,
  p_subject_id UUID,
  p_claim_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.esign_mint_claims
  WHERE instrument_kind = p_instrument_kind
    AND subject_id = p_subject_id
    AND claim_token = p_claim_token
    AND provider_request_id IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_esign_mint_claim(
  p_instrument_kind TEXT,
  p_subject_id UUID,
  p_claim_token UUID,
  p_provider_request_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.esign_mint_claims
  WHERE instrument_kind = p_instrument_kind
    AND subject_id = p_subject_id
    AND claim_token = p_claim_token
    AND provider_request_id = p_provider_request_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_esign_mint(TEXT, UUID, UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_esign_mint_provider(TEXT, UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_esign_mint_claim(TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_esign_mint_claim(TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_esign_mint(TEXT, UUID, UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_esign_mint_provider(TEXT, UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_esign_mint_claim(TEXT, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_esign_mint_claim(TEXT, UUID, UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
