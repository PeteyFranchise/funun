-- Migration 220: master-ownership claims and evidence-derived recording access
-- (Phase 38.1-07 / WS-29 / workspace D-08..D-10)
-- OWNER ACTION REQUIRED. Do not apply automatically.

CREATE TABLE public.master_ownership_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  work_version_id UUID NOT NULL REFERENCES public.work_versions(id) ON DELETE RESTRICT,
  holder_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  state TEXT NOT NULL DEFAULT 'claimed'
    CHECK (state IN ('claimed', 'contributor_confirmed', 'document_supported', 'disputed')),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 1000),
  dispute_note TEXT CHECK (dispute_note IS NULL OR char_length(dispute_note) BETWEEN 1 AND 1000),
  evidence_document_id UUID REFERENCES public.vault_documents(id) ON DELETE RESTRICT,
  claimed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  holder_decided_at TIMESTAMPTZ,
  evidence_attached_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT master_ownership_claim_state_shape CHECK (
    (state = 'claimed' AND holder_decided_at IS NULL AND evidence_document_id IS NULL AND evidence_attached_at IS NULL AND dispute_note IS NULL) OR
    (state = 'contributor_confirmed' AND holder_decided_at IS NOT NULL AND evidence_document_id IS NULL AND evidence_attached_at IS NULL AND dispute_note IS NULL) OR
    (state = 'document_supported' AND holder_decided_at IS NOT NULL AND evidence_document_id IS NOT NULL AND evidence_attached_at IS NOT NULL AND dispute_note IS NULL) OR
    (state = 'disputed' AND holder_decided_at IS NOT NULL AND evidence_document_id IS NULL AND evidence_attached_at IS NULL AND dispute_note IS NOT NULL)
  ),
  CONSTRAINT master_ownership_claim_once UNIQUE (workspace_id, work_version_id)
);

CREATE INDEX master_ownership_claims_holder_created
  ON public.master_ownership_claims (holder_user_id, created_at DESC);
CREATE INDEX master_ownership_claims_workspace_state
  ON public.master_ownership_claims (workspace_id, state, created_at DESC);

ALTER TABLE public.master_ownership_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.master_ownership_claims FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.master_ownership_claims FROM service_role;
GRANT SELECT, INSERT, UPDATE ON public.master_ownership_claims TO service_role;

