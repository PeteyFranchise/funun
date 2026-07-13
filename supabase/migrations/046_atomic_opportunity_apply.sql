-- ─── Migration 046: Atomic Antenna opportunity applications ────────────────
--
-- Fixes the check-then-update race in /api/antenna/opportunities/[id]/apply:
-- multiple artists applying at the same time now serialize on the opportunity
-- row before slots are checked and incremented.

CREATE OR REPLACE FUNCTION public.apply_to_opportunity_atomic(
  p_opportunity_id UUID,
  p_project_id UUID,
  p_user_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS TABLE (
  result TEXT,
  opportunity_title TEXT,
  opportunity_created_by UUID,
  project_title TEXT,
  submission_id UUID
)
AS $$
DECLARE
  opp_row opportunities%ROWTYPE;
  project_row vault_projects%ROWTYPE;
  match_row opportunity_matches%ROWTYPE;
  inserted_submission_id UUID;
BEGIN
  SELECT *
    INTO project_row
    FROM vault_projects
    WHERE id = p_project_id
      AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'project_not_found'::TEXT, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID;
    RETURN;
  END IF;

  SELECT *
    INTO opp_row
    FROM opportunities
    WHERE id = p_opportunity_id
      AND active = true
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'opportunity_closed'::TEXT, NULL::TEXT, NULL::UUID, project_row.title, NULL::UUID;
    RETURN;
  END IF;

  IF COALESCE(opp_row.slots_available, 1) > 0
     AND COALESCE(opp_row.slots_filled, 0) >= COALESCE(opp_row.slots_available, 1) THEN
    RETURN QUERY SELECT 'full'::TEXT, opp_row.title, opp_row.created_by, project_row.title, NULL::UUID;
    RETURN;
  END IF;

  SELECT *
    INTO match_row
    FROM opportunity_matches
    WHERE opportunity_id = p_opportunity_id
      AND project_id = p_project_id
      AND user_id = p_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'no_match'::TEXT, opp_row.title, opp_row.created_by, project_row.title, NULL::UUID;
    RETURN;
  END IF;

  IF match_row.applied THEN
    RETURN QUERY SELECT 'already_applied'::TEXT, opp_row.title, opp_row.created_by, project_row.title, NULL::UUID;
    RETURN;
  END IF;

  UPDATE opportunity_matches
    SET applied = true,
        applied_at = now(),
        status = 'applied'
    WHERE id = match_row.id;

  UPDATE opportunities
    SET slots_filled = COALESCE(slots_filled, 0) + 1
    WHERE id = opp_row.id;

  INSERT INTO submissions (
    project_id,
    user_id,
    destination_type,
    destination_name,
    destination_contact,
    pitch_text,
    status,
    submitted_at
  )
  VALUES (
    p_project_id,
    p_user_id,
    'antenna',
    opp_row.title,
    NULL,
    NULLIF(BTRIM(COALESCE(p_note, '')), ''),
    'sent',
    now()
  )
  RETURNING id INTO inserted_submission_id;

  RETURN QUERY SELECT
    'applied'::TEXT,
    opp_row.title,
    opp_row.created_by,
    project_row.title,
    inserted_submission_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
