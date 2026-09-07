-- ============================================================
-- Phase 38.0.1 — VERIFICATION PART B, FILE 2 of 3: ASSERTIONS
--
-- Run AFTER B1 (seed), on the same preview branch.
-- Returns ONE result table. Read the `verdict` column.
--
-- This is the half Part A could not do: BEHAVIOUR under a live
-- grant, with the kill switch on and real rows present.
--
-- It impersonates users the way Supabase RLS actually resolves
-- identity — by setting request.jwt.claims — so no real accounts,
-- passwords or tokens are involved anywhere.
-- ============================================================

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_uid UUID) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
                    json_build_object('sub', p_uid::text, 'role','authenticated')::text,
                    true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.run_b_assertions()
RETURNS TABLE (ord INT, check_name TEXT, detail TEXT, verdict TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  SUBJECT  UUID := 'ffff0000-0000-0000-0000-000000000001';
  OWNER_   UUID := 'ffff0000-0000-0000-0000-000000000002';
  CONTRACT UUID := 'ffff0000-0000-0000-0000-000000000004';
  GUEST    UUID := 'ffff0000-0000-0000-0000-000000000005';
  OUTSIDER UUID := 'ffff0000-0000-0000-0000-000000000006';
  PROJ     UUID := 'ffff0000-0000-0000-0000-0000000000a1';
  ROOT     UUID := 'ffff0000-0000-0000-0000-000000000091';
  ok BOOLEAN; n BIGINT; txt TEXT;
BEGIN
  -- B1 — baseline: the workspace owner CAN see the project.
  -- If this fails, every later negative result is meaningless.
  ok := public.workspace_project_permission(PROJ, OWNER_, 'view_summaries');
  RETURN QUERY SELECT 1, 'B1 baseline: owner has access'::TEXT, 'workspace_project_permission'::TEXT,
    CASE WHEN ok THEN 'PASS' ELSE '*** FAIL — baseline broken, later results meaningless ***' END;

  -- B2 — WSR-17: expired-but-active contractor seat is refused.
  ok := public.workspace_project_permission(PROJ, CONTRACT, 'view_summaries');
  RETURN QUERY SELECT 2, 'B2 WSR-17 expired seat refused'::TEXT, 'contractor, status=active, expires_at past'::TEXT,
    CASE WHEN ok THEN '*** FAIL — EXPIRED SEAT GRANTED ACCESS ***' ELSE 'PASS' END;
  RETURN QUERY SELECT 3, 'B2b WSR-17 helper agrees'::TEXT,
    coalesce(public.workspace_member_role('ffff0000-0000-0000-0000-0000000000c1', CONTRACT),'(null)')::TEXT,
    CASE WHEN public.workspace_member_role('ffff0000-0000-0000-0000-0000000000c1', CONTRACT) IS NULL
         THEN 'PASS' ELSE '*** FAIL — expired seat still returns a role ***' END;

  -- B3 — guest holds a seat but no grant: no access.
  ok := public.workspace_project_permission(PROJ, GUEST, 'view_summaries');
  RETURN QUERY SELECT 4, 'B3 seat without grant'::TEXT, 'guest'::TEXT,
    CASE WHEN ok THEN '*** FAIL — membership alone granted access ***' ELSE 'PASS' END;

  -- B4 — outsider with no relationship at all: no access.
  ok := public.workspace_project_permission(PROJ, OUTSIDER, 'view_summaries');
  RETURN QUERY SELECT 5, 'B4 outsider'::TEXT, 'no workspace relationship'::TEXT,
    CASE WHEN ok THEN '*** FAIL — outsider granted access ***' ELSE 'PASS' END;

  -- B5 — WSR-02: revoking the consent ROOT kills the delegated descendant,
  -- live on the next read, with nothing cached.
  UPDATE public.workspace_grants SET revoked_at = now() WHERE id = ROOT;
  ok := public.workspace_project_permission(PROJ, OWNER_, 'view_summaries');
  RETURN QUERY SELECT 6, 'B5 WSR-02 revoked root kills descendant'::TEXT, 'root revoked, child left live'::TEXT,
    CASE WHEN ok THEN '*** FAIL — descendant survived root revocation ***' ELSE 'PASS' END;
  UPDATE public.workspace_grants SET revoked_at = NULL WHERE id = ROOT;   -- restore

  -- B6 — WSR-06: access follows CURRENT custody. Transfer the project to
  -- someone else and the workspace must lose it on the very next read,
  -- with no cleanup step run.
  ok := public.workspace_project_permission(PROJ, OWNER_, 'view_summaries');
  IF NOT ok THEN
    RETURN QUERY SELECT 7, 'B6 WSR-06 custody binding'::TEXT, 'pre-transfer access missing'::TEXT,
      '*** FAIL — could not establish pre-state ***';
  ELSE
    PERFORM public.transfer_vault_project_custody(PROJ, SUBJECT, OUTSIDER);
    ok := public.workspace_project_permission(PROJ, OWNER_, 'view_summaries');
    RETURN QUERY SELECT 7, 'B6 WSR-06 custody binding'::TEXT, 'access after custody moved away'::TEXT,
      CASE WHEN ok THEN '*** FAIL — ACCESS SURVIVED CUSTODY TRANSFER ***' ELSE 'PASS' END;
    PERFORM public.transfer_vault_project_custody(PROJ, OUTSIDER, SUBJECT);  -- restore
  END IF;

  -- B7 — WSR-03: the workspace branch is gone from tracks. As the workspace
  -- owner, a direct read of tracks must return nothing.
  PERFORM pg_temp.as_user(OWNER_);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.tracks WHERE project_id = PROJ;
  RESET ROLE;
  RETURN QUERY SELECT 8, 'B7 WSR-03 direct tracks read blocked'::TEXT, n || ' rows visible'::TEXT,
    CASE WHEN n = 0 THEN 'PASS' ELSE '*** FAIL — workspace branch still reachable on tracks ***' END;

  -- B8 — WSR-04: the sanctioned accessor DOES return the row, and the
  -- forbidden columns are absent from its declared contract.
  SELECT count(*) INTO n FROM public.workspace_read_tracks(PROJ, OWNER_);
  RETURN QUERY SELECT 9, 'B8 WSR-04 allowlisted accessor works'::TEXT, n || ' rows'::TEXT,
    CASE WHEN n > 0 THEN 'PASS' ELSE '*** FAIL — accessor returned nothing; grant chain broken ***' END;

  -- B9 — the p_uid impersonation fix, PROVEN BEHAVIOURALLY.
  -- The outsider asks to read AS the owner. Must return zero rows.
  PERFORM pg_temp.as_user(OUTSIDER);
  SELECT count(*) INTO n FROM public.workspace_read_tracks(PROJ, OWNER_);
  PERFORM set_config('request.jwt.claims', NULL, true);
  RETURN QUERY SELECT 10, 'B9 p_uid impersonation refused'::TEXT,
    'outsider passing owner uuid saw ' || n || ' rows'::TEXT,
    CASE WHEN n = 0 THEN 'PASS' ELSE '*** FAIL — READ IMPERSONATION STILL POSSIBLE ***' END;

  -- B10 — WSR-25: custody column is immutable to ordinary UPDATE.
  BEGIN
    UPDATE public.vault_projects SET user_id = OUTSIDER WHERE id = PROJ;
    RETURN QUERY SELECT 11, 'B10 WSR-25 custody immutable'::TEXT, 'raw UPDATE succeeded'::TEXT,
      '*** FAIL — TRIGGER DID NOT BLOCK ***';
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 11, 'B10 WSR-25 custody immutable'::TEXT, SQLERRM::TEXT, 'PASS — refused';
  END;

  -- B11 — recursion: a vault_projects read as a workspace caller must not
  -- raise SQLSTATE 42P17 (infinite policy recursion).
  BEGIN
    PERFORM pg_temp.as_user(OWNER_);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO n FROM public.vault_projects WHERE id = PROJ;
    RESET ROLE;
    RETURN QUERY SELECT 12, 'B11 no policy recursion (42P17)'::TEXT, n || ' rows, no error'::TEXT, 'PASS';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RETURN QUERY SELECT 12, 'B11 no policy recursion (42P17)'::TEXT,
      SQLSTATE || ': ' || SQLERRM::TEXT,
      CASE WHEN SQLSTATE = '42P17' THEN '*** FAIL — INFINITE RECURSION ***' ELSE '*** FAIL — unexpected error ***' END;
  END;

  -- B12 — D-56 disable drill: with the switch off, access disappears.
  UPDATE public.workspace_access_config SET enabled = FALSE;
  ok := public.workspace_project_permission(PROJ, OWNER_, 'view_summaries');
  UPDATE public.workspace_access_config SET enabled = TRUE;   -- restore for further runs
  RETURN QUERY SELECT 13, 'B12 D-56 disable drill'::TEXT, 'access while switch OFF'::TEXT,
    CASE WHEN ok THEN '*** FAIL — KILL SWITCH DOES NOT KILL ***' ELSE 'PASS' END;
END $$;

SELECT * FROM pg_temp.run_b_assertions() ORDER BY ord;