CREATE TRIGGER master_ownership_claims_updated_at
  BEFORE UPDATE ON public.master_ownership_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.decide_master_ownership_claim(
  p_claim_id UUID,
  p_holder_user_id UUID,
  p_action TEXT,
  p_document_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.master_ownership_claims%ROWTYPE;
  v_graduated_project_id UUID;
BEGIN
  IF p_action NOT IN ('confirm', 'support', 'dispute') THEN RETURN 'invalid_action'; END IF;

  SELECT * INTO v_claim
  FROM public.master_ownership_claims
  WHERE id = p_claim_id
  FOR NO KEY UPDATE;

  IF NOT FOUND OR v_claim.holder_user_id <> p_holder_user_id THEN RETURN 'not_found'; END IF;

  IF p_action = 'confirm' THEN
    IF v_claim.state <> 'claimed' THEN RETURN 'invalid_state'; END IF;
    UPDATE public.master_ownership_claims
      SET state = 'contributor_confirmed', holder_decided_at = now()
      WHERE id = p_claim_id;
  ELSIF p_action = 'dispute' THEN
    IF v_claim.state NOT IN ('claimed', 'contributor_confirmed') THEN RETURN 'invalid_state'; END IF;
    IF p_note IS NULL OR char_length(btrim(p_note)) NOT BETWEEN 1 AND 1000 THEN RETURN 'invalid_note'; END IF;
    UPDATE public.master_ownership_claims
      SET state = 'disputed', holder_decided_at = now(), dispute_note = btrim(p_note)
      WHERE id = p_claim_id;
  ELSE
    IF v_claim.state <> 'contributor_confirmed' THEN RETURN 'invalid_state'; END IF;
    IF p_document_id IS NULL THEN RETURN 'invalid_document'; END IF;

    SELECT w.graduated_project_id INTO v_graduated_project_id
    FROM public.work_versions v
    JOIN public.works w ON w.id = v.work_id
    WHERE v.id = v_claim.work_version_id;

    IF NOT FOUND OR v_graduated_project_id IS NULL THEN RETURN 'document_not_bound'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.vault_documents d
      WHERE d.id = p_document_id
        AND d.user_id = p_holder_user_id
        AND d.project_id = v_graduated_project_id
        AND d.status IN ('signed', 'verified')
        AND EXISTS (
          SELECT 1 FROM public.vault_projects p
          WHERE p.id = d.project_id AND p.user_id = p_holder_user_id
        )
    ) THEN RETURN 'document_not_bound'; END IF;

    UPDATE public.master_ownership_claims
      SET state = 'document_supported', evidence_document_id = p_document_id,
          evidence_attached_at = now()
      WHERE id = p_claim_id;
  END IF;

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, subject_member_id, action, target_type, target_id, changes_redacted
  ) VALUES (
    v_claim.workspace_id, p_holder_user_id, p_holder_user_id,
    'workspace.master_claim.' || p_action, 'master_ownership_claim', p_claim_id, true
  );

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.decide_master_ownership_claim(UUID, UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_master_ownership_claim(UUID, UUID, TEXT, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.workspace_master_claim_access(
  p_work_version_id UUID,
  p_actor_user_id UUID,
  p_capability TEXT
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_capability = ANY (ARRAY[
      'view_catalogue', 'view_metadata', 'view_readiness',
      'manage_registrations', 'deliver_assets'
    ]::TEXT[])
    AND public.workspace_access_enabled()
    AND EXISTS (
      SELECT 1
      FROM public.master_ownership_claims c
      JOIN public.workspace_members m ON m.workspace_id = c.workspace_id
      WHERE c.work_version_id = p_work_version_id
        AND c.state = 'document_supported'
        AND m.user_id = p_actor_user_id
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin', 'member', 'contractor')
        AND (m.expires_at IS NULL OR m.expires_at > now())
    );
$$;

REVOKE ALL ON FUNCTION public.workspace_master_claim_access(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_master_claim_access(UUID, UUID, TEXT) TO service_role;

COMMENT ON TABLE public.master_ownership_claims IS
  'WS-29 claim ledger. Claimed and contributor-confirmed rows grant nothing. Document-supported state may authorize only the allowlisted non-master capabilities; clean-master access remains separately granted and logged.';
COMMENT ON FUNCTION public.workspace_master_claim_access(UUID, UUID, TEXT) IS
  'Evidence-derived D-08 access for a recording version. Recomputed at use time, independent of roster relationships, bounded to a live non-guest workspace seat, and structurally unable to return a storage reference or authorize clean-master download.';

CREATE OR REPLACE FUNCTION public.create_master_ownership_claim(
  p_workspace_id UUID,
  p_work_version_id UUID,
  p_actor_user_id UUID,
  p_note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim_id UUID;
  v_holder_user_id UUID;
  v_graduated_project_id UUID;
BEGIN
  IF p_note IS NOT NULL AND char_length(p_note) > 1000 THEN RETURN NULL; END IF;
  IF NOT public.workspace_access_enabled() THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.workspaces w
    JOIN public.workspace_members m ON m.workspace_id = w.id
    WHERE w.id = p_workspace_id
      AND w.workspace_type = 'label'
      AND m.user_id = p_actor_user_id
      AND m.status = 'active'
      AND m.role IN ('owner', 'admin')
      AND (m.expires_at IS NULL OR m.expires_at > now())
  ) THEN RETURN NULL; END IF;

  -- Current project custody wins after graduation; before graduation the
  -- work holder is the only available holder. The caller never supplies it.
  SELECT w.user_id, w.graduated_project_id
    INTO v_holder_user_id, v_graduated_project_id
  FROM public.work_versions v
  JOIN public.works w ON w.id = v.work_id
  WHERE v.id = p_work_version_id
  FOR NO KEY UPDATE OF v, w;

  IF v_graduated_project_id IS NOT NULL THEN
    SELECT p.user_id INTO v_holder_user_id
    FROM public.vault_projects p
    WHERE p.id = v_graduated_project_id
    FOR NO KEY UPDATE;
  END IF;

  IF v_holder_user_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.master_ownership_claims (
    workspace_id, work_version_id, holder_user_id, note, claimed_by
  ) VALUES (
    p_workspace_id, p_work_version_id, v_holder_user_id, nullif(btrim(p_note), ''), p_actor_user_id
  ) RETURNING id INTO v_claim_id;

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, subject_member_id, action, target_type, target_id, changes_redacted
  ) VALUES (
    p_workspace_id, p_actor_user_id, v_holder_user_id,
    'workspace.master_claim.created', 'master_ownership_claim', v_claim_id, true
  );

  RETURN v_claim_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_master_ownership_claim(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_master_ownership_claim(UUID, UUID, UUID, TEXT) TO service_role;
