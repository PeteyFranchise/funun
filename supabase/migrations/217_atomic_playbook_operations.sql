-- ============================================================
-- Funūn Beta hardening — atomic Playbook controls and incidents
-- HUMAN-GATED: owner review and explicit apply required.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.mutate_playbook_feature_control(
  p_feature_key TEXT,
  p_action TEXT,
  p_actor_id UUID,
  p_note TEXT,
  p_expected_updated_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_type TEXT;
BEGIN
  IF p_action NOT IN ('enable','disable','emergency_disable','emergency_clear') THEN
    RAISE EXCEPTION 'invalid feature-control action';
  END IF;
  v_event_type := CASE p_action
    WHEN 'enable' THEN 'enabled'
    WHEN 'disable' THEN 'disabled'
    WHEN 'emergency_disable' THEN 'emergency_disabled'
    ELSE 'emergency_cleared'
  END;

  UPDATE public.playbook_feature_controls
  SET enabled = CASE
        WHEN p_action = 'enable' THEN TRUE
        WHEN p_action = 'disable' THEN FALSE
        ELSE enabled
      END,
      emergency_disabled = CASE
        WHEN p_action = 'emergency_disable' THEN TRUE
        WHEN p_action = 'emergency_clear' THEN FALSE
        ELSE emergency_disabled
      END,
      disabled_reason = CASE
        WHEN p_action = 'emergency_disable' THEN p_note
        WHEN p_action = 'emergency_clear' THEN NULL
        ELSE disabled_reason
      END,
      updated_by = p_actor_id,
      updated_at = NOW()
  WHERE feature_key = p_feature_key
    AND updated_at = p_expected_updated_at;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  INSERT INTO public.playbook_feature_control_events (
    feature_key, event_type, actor_id, note
  ) VALUES (p_feature_key, v_event_type, p_actor_id, p_note);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_playbook_incident(
  p_room_id UUID,
  p_runbook_entry_id UUID,
  p_runbook_revision_number INTEGER,
  p_title TEXT,
  p_severity INTEGER,
  p_summary TEXT,
  p_actor_id UUID,
  p_postmortem_due_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.playbook_incidents (
    room_id, runbook_entry_id, runbook_revision_number, title, severity,
    summary, commander_id, created_by, postmortem_due_at
  ) VALUES (
    p_room_id, p_runbook_entry_id, p_runbook_revision_number, p_title,
    p_severity, p_summary, p_actor_id, p_actor_id, p_postmortem_due_at
  ) RETURNING id INTO v_id;
  INSERT INTO public.playbook_incident_events (incident_id, event_type, actor_id, note)
  VALUES (v_id, 'opened', p_actor_id, p_summary);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_playbook_incident_status(
  p_incident_id UUID,
  p_room_id UUID,
  p_expected_status TEXT,
  p_status TEXT,
  p_actor_id UUID,
  p_note TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_status NOT IN ('active','monitoring','resolved','closed') THEN
    RAISE EXCEPTION 'invalid incident status';
  END IF;
  UPDATE public.playbook_incidents
  SET status = p_status,
      resolved_at = CASE WHEN p_status IN ('resolved','closed') THEN NOW() ELSE NULL END
  WHERE id = p_incident_id AND room_id = p_room_id AND status = p_expected_status;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  INSERT INTO public.playbook_incident_events (incident_id, event_type, actor_id, note)
  VALUES (
    p_incident_id,
    CASE WHEN p_status = 'resolved' THEN 'resolved' ELSE 'status_changed' END,
    p_actor_id,
    p_note
  );
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.mutate_playbook_feature_control(TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.open_playbook_incident(UUID, UUID, INTEGER, TEXT, INTEGER, TEXT, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.change_playbook_incident_status(UUID, UUID, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_playbook_feature_control(TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.open_playbook_incident(UUID, UUID, INTEGER, TEXT, INTEGER, TEXT, UUID, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.change_playbook_incident_status(UUID, UUID, TEXT, TEXT, UUID, TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';

COMMIT;
