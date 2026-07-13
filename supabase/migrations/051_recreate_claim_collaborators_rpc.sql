-- ============================================================
-- Funūn — Runtime repair: claim_collaborators RPC contract
-- Migration 051: ensure PostgREST can resolve the middleware claim RPC
-- ============================================================

-- The middleware-triggered /api/claim-collaborators route calls this RPC
-- with named arguments. Recreate the function with the exact public
-- signature expected by PostgREST so newly authenticated users do not hit a
-- schema-cache miss before their collaborator rows can be claimed.
CREATE OR REPLACE FUNCTION public.claim_collaborators(
  p_user_id UUID,
  p_email   TEXT
)
RETURNS VOID AS $$
DECLARE
  v_pro       TEXT;
  v_ipi       TEXT;
  v_publisher TEXT;
  v_phone     TEXT;
  v_address   JSONB;
BEGIN
  UPDATE public.collaborators
    SET claimed_by = p_user_id
  WHERE LOWER(email) = LOWER(p_email)
    AND claimed_by IS NULL;

  SELECT pro, ipi, publisher, phone, mailing_address
    INTO v_pro, v_ipi, v_publisher, v_phone, v_address
    FROM public.user_profiles
    WHERE id = p_user_id;

  IF FOUND THEN
    UPDATE public.collaborators
      SET pro             = COALESCE(pro, v_pro),
          ipi             = COALESCE(ipi, v_ipi),
          publisher       = COALESCE(publisher, v_publisher),
          phone           = COALESCE(phone, v_phone),
          mailing_address = COALESCE(mailing_address, v_address)
    WHERE claimed_by = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

NOTIFY pgrst, 'reload schema';
