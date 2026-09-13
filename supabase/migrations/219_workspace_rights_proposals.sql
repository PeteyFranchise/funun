-- Migration 219: workspace rights proposals (Phase 38.1-06 / D-41)
-- OWNER ACTION REQUIRED. Do not apply automatically.

CREATE TABLE public.workspace_rights_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  relationship_id UUID NOT NULL REFERENCES public.workspace_roster_relationships(id) ON DELETE RESTRICT,
  member_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  field TEXT NOT NULL CHECK (field IN ('pro', 'ipi', 'publisher', 'soundexchange_id')),
  proposed_value TEXT NOT NULL CHECK (char_length(btrim(proposed_value)) BETWEEN 1 AND 300),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined', 'superseded')),
  proposed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_rights_proposals_decision_shape CHECK (
    (status = 'pending' AND decided_by IS NULL AND decided_at IS NULL) OR
    (status <> 'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX workspace_rights_proposals_one_pending
  ON public.workspace_rights_proposals (workspace_id, member_user_id, field)
  WHERE status = 'pending';
CREATE INDEX workspace_rights_proposals_member_status_created
  ON public.workspace_rights_proposals (member_user_id, status, created_at DESC);

ALTER TABLE public.workspace_rights_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_rights_proposals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.workspace_rights_proposals TO service_role;

CREATE OR REPLACE FUNCTION public.decide_workspace_rights_proposal(
  p_proposal_id UUID,
  p_member_user_id UUID,
  p_decision TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_proposal public.workspace_rights_proposals%ROWTYPE;
BEGIN
  IF p_decision NOT IN ('confirmed', 'declined') THEN RETURN 'invalid_decision'; END IF;

  SELECT * INTO v_proposal
  FROM public.workspace_rights_proposals
  WHERE id = p_proposal_id
  FOR NO KEY UPDATE;

  IF NOT FOUND OR v_proposal.member_user_id <> p_member_user_id THEN RETURN 'not_found'; END IF;
  IF v_proposal.status <> 'pending' THEN RETURN 'already_decided'; END IF;

  IF p_decision = 'confirmed' THEN
    UPDATE public.user_profiles
    SET
      pro = CASE WHEN v_proposal.field = 'pro' THEN v_proposal.proposed_value ELSE pro END,
      ipi = CASE WHEN v_proposal.field = 'ipi' THEN v_proposal.proposed_value ELSE ipi END,
      publisher = CASE WHEN v_proposal.field = 'publisher' THEN v_proposal.proposed_value ELSE publisher END,
      soundexchange_id = CASE WHEN v_proposal.field = 'soundexchange_id' THEN v_proposal.proposed_value ELSE soundexchange_id END,
      updated_at = now()
    WHERE id = p_member_user_id;
    IF NOT FOUND THEN RETURN 'not_found'; END IF;
  END IF;

  UPDATE public.workspace_rights_proposals
  SET status = p_decision, decided_by = p_member_user_id, decided_at = now(), updated_at = now()
  WHERE id = p_proposal_id;

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, subject_member_id, action, target_type, target_id, changes_redacted
  ) VALUES (
    v_proposal.workspace_id, p_member_user_id, p_member_user_id,
    CASE WHEN p_decision = 'confirmed' THEN 'workspace.rights_proposal.confirmed' ELSE 'workspace.rights_proposal.declined' END,
    'workspace_rights_proposal', p_proposal_id, true
  );

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.decide_workspace_rights_proposal(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_workspace_rights_proposal(UUID, UUID, TEXT) TO service_role;

COMMENT ON TABLE public.workspace_rights_proposals IS
  'D-41 proposal ledger. A pending row never changes canonical rights data and confers no access. Only the named Member decision function may apply a value.';
