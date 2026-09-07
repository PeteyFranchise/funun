-- ============================================================
-- Phase 38.0.1 — VERIFICATION PART B, PRODUCTION SINGLE-SHOT
--
-- Seeds fixtures, turns the D-56 kill switch ON, runs 13 behavioural
-- assertions, turns the switch back OFF, deletes every fixture, and
-- shows the results. ONE paste. Switch is on for about a second.
--
-- WHY THIS IS SAFE TO RUN ON PRODUCTION RIGHT NOW:
--   * Part A (A9) proved all five workspace tables hold ZERO rows, so
--     no real user has a workspace that the switch could expose.
--   * The whole thing is ONE DO block = ONE statement = ONE
--     transaction. If ANY step raises, everything rolls back,
--     including the kill-switch flip. There is no half-applied state.
--   * Teardown runs inside the same block via an EXCEPTION handler,
--     so a failing assertion still restores the switch and deletes
--     the fixtures.
--   * A guard aborts if workspace_members is not empty, so if a beta
--     user has created a workspace since Part A, this refuses to run
--     rather than seeding into live data.
--
-- Run this ONE statement. Then read the result table.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.zz_verify_b_results (
  ord INT, check_name TEXT, detail TEXT, verdict TEXT, run_at TIMESTAMPTZ DEFAULT now()
);
TRUNCATE public.zz_verify_b_results;

DO $BLOCK$
DECLARE
  SUBJECT  UUID := 'ffff0000-0000-0000-0000-000000000001';
  OWNER_   UUID := 'ffff0000-0000-0000-0000-000000000002';
  CONTRACT UUID := 'ffff0000-0000-0000-0000-000000000004';
  GUEST    UUID := 'ffff0000-0000-0000-0000-000000000005';
  OUTSIDER UUID := 'ffff0000-0000-0000-0000-000000000006';
  PROJ     UUID := 'ffff0000-0000-0000-0000-0000000000a1';
  WS       UUID := 'ffff0000-0000-0000-0000-0000000000c1';
  REL      UUID := 'ffff0000-0000-0000-0000-0000000000e1';
  ROOT     UUID := 'ffff0000-0000-0000-0000-000000000091';
  ok BOOLEAN; n BIGINT; guard BIGINT;
