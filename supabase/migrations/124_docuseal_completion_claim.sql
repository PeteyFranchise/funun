-- Migration 124: serialize DocuSeal completion delivery

ALTER TABLE public.esign_envelopes
  ADD COLUMN completion_claim_token UUID,
  ADD COLUMN completion_claimed_at TIMESTAMPTZ;

ALTER TABLE public.esign_envelopes
  DROP CONSTRAINT esign_envelopes_status_check;

ALTER TABLE public.esign_envelopes
  ADD CONSTRAINT esign_envelopes_status_check
  CHECK (status IN ('pending', 'completing', 'completed', 'voided', 'expired'));

DROP INDEX IF EXISTS public.idx_esign_envelopes_docuseal_submission_id;

CREATE UNIQUE INDEX idx_esign_envelopes_docuseal_submission_id
  ON public.esign_envelopes (docuseal_submission_id)
  WHERE docuseal_submission_id IS NOT NULL;

CREATE UNIQUE INDEX idx_vault_documents_split_sheet_completion
  ON public.vault_documents (
    user_id,
    (document_data ->> 'split_sheet_id'),
    (document_data #>> '{esign,requestId}')
  )
  WHERE type = 'split_sheet'
    AND document_data ->> 'split_sheet_id' IS NOT NULL
    AND document_data #>> '{esign,requestId}' IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_docuseal_completion(
  p_envelope_id UUID,
  p_submission_id TEXT,
  p_claim_token UUID,
  p_lease_seconds INTEGER DEFAULT 900
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_envelope_id IS NULL OR p_claim_token IS NULL OR NULLIF(BTRIM(p_submission_id), '') IS NULL THEN
    RAISE EXCEPTION 'envelope, submission, and claim token are required';
  END IF;

  IF p_lease_seconds < 60 OR p_lease_seconds > 1800 THEN
    RAISE EXCEPTION 'claim lease must be between 60 and 1800 seconds';
  END IF;

  UPDATE public.esign_envelopes
  SET status = 'completing',
      completion_claim_token = p_claim_token,
      completion_claimed_at = NOW()
  WHERE id = p_envelope_id
    AND docuseal_submission_id = p_submission_id
    AND (
      status = 'pending'
      OR (
        status = 'completing'
        AND completion_claimed_at < NOW() - make_interval(secs => p_lease_seconds)
      )
    );

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_docuseal_completion_claim(
  p_envelope_id UUID,
  p_claim_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.esign_envelopes
  SET status = 'pending',
      completion_claim_token = NULL,
      completion_claimed_at = NULL
  WHERE id = p_envelope_id
    AND status = 'completing'
    AND completion_claim_token = p_claim_token;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_docuseal_completion_claim(
  p_envelope_id UUID,
  p_claim_token UUID,
  p_completed_at TIMESTAMPTZ,
  p_executed_file_path TEXT,
  p_audit_log_path TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.esign_envelopes
  SET status = 'completed',
      completed_at = p_completed_at,
      executed_file_path = p_executed_file_path,
      audit_log_path = p_audit_log_path,
      billed = TRUE,
      completion_claim_token = NULL,
      completion_claimed_at = NULL
  WHERE id = p_envelope_id
    AND status = 'completing'
    AND completion_claim_token = p_claim_token;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_docuseal_completion(UUID, TEXT, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_docuseal_completion_claim(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_docuseal_completion_claim(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_docuseal_completion(UUID, TEXT, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_docuseal_completion_claim(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_docuseal_completion_claim(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO service_role;
