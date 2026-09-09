-- ============================================================
-- Migration 200: harden public.apply_to_opportunity_atomic.
-- ============================================================
--
-- WHERE THIS CAME FROM. Recorded as a deferred finding during Phase 38.0.2
-- (.planning/phases/38.0.2-workspace-transactional-integrity-hygiene/
-- 38.0.2-ORCHESTRATOR-NOTES.md) and deliberately NOT fixed there: it belongs to
-- the Antenna opportunity subsystem, not to workspaces, and folding an
-- unrelated subsystem in with a remediation phase for a different one is how a
-- review window stops being reviewable. The note said it could be acted on any
-- time after 38.0.2's push window closed. That window closed 2026-09-08.
--
-- ONE CORRECTION TO THE RECORD, MADE HERE BECAUSE THE WRONG VERSION IS WRITTEN
-- DOWN. 38.0.2-CONTEXT.md states that migration 046 has "no REVOKE at all."
-- That is FALSE. Migration 047 issues
--   REVOKE ALL ON FUNCTION public.apply_to_opportunity_atomic(...) FROM PUBLIC;
-- and migration 048 grants EXECUTE to service_role. The posture was never
-- wide open, and this migration is not repairing a hole of that shape.
--
-- ─── WHAT IS ACTUALLY BEING FIXED ────────────────────────────────────────
--
-- (1) search_path. 046 declares `SECURITY DEFINER SET search_path = public`
--     and references four tables UNQUALIFIED: vault_projects, opportunities,
--     opportunity_matches, submissions.
--
--     The hazard is the temporary schema, and it is a documented PostgreSQL
--     rule rather than an inference. From the search_path documentation: the
--     session's temporary schema "can be explicitly listed in the path by
--     using the alias pg_temp. If it is not listed in the path then it is
--     searched FIRST (even before pg_catalog)." It is searched only for
--     relation and data-type names -- never for functions or operators --
--     and relations are exactly what this function names.
--
--     So under `search_path = public`, a caller who can both execute this
--     function and create temporary tables could define a temp table called
--     `opportunities` (or any of the other three) and have the definer body
--     read and write THEIR table while running with the owner's privileges.
--     CREATE FUNCTION's own "Writing SECURITY DEFINER Functions Safely"
--     section prescribes exactly two remedies: put `pg_temp` last, or set
--     search_path empty and schema-qualify everything. This migration takes
--     the second, matching every migration in this repo from 123 onward.
--
--     REACHABILITY, STATED HONESTLY AND NOT OVERSOLD. This is hardening, not
--     a demonstrated exploit. Whether anyone other than service_role can
--     execute this function is a fact about the LIVE database that no file in
--     this repo can answer -- 047 revoked from PUBLIC, but if Supabase ever
--     granted `anon` or `authenticated` DIRECTLY rather than through PUBLIC,
--     that grant survived 047 untouched. The quick task's SUMMARY.md carries
--     a read-only query for the owner to settle it after applying. Until that
--     is run, treat the exposure as unknown rather than as either proven or
--     absent.
--
-- (2) The grant, re-issued naming the Supabase roles explicitly. Belt and
--     braces for precisely the case above: `REVOKE ... FROM PUBLIC` does not
--     remove a direct grant to `anon` or `authenticated`. Naming them costs
--     nothing and closes the case blind.
--
-- ─── WHAT IS DELIBERATELY NOT CHANGED ────────────────────────────────────
--
-- THE LOCK MODES STAY AS THEY ARE. This function takes `FOR UPDATE` on
-- public.opportunities and on public.opportunity_matches. Phase 38's LO-2
-- doctrine would prefer `FOR NO KEY UPDATE`: opportunities is a foreign-key
-- parent of opportunity_matches, and FOR UPDATE conflicts with the FOR KEY
-- SHARE that every concurrent child INSERT takes on the parent row, so it
-- blocks more than it needs to. That is a real observation and it is recorded
-- here so it is not lost.
--
-- It is NOT acted on here, for one reason: it is a concurrency BEHAVIOUR
-- change, and this repo has now shipped two migration defects that a green
-- text-lock suite could not see -- migration 139's second trigger silently
-- breaking custody transfer, and migration 198's ON CONFLICT inference
-- raising 42702 on the first live call. Both surfaced only under a
-- behavioural harness. A lock-mode change deserves the same treatment and
-- therefore its own migration, with its own verification.
--
-- THE BODY IS OTHERWISE UNCHANGED FROM 046 -- same logic, same outcome
-- strings, same columns, same order. The ONLY intended behavioural difference
-- in this entire migration is how unqualified names resolve. A drift-guard
-- test compares this body against 046's with `public.` prefixes stripped and
-- fails if anything else moved.
--
-- Phase: 38.0.2 deferred finding. Ledger: .planning/ROADMAP.md.
-- ============================================================

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
  opp_row public.opportunities%ROWTYPE;
  project_row public.vault_projects%ROWTYPE;
  match_row public.opportunity_matches%ROWTYPE;
  inserted_submission_id UUID;
BEGIN
  SELECT *
    INTO project_row
    FROM public.vault_projects
    WHERE id = p_project_id
      AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'project_not_found'::TEXT, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID;
    RETURN;
  END IF;

  SELECT *
    INTO opp_row
    FROM public.opportunities
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
    FROM public.opportunity_matches
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

  UPDATE public.opportunity_matches
    SET applied = true,
        applied_at = now(),
        status = 'applied'
    WHERE id = match_row.id;

  UPDATE public.opportunities
    SET slots_filled = COALESCE(slots_filled, 0) + 1
    WHERE id = opp_row.id;

  INSERT INTO public.submissions (
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Migration 123's grant posture. 047 already revoked from PUBLIC and 048
-- granted service_role; naming anon and authenticated explicitly closes the
-- case where either holds a DIRECT grant that a PUBLIC-only revoke left alone.
REVOKE EXECUTE ON FUNCTION public.apply_to_opportunity_atomic(
  UUID, UUID, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_to_opportunity_atomic(
  UUID, UUID, UUID, TEXT
) TO service_role;