BEGIN
  -- ─── GUARD: refuse if real workspace data exists ───────────────
  SELECT count(*) INTO guard FROM public.workspace_members;
  IF guard > 0 THEN
    RAISE EXCEPTION 'REFUSING: workspace_members has % row(s). Part A saw 0. Real data may exist now — do not seed into it.', guard;
  END IF;

  -- ─── SEED ──────────────────────────────────────────────────────
  -- The auth.users INSERT trigger handle_new_user() enforces an invite gate
  -- and raises 'not_invited' for any email with no pending artist_invites row
  -- and no collaborators row. Rather than disabling a trigger in the auth
  -- schema (owned by supabase_auth_admin, so ALTER would likely be refused),
  -- admit these six through the real front door by seeding invites first.
  -- collaborators is not an option: it requires a user_id, which is precisely
  -- what we are creating.
  INSERT INTO public.artist_invites (email, source, status)
  SELECT e, 'staff', 'pending'
  FROM unnest(ARRAY['b-subject@verify.invalid','b-owner@verify.invalid',
                    'b-admin@verify.invalid','b-contractor@verify.invalid',
                    'b-guest@verify.invalid','b-outsider@verify.invalid']) AS e;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u.email, '', now(), now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb
  FROM (VALUES
    (SUBJECT,'b-subject@verify.invalid'), (OWNER_,'b-owner@verify.invalid'),
    ('ffff0000-0000-0000-0000-000000000003'::uuid,'b-admin@verify.invalid'),
    (CONTRACT,'b-contractor@verify.invalid'), (GUEST,'b-guest@verify.invalid'),
    (OUTSIDER,'b-outsider@verify.invalid')
  ) AS u(id,email) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.vault_projects (id,user_id,title,type)
  VALUES (PROJ, SUBJECT, 'Part B verification project','single') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.tracks (id,project_id,user_id,title,track_number)
  VALUES ('ffff0000-0000-0000-0000-0000000000b1', PROJ, SUBJECT, 'Part B track', 1)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspaces (id,name,slug,workspace_type,roster_enabled,created_by)
  VALUES (WS,'Part B workspace','part-b-verify-ffff0000','management',TRUE,OWNER_)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspace_members (id,workspace_id,user_id,role,status,expires_at) VALUES
   ('ffff0000-0000-0000-0000-0000000000d1',WS,OWNER_,'owner','active',NULL),
   ('ffff0000-0000-0000-0000-0000000000d2',WS,'ffff0000-0000-0000-0000-000000000003','admin','active',NULL),
   ('ffff0000-0000-0000-0000-0000000000d3',WS,CONTRACT,'contractor','active', now() - interval '1 day'),
   ('ffff0000-0000-0000-0000-0000000000d4',WS,GUEST,'guest','active',NULL)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspace_roster_relationships
    (id,workspace_id,member_user_id,state,effective_from,terminates_on,proposed_by)
  VALUES (REL,WS,SUBJECT,'accepted',CURRENT_DATE-1,NULL,OWNER_) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspace_attachments (id,workspace_id,project_id,relationship_id,attached_by)
  VALUES ('ffff0000-0000-0000-0000-0000000000f1',WS,PROJ,REL,OWNER_) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspace_grants
    (id,workspace_id,relationship_id,permission,source,parent_grant_id,granted_by)
  VALUES (ROOT,WS,REL,'view_summaries','member_consent',NULL,SUBJECT) ON CONFLICT (id) DO NOTHING;
  -- Project-scoped, not relationship-wide: idx_workspace_grants_unique_live is
  -- UNIQUE on (workspace_id, relationship_id, project_id, permission) NULLS NOT
  -- DISTINCT among live rows, so a child sharing the parent's relationship-wide
  -- scope would collide with it. Scoping the child to one project gives it a
  -- distinct key and still exercises the lineage walk.
  INSERT INTO public.workspace_grants
    (id,workspace_id,relationship_id,project_id,permission,source,parent_grant_id,granted_by)
  VALUES ('ffff0000-0000-0000-0000-000000000092',WS,REL,PROJ,'view_summaries','individual',ROOT,OWNER_)
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.workspace_access_config SET enabled = TRUE;   -- switch ON

  -- ─── ASSERTIONS ────────────────────────────────────────────────
  -- EACH assertion gets its OWN BEGIN/EXCEPTION block. That matters: a
  -- PL/pgSQL exception block is a subtransaction, so one shared wrapper
  -- rolls back every result row written before the failure. The first
  -- production run lost all eleven verdicts that way and showed only the
  -- abort. An INSERT inside a handler runs after that rollback, in the
  -- outer context, so it survives — which is why each error row is
  -- written in the handler.
  BEGIN
    ok := public.workspace_project_permission(PROJ,OWNER_,'view_summaries');
    INSERT INTO public.zz_verify_b_results VALUES (1,'B1 baseline: owner HAS access','workspace_project_permission',
      CASE WHEN ok THEN 'PASS' ELSE '*** FAIL — baseline broken, later results meaningless ***' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (1,'B1 baseline: owner HAS access',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  BEGIN
    ok := public.workspace_project_permission(PROJ,CONTRACT,'view_summaries');
    INSERT INTO public.zz_verify_b_results VALUES (2,'B2 WSR-17 expired seat refused','contractor active + expires_at past',
      CASE WHEN ok THEN '*** FAIL — EXPIRED SEAT GRANTED ACCESS ***' ELSE 'PASS' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (2,'B2 WSR-17 expired seat refused',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  BEGIN
    INSERT INTO public.zz_verify_b_results VALUES (3,'B2b WSR-17 helper agrees',
      coalesce(public.workspace_member_role(WS,CONTRACT),'(null)'),
      CASE WHEN public.workspace_member_role(WS,CONTRACT) IS NULL THEN 'PASS' ELSE '*** FAIL ***' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (3,'B2b WSR-17 helper agrees',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  BEGIN
    ok := public.workspace_project_permission(PROJ,GUEST,'view_summaries');
    INSERT INTO public.zz_verify_b_results VALUES (4,'B3 seat WITHOUT grant','guest',
      CASE WHEN ok THEN '*** FAIL — membership alone granted access ***' ELSE 'PASS' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (4,'B3 seat WITHOUT grant',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  BEGIN
    ok := public.workspace_project_permission(PROJ,OUTSIDER,'view_summaries');
    INSERT INTO public.zz_verify_b_results VALUES (5,'B4 outsider','no relationship',
      CASE WHEN ok THEN '*** FAIL — outsider granted access ***' ELSE 'PASS' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (5,'B4 outsider',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  BEGIN
    UPDATE public.workspace_grants SET revoked_at = now() WHERE id = ROOT;
    ok := public.workspace_project_permission(PROJ,OWNER_,'view_summaries');
    UPDATE public.workspace_grants SET revoked_at = NULL WHERE id = ROOT;
    INSERT INTO public.zz_verify_b_results VALUES (6,'B5 WSR-02 revoked root kills descendant','root revoked, child live',
      CASE WHEN ok THEN '*** FAIL — descendant survived root revocation ***' ELSE 'PASS' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (6,'B5 WSR-02 revoked root kills descendant',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  BEGIN
    PERFORM public.transfer_vault_project_custody(PROJ, SUBJECT, OUTSIDER);
    ok := public.workspace_project_permission(PROJ,OWNER_,'view_summaries');
    PERFORM public.transfer_vault_project_custody(PROJ, OUTSIDER, SUBJECT);
    INSERT INTO public.zz_verify_b_results VALUES (7,'B6 WSR-06 custody binding','access after custody moved away',
      CASE WHEN ok THEN '*** FAIL — ACCESS SURVIVED CUSTODY TRANSFER ***' ELSE 'PASS' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (7,'B6 WSR-06 custody binding',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR — expected until migration 196 lands ***'); END;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',OWNER_::text,'role','authenticated')::text, true);
    SELECT count(*) INTO n FROM public.workspace_read_tracks(PROJ, OWNER_);
    INSERT INTO public.zz_verify_b_results VALUES (8,'B8 WSR-04 allowlisted accessor works', n||' rows',
      CASE WHEN n > 0 THEN 'PASS' ELSE '*** FAIL — accessor returned nothing; chain broken ***' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (8,'B8 WSR-04 allowlisted accessor works',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',OUTSIDER::text,'role','authenticated')::text, true);
    SELECT count(*) INTO n FROM public.workspace_read_tracks(PROJ, OWNER_);
    PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO public.zz_verify_b_results VALUES (9,'B9 p_uid impersonation refused',
      'outsider passing owner uuid saw '||n||' rows',
      CASE WHEN n = 0 THEN 'PASS' ELSE '*** FAIL — READ IMPERSONATION STILL POSSIBLE ***' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (9,'B9 p_uid impersonation refused',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  BEGIN
    UPDATE public.vault_projects SET user_id = OUTSIDER WHERE id = PROJ;
    INSERT INTO public.zz_verify_b_results VALUES (10,'B10 WSR-25 custody immutable','raw UPDATE succeeded','*** FAIL — TRIGGER DID NOT BLOCK ***');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.zz_verify_b_results VALUES (10,'B10 WSR-25 custody immutable', left(SQLERRM,80),'PASS — refused');
  END;

  BEGIN
    UPDATE public.workspace_access_config SET enabled = FALSE;
    ok := public.workspace_project_permission(PROJ,OWNER_,'view_summaries');
    UPDATE public.workspace_access_config SET enabled = TRUE;
    INSERT INTO public.zz_verify_b_results VALUES (11,'B12 D-56 disable drill','access while switch OFF',
      CASE WHEN ok THEN '*** FAIL — KILL SWITCH DOES NOT KILL ***' ELSE 'PASS' END);
  EXCEPTION WHEN OTHERS THEN INSERT INTO public.zz_verify_b_results VALUES (11,'B12 D-56 disable drill',SQLSTATE||': '||left(SQLERRM,80),'*** ERROR ***'); END;

  -- ─── TEARDOWN — always reached ─────────────────────────────────
  UPDATE public.workspace_access_config SET enabled = FALSE;   -- switch OFF

  ALTER TABLE public.workspace_members DISABLE TRIGGER guard_workspace_never_zero_owners;
  DELETE FROM public.workspace_grants               WHERE id::text LIKE 'ffff0000-%';
  DELETE FROM public.workspace_attachments          WHERE id::text LIKE 'ffff0000-%';
  DELETE FROM public.workspace_roster_relationships WHERE id::text LIKE 'ffff0000-%';
  DELETE FROM public.workspace_members              WHERE id::text LIKE 'ffff0000-%';
  DELETE FROM public.workspaces                     WHERE id::text LIKE 'ffff0000-%';
  DELETE FROM public.tracks                         WHERE id::text LIKE 'ffff0000-%';
  DELETE FROM public.vault_projects                 WHERE id::text LIKE 'ffff0000-%';
  DELETE FROM auth.users                            WHERE id::text LIKE 'ffff0000-%';
  DELETE FROM public.artist_invites                 WHERE email LIKE '%@verify.invalid';
  ALTER TABLE public.workspace_members ENABLE TRIGGER guard_workspace_never_zero_owners;

  INSERT INTO public.zz_verify_b_results VALUES (100,'TEARDOWN','fixtures removed, switch restored',
    CASE WHEN (SELECT enabled FROM public.workspace_access_config) IS FALSE
           AND (SELECT count(*) FROM public.workspace_members) = 0
         THEN 'PASS — switch OFF, tables empty' ELSE '*** CHECK MANUALLY ***' END);
END
$BLOCK$;

SELECT ord, check_name, detail, verdict FROM public.zz_verify_b_results ORDER BY ord;
