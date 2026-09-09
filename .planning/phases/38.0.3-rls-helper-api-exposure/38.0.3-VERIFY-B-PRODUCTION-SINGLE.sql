-- ============================================================
-- Phase 38.0.3 - VERIFICATION PART B, PRODUCTION SINGLE-SHOT
--
-- Behavioural proof that migration 208 (the three Tier-1 EXECUTE
-- revokes plus the one drop) and migration 209 (the thirteen Tier-2
-- caller-identity binds) do what they claim - observed against real
-- production rows.
--
-- NUMBERING: the PLAN.md for this wave says "207 and 208". 207 was
-- taken by the parallel Playbook workstream between planning and
-- execution, so wave 1 shipped 208 and wave 2 shipped 209. Wherever
-- a plan says 207/208, read 208/209. Plan 05 claims 210.
--
-- RUN THIS AFTER Part A's POST-RUN is clean:
--   .planning/phases/38.0.3-rls-helper-api-exposure/
--     38.0.3-VERIFY-A-STRUCTURAL.sql
--
-- --- WHY THIS FILE EXISTS AT ALL ------------------------------
-- This repo has NO live-Postgres test harness. Every claim the
-- text-lock suites make is a reading of SQL text, not an
-- observation of a running database. That gap is not theoretical:
--
--   * Migration 190's suite was green, its function existed, and
--     the route called it correctly - and custody transfer was
--     broken in production for a day, because migration 139's
--     differently-named `guard_owner_immutable` also fires on
--     `vault_projects` and refused the sanctioned RPC.
--   * Migration 198's suite was green while its `ON CONFLICT`
--     clause raised 42702 on the very first live call it received.
--
-- Migration 209 is locked by 208 text assertions. Not one of them
-- has seen PostgreSQL evaluate the bind. This file is this phase's
-- only behavioural proof.
--
-- --- WHAT THIS FILE WRITES: ONE TEMP TABLE, AND NOTHING ELSE --
-- IT SEEDS NOTHING. IT DELETES NOTHING. It creates no fixture, no
-- user, no post, no split sheet, no workspace. It issues no GRANT
-- and no REVOKE. It does not flip the D-56 kill switch - Part A
-- reports that switch's state and neither file touches it.
--
-- The ONLY object it creates is a session-local `TEMP` results
-- table. That is a deliberate correction, not a style choice: the
-- 38.0.1 and 38.0.2 harnesses wrote their results to a PERMANENT
-- table in `public` and LEFT IT THERE - no RLS, no revoke, which
-- makes it a PostgREST-readable table, the same class of defect
-- this phase exists to close. Part A's F2 row names that leftover
-- and reports its RLS and grant state so it can be dropped; it is
-- tracked at
-- .planning/todos/pending/2026-09-08-drop-zz-verify-b-results-public-table.md
--
-- THIS FILE DOES NOT ADD ANOTHER ONE, and it does not name that
-- table anywhere below either - the automated guard on this file is
-- a raw absence grep for that identifier, so mentioning it even in
-- prose would defeat the check. Part A is where it is reported.
--
-- --- NO POPULATION PRECONDITION. THIS IS THE BIG DIFFERENCE. --
-- 38.0.1's and 38.0.2's Part B files ABORT if `workspace_members`
-- or `workspaces` is non-empty, because they SEED FIXTURES and must
-- not seed into live data. NO SUCH GUARD EXISTS HERE, AND ITS
-- ABSENCE IS DELIBERATE.
--
-- 38.0.3-SCOPE.md warns that unlike its predecessors this phase
-- cannot lean on empty tables: Green Room, split sheets, projects
-- and works hold REAL USER DATA and always will. No fixture
-- strategy will ever satisfy the predecessors' precondition on
-- those tables. But a BIND-ONLY change does not need to seed
-- anything. What has to be proven is that a function returns a
-- DIFFERENT ANSWER DEPENDING ON WHOSE ID IS PASSED, and that is
-- observable on rows that already exist, by impersonating JWT
-- claims and reading.
--
-- So this file PREFERS the tables non-empty. Real rows are what
-- make its positive controls mean anything. Part A's F3 block
-- reports the counts in advance; a zero there does not stop this
-- file, it only tells you which assertions will record INFO for
-- want of a subject.
--
-- --- THE IMPERSONATION IDIOM IS NOT NEW -----------------------
--   set_config('request.jwt.claims',
--              json_build_object('sub', <uuid>, 'role','authenticated')::text,
--              true)
-- followed by `SET LOCAL ROLE authenticated`, with `RESET ROLE` in
-- the exception handler, is already proven twice against THIS
-- production database:
--   * 38.0.1-VERIFY-B-PRODUCTION-SINGLE.sql lines 169-201
--   * 38.0.2-VERIFY-B-PRODUCTION-SINGLE.sql lines 465-857
-- It is copied, not reinvented.
--
-- --- EVERY NEGATIVE IS PAIRED WITH A POSITIVE CONTROL ---------
-- THIS IS THE POINT ON WHICH THE HARNESS LIVES OR DIES.
--
-- A helper that returns `false`/NULL to EVERYBODY passes every
-- cross-user check in this file while being completely broken -
-- and that failure mode would take down Green Room reads, split
-- sheet reads, the workspace roster and the audit log in one go.
-- Migration 209 replaces thirteen function bodies; a copy error in
-- any one of them produces exactly that.
--
-- So every cross-user FALSE is paired with a same-user TRUE ON THE
-- SAME REAL ROW: B1 for B2, B3 for B4, and B11's row-count
-- comparison on a live RLS-protected read. If B1, B3 or B11 fails,
-- MIGRATIONS 208 AND 209 MUST BE REVERTED, NOT DEBUGGED IN PLACE.
--
-- The subjects are chosen so the cross-user calls are DISCRIMINATING
-- rather than trivially false:
--   * B2's other viewer is a real profile that could genuinely see
--     the post (public post, published, public author, no block in
--     either direction), so a FALSE there is the bind and only the
--     bind.
--   * B4's other party is a SECOND REAL PARTY TO THE SAME SPLIT
--     SHEET, so before migration 209 the cross-user call returned
--     TRUE. A FALSE is the bind and only the bind.
-- Where a discriminating subject is unavailable the row says so in
-- its detail column and downgrades itself, rather than reporting a
-- weak PASS as a strong one.
--
-- --- WHAT THIS FILE CANNOT PROVE ------------------------------
-- IT IS NOT AN HTTP REQUEST. It exercises the functions from inside
-- PostgreSQL with impersonated claims, which is the same evaluation
-- path PostgREST uses once a request reaches the database - but it
-- says nothing about whether the ROUTE still exists.
--
-- OWNER ACTION, ONE COMMAND, AFTER THIS FILE:
--
--   curl -i -X POST \
--     "https://<PROJECT-REF>.supabase.co/rest/v1/rpc/workspace_member_role" \
--     -H "apikey: <ANON KEY>" \
--     -H "Authorization: Bearer <ANON KEY>" \
--     -H "Content-Type: application/json" \
--     -d '{"p_workspace_id":"00000000-0000-0000-0000-000000000000",
--          "p_uid":"00000000-0000-0000-0000-000000000000"}'
--
-- Expect 401 or 403 (PostgREST surfaces 42501 as one of those).
-- RECORD THE HTTP STATUS IN THE VERIFICATION RECORD. That is the
-- only assertion in this phase that proves anything about the
-- endpoint itself rather than about the privilege behind it.
--
-- Repeat it for `workspace_access_enabled` (a Tier-1 revoke) and
-- for `workspace_roster_relationship_is_live` (the drop) - the
-- latter should come back 404, not 401, because the function is
-- gone rather than forbidden.
--
-- --- HOW TO RUN IT --------------------------------------------
-- RUN THE WHOLE FILE AS ONE PASTE. The results table is `TEMP`, so
-- it must survive from the CREATE at the top to the SELECT at the
-- bottom on the same connection. If the editor's connection does
-- not keep it, you will get `relation "verify_b_38_0_3" does not
-- exist` - the fix is to re-run the paste in one go, not to split
-- it.
--
-- The table is created `IF NOT EXISTS` and every row carries
-- `run_at`; the closing SELECT returns only the MOST RECENT run, so
-- pasting the file twice in one session shows the second run rather
-- than both interleaved.
--
-- SAFETY:
--   * One `DO` block = one statement = one transaction. If anything
--     escapes, the whole thing rolls back, and there is nothing to
--     roll back anyway because nothing is written.
--   * Every assertion is its own `BEGIN ... EXCEPTION` sub-
--     transaction, so one failure costs one result row rather than
--     the whole result set.
--   * `RESET ROLE` and `set_config('request.jwt.claims', NULL, true)`
--     run on BOTH the success path and the failure path of every
--     assertion that changes role. This is the 38.0.1 B10 lesson: a
--     `SET LOCAL ROLE` that is not reset leaves every later
--     statement running as the wrong role, which would silently
--     invalidate every assertion after it. B13 asserts the session
--     is clean at the end.
--   * The results table is written ONLY while the session has been
--     reset to its own role. A `TEMP` table belongs to the session
--     user; an INSERT attempted while impersonating `authenticated`
--     would fail on privileges and lose the row.
--
-- Read the `verdict` column. Anything containing FAIL is a finding.
-- Rows marked INFO carry NO pass/fail and must not be reported as
-- passes - see B5 and B6 in particular.
-- ============================================================

CREATE TEMP TABLE IF NOT EXISTS verify_b_38_0_3 (
  ord        INT,
  check_name TEXT,
  detail     TEXT,
  verdict    TEXT,
  run_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $BLOCK$
DECLARE
  -- deterministic generic pair
  v_u1            UUID;
  v_u2            UUID;
  -- Green Room subjects
  v_post          UUID;
  v_author        UUID;
  v_viewer        UUID;      -- a real profile that COULD see the post
  v_gr_strict     BOOLEAN := FALSE;
  -- split sheet subjects
  v_sheet         UUID;
  v_party         UUID;
  v_party2        UUID;      -- second REAL party to the SAME sheet
  v_ss_strict     BOOLEAN := FALSE;
  -- a real project id if one exists, else synthetic
  v_project       UUID;
  v_proj_real     BOOLEAN := FALSE;

  ok              BOOLEAN;
  txt             TEXT;
  n               BIGINT;
  n2              BIGINT;
  v_base_own      BIGINT;
  v_base_comments BIGINT;
  v_ws            BIGINT;
  v_wsm           BIGINT;
  v_state         TEXT;
  v_msg           TEXT;
  v_unexpected    BOOLEAN;

  -- A uuid that belongs to nobody. Used only where the ARGUMENT VALUE is
  -- irrelevant to what is being asserted (B5/B6, and B10's project id when no
  -- real project exists). Never used to stand in for a real subject.
  NOBODY CONSTANT UUID := '00000000-0000-0000-0000-000000000000';
BEGIN

  -- ==============================================================
  -- SUBJECT SELECTION - READ ONLY, DETERMINISTIC, NEVER INVENTED.
  --
  -- These SELECTs run as the editor's own session (normally
  -- `postgres`, the table owner, for whom RLS is not enforced), so
  -- they can see real rows. That is a READ, and it is the only way
  -- to choose a subject without seeding one. Nothing about the
  -- assertions below depends on this session's privileges: every
  -- assertion re-enters through an impersonated `authenticated`
  -- session.
  --
  -- Ordering is deterministic (`ORDER BY created_at, id`) so that
  -- re-runs pick the SAME subjects and two runs are comparable.
  -- If a subject comes back NULL the dependent assertion records an
  -- INFO row naming which positive control is unavailable. NO ID IS
  -- EVER INVENTED to keep a check alive.
  -- ==============================================================

  BEGIN
    SELECT id INTO v_u1 FROM public.user_profiles ORDER BY created_at, id LIMIT 1;
    SELECT id INTO v_u2 FROM public.user_profiles WHERE id <> v_u1 ORDER BY created_at, id LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_u1 := NULL; v_u2 := NULL; END;

  -- STRICT Green Room subject: a post whose cross-user answer would have been
  -- TRUE before migration 209. Public visibility, published, not deleted, not
  -- moderated away, author's profile public, and a second real profile with no
  -- block in either direction. Without all of that, B2's FALSE could be
  -- ordinary invisibility rather than the bind.
  BEGIN
    SELECT p.id, p.author_id, u.id
      INTO v_post, v_author, v_viewer
      FROM public.green_room_posts p
      JOIN public.user_profiles ap ON ap.id = p.author_id AND ap.is_public = TRUE
      JOIN public.user_profiles u  ON u.id <> p.author_id
     WHERE p.deleted_at IS NULL
       AND p.moderation_status = 'visible'
       AND p.status = 'published'
       AND p.published_at IS NOT NULL
       AND p.visibility = 'public'
       AND NOT EXISTS (
             SELECT 1 FROM public.blocks b
              WHERE (b.blocker_id = u.id AND b.blocked_id = p.author_id)
                 OR (b.blocker_id = p.author_id AND b.blocked_id = u.id))
     ORDER BY p.created_at, p.id, u.created_at, u.id
     LIMIT 1;
    IF v_post IS NOT NULL THEN v_gr_strict := TRUE; END IF;
  EXCEPTION WHEN OTHERS THEN
    -- PL/pgSQL variable assignments are NOT rolled back by a subtransaction, so
    -- a partially-populated INTO must be cleared by hand or the LOOSE fallback
    -- below would inherit a stale author with a null post.
    v_post := NULL; v_author := NULL; v_viewer := NULL; v_gr_strict := FALSE; END;

  -- LOOSE fallback: any visible, undeleted post. B1 (the positive control)
  -- still works - the author branch of green_room_can_view_post admits the
  -- author regardless of publish state - but B2 is downgraded and says so.
  IF v_post IS NULL THEN
    BEGIN
      SELECT p.id, p.author_id
        INTO v_post, v_author
        FROM public.green_room_posts p
       WHERE p.deleted_at IS NULL AND p.moderation_status = 'visible'
       ORDER BY p.created_at, p.id
       LIMIT 1;
      SELECT id INTO v_viewer FROM public.user_profiles
       WHERE id <> v_author ORDER BY created_at, id LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_post := NULL; v_author := NULL; v_viewer := NULL; END;
  END IF;

  -- STRICT split-sheet subject: a sheet with TWO distinct real party user ids.
  -- Before migration 209, `is_split_sheet_party(sheet, other_party)` returned
  -- TRUE for that pair. After it, FALSE. That makes B4 a real discriminator
  -- rather than a question whose answer was always no.
  BEGIN
    SELECT a.split_sheet_id, a.user_id, b.user_id
      INTO v_sheet, v_party, v_party2
      FROM public.split_sheet_parties a
      JOIN public.split_sheet_parties b
        ON b.split_sheet_id = a.split_sheet_id AND b.user_id <> a.user_id
     WHERE a.user_id IS NOT NULL AND b.user_id IS NOT NULL
     ORDER BY a.split_sheet_id, a.user_id, b.user_id
     LIMIT 1;
    IF v_sheet IS NOT NULL THEN v_ss_strict := TRUE; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_sheet := NULL; v_party := NULL; v_party2 := NULL; v_ss_strict := FALSE; END;

  IF v_sheet IS NULL THEN
    BEGIN
      SELECT a.split_sheet_id, a.user_id
        INTO v_sheet, v_party
        FROM public.split_sheet_parties a
       WHERE a.user_id IS NOT NULL
       ORDER BY a.split_sheet_id, a.user_id
       LIMIT 1;
      SELECT id INTO v_party2 FROM public.user_profiles
       WHERE id <> v_party ORDER BY created_at, id LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_sheet := NULL; v_party := NULL; v_party2 := NULL; END;
  END IF;

  BEGIN
    SELECT id INTO v_project FROM public.vault_projects ORDER BY created_at, id LIMIT 1;
    IF v_project IS NOT NULL THEN v_proj_real := TRUE; END IF;
  EXCEPTION WHEN OTHERS THEN v_project := NULL; END;
  IF v_project IS NULL THEN v_project := NOBODY; END IF;

  BEGIN
    SELECT count(*) INTO v_ws  FROM public.workspaces;
    SELECT count(*) INTO v_wsm FROM public.workspace_members;
  EXCEPTION WHEN OTHERS THEN v_ws := NULL; v_wsm := NULL; END;

  -- B0 - what was selected. UUIDs are abbreviated to their first eight
  -- characters ON PURPOSE: this output is pasted into a planning document, and
  -- these are the ids of real Funun users. Eight characters is enough to
  -- confirm two subjects are distinct and that a re-run picked the same pair.
  INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
    1, 'B0 subjects selected (INFO)',
    'u1=' || coalesce(left(v_u1::text,8),'(none)')
      || ' u2=' || coalesce(left(v_u2::text,8),'(none)')
      || ' | post=' || coalesce(left(v_post::text,8),'(none)')
      || ' author=' || coalesce(left(v_author::text,8),'(none)')
      || ' viewer=' || coalesce(left(v_viewer::text,8),'(none)')
      || ' green_room_subject=' || CASE WHEN v_post IS NULL THEN 'NONE'
                                        WHEN v_gr_strict THEN 'STRICT' ELSE 'LOOSE' END
      || ' | sheet=' || coalesce(left(v_sheet::text,8),'(none)')
      || ' party=' || coalesce(left(v_party::text,8),'(none)')
      || ' party2=' || coalesce(left(v_party2::text,8),'(none)')
      || ' split_sheet_subject=' || CASE WHEN v_sheet IS NULL THEN 'NONE'
                                         WHEN v_ss_strict THEN 'STRICT' ELSE 'LOOSE' END
      || ' | project=' || CASE WHEN v_proj_real THEN left(v_project::text,8) || ' (real)'
                               ELSE 'synthetic' END
      || ' | workspaces=' || coalesce(v_ws::text,'?')
      || ' workspace_members=' || coalesce(v_wsm::text,'?'),
    'INFO - STRICT means the cross-user call would have answered TRUE before migration 209, so a FALSE below is the bind. LOOSE means it may have answered FALSE anyway - those rows downgrade themselves.'
  );

  -- ==============================================================
  -- B1 / B2 - green_room_can_view_post. THE PAIR.
  --
  -- Both calls are made from the SAME impersonated session (the
  -- post's real author) against the SAME real post. The only thing
  -- that differs is the uuid passed as `p_viewer`.
  --
  -- B1 IS WHAT MAKES B2 A FINDING. On its own, B2 returning false
  -- is equally consistent with "the bind works" and "the function
  -- is broken and answers false to everybody" - and the second
  -- would take the whole Green Room down.
  -- ==============================================================

  IF v_post IS NULL OR v_author IS NULL THEN
    INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
      2, 'B1 POSITIVE CONTROL green_room_can_view_post(post, SELF)',
      'no visible, undeleted green_room_posts row exists to use as a subject',
      'INFO - SKIPPED, no subject. The positive control for B2 is UNAVAILABLE, so B2 below proves nothing on its own.');
    INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
      3, 'B2 THE BIND green_room_can_view_post(post, OTHER)',
      'skipped for want of a subject', 'INFO - SKIPPED, no subject');
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_author::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      ok := public.green_room_can_view_post(v_post, v_author);
      RESET ROLE;
      PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
        2, 'B1 POSITIVE CONTROL green_room_can_view_post(post, SELF)',
        'impersonating the post''s real author - returned ' || coalesce(ok::text,'NULL'),
        CASE WHEN ok IS TRUE
             THEN 'PASS - the author can still see their own post - the helper has NOT been broken toward answering false to everybody'
             ELSE '*** FAIL - THE POSITIVE CONTROL FAILED. The bound helper refuses the caller''s own row. Green Room reads are down. REVERT 208 AND 209 - DO NOT DEBUG IN PLACE. ***' END);
    EXCEPTION WHEN OTHERS THEN
      v_state := SQLSTATE; v_msg := left(SQLERRM, 120);
      RESET ROLE; PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
        2, 'B1 POSITIVE CONTROL green_room_can_view_post(post, SELF)',
        v_state || ': ' || v_msg, '*** ERROR - treat as a FAILED positive control ***');
    END;

    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_author::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      ok := public.green_room_can_view_post(v_post, v_viewer);
      RESET ROLE;
      PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
        3, 'B2 THE BIND green_room_can_view_post(post, OTHER)',
        'still impersonating the author, asking about viewer '
          || coalesce(left(v_viewer::text,8),'(none)') || ' - returned ' || coalesce(ok::text,'NULL')
          || CASE WHEN v_gr_strict
                  THEN ' [STRICT subject: public published post, public author, no block either way - this call returned TRUE before migration 209]'
                  ELSE ' [LOOSE subject: this call may have answered FALSE before 209 as well]' END,
        CASE
          WHEN ok IS TRUE
            THEN '*** FAIL - CROSS-USER DISCLOSURE IS STILL OPEN. `p_viewer` is not bound to auth.uid(). ***'
          WHEN NOT v_gr_strict
            THEN 'WEAK PASS - returned false, but no STRICT subject was available, so this does not discriminate the bind from ordinary invisibility. Re-run when a public published post by a public author exists.'
          ELSE 'PASS - refuses to answer a question about another viewer, on a post that viewer could genuinely have seen'
        END);
    EXCEPTION WHEN OTHERS THEN
      v_state := SQLSTATE; v_msg := left(SQLERRM, 120);
      RESET ROLE; PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
        3, 'B2 THE BIND green_room_can_view_post(post, OTHER)',
        v_state || ': ' || v_msg, '*** ERROR ***');
    END;
  END IF;

  -- ==============================================================
  -- B3 / B4 - is_split_sheet_party. THE SECOND PAIR.
  --
  -- THIS HELPER'S IDENTITY PARAMETER IS NAMED `uid`, NOT `p_uid`.
  -- `CREATE OR REPLACE FUNCTION` cannot rename a parameter, so a
  -- bind written against `p_uid` would be a NO-OP THAT READS AS A
  -- FIX - and because `uid` is a substring of `p_uid`, wave 2's
  -- text assertion only caught that mutation via a word-boundary
  -- NEGATIVE check. B4 is the behavioural version of that catch.
  -- ==============================================================

  IF v_sheet IS NULL OR v_party IS NULL THEN
    INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
      4, 'B3 POSITIVE CONTROL is_split_sheet_party(sheet, SELF)',
      'no split_sheet_parties row with a non-null user_id exists',
      'INFO - SKIPPED, no subject. B4''s positive control is UNAVAILABLE.');
    INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
      5, 'B4 THE BIND is_split_sheet_party(sheet, OTHER)',
      'skipped for want of a subject', 'INFO - SKIPPED, no subject');
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_party::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      ok := public.is_split_sheet_party(v_sheet, v_party);
      RESET ROLE;
      PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
        4, 'B3 POSITIVE CONTROL is_split_sheet_party(sheet, SELF)',
        'impersonating a real party to a real sheet - returned ' || coalesce(ok::text,'NULL')
          || ' | identity parameter of this helper is `uid`, NOT `p_uid`',
        CASE WHEN ok IS TRUE
             THEN 'PASS - a real party is still recognised as a party - the helper is not answering false to everybody'
             ELSE '*** FAIL - THE POSITIVE CONTROL FAILED. Split-sheet reads are down: the policy "Parties can view split sheets" now admits nobody. REVERT. ***' END);
    EXCEPTION WHEN OTHERS THEN
      v_state := SQLSTATE; v_msg := left(SQLERRM, 120);
      RESET ROLE; PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
        4, 'B3 POSITIVE CONTROL is_split_sheet_party(sheet, SELF)',
        v_state || ': ' || v_msg, '*** ERROR - treat as a FAILED positive control ***');
    END;

    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_party::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      ok := public.is_split_sheet_party(v_sheet, v_party2);
      RESET ROLE;
      PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
        5, 'B4 THE BIND is_split_sheet_party(sheet, OTHER)',
        'still impersonating the first party, asking about '
          || coalesce(left(v_party2::text,8),'(none)') || ' - returned ' || coalesce(ok::text,'NULL')
          || CASE WHEN v_ss_strict
                  THEN ' [STRICT subject: the other id is a SECOND REAL PARTY TO THE SAME SHEET - this call returned TRUE before migration 209]'
                  ELSE ' [LOOSE subject: the other id is not a party, so this call answered FALSE before 209 too]' END
          || ' | if 209 bound `p_uid` instead of `uid`, this is the row that catches it',
        CASE
          WHEN ok IS TRUE
            THEN '*** FAIL - CROSS-USER DISCLOSURE IS STILL OPEN on is_split_sheet_party. Check that migration 209 bound `uid`, not `p_uid`. ***'
          WHEN NOT v_ss_strict
            THEN 'WEAK PASS - returned false, but the other id was never a party, so this does not discriminate the bind. Re-run when a sheet with two signed-up parties exists.'
          ELSE 'PASS - refuses to answer whether ANOTHER real party is a party to the sheet'
        END);
    EXCEPTION WHEN OTHERS THEN
      v_state := SQLSTATE; v_msg := left(SQLERRM, 120);
      RESET ROLE; PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
        5, 'B4 THE BIND is_split_sheet_party(sheet, OTHER)',
        v_state || ': ' || v_msg, '*** ERROR ***');
    END;
  END IF;

  -- ==============================================================
  -- B5 / B6 - workspace_member_role. DISCLOSED HONESTLY: THIS IS
  -- THE ONE TIER-2 BIND THIS HARNESS CANNOT PROVE.
  --
  -- CARRY-FORWARD W1 FROM 38.0.3-ORCHESTRATOR-NOTES.md, RESTATED
  -- HERE SO IT CANNOT BE LOST BETWEEN DOCUMENTS.
  --
  -- `workspace_member_role` is the 37-reference helper. It feeds
  -- the RLS reads on `workspace_audit_log`,
  -- `workspace_roster_relationships`, `workspaces`,
  -- `workspace_members`, `workspace_invitations`,
  -- `workspace_grants`, `workspace_permission_bundles` and
  -- `workspace_permission_requests` - ten live policies, more than
  -- any other helper in this phase.
  --
  -- IT CANNOT BE PROVEN BEHAVIOURALLY WHILE D-56 IS OFF, because
  -- the workspace tables are EMPTY. Its self-call returns NULL FOR
  -- LACK OF DATA, not for lack of authorisation, so THERE IS NO
  -- POSITIVE CONTROL - and without one, "the bind works" and
  -- "the helper returns NULL to everybody" are indistinguishable.
  -- It is the one Tier-2 helper whose "returns NULL to everybody"
  -- failure mode this harness CANNOT detect.
  --
  -- BOTH ROWS BELOW ARE THEREFORE **INFO**, NOT PASS. Do not
  -- report them as passes. Structural cover is Part A's B1 row
  -- (the deployed definition contains the CASE-shaped bind against
  -- `p_uid`), and structure is not behaviour.
  --
  -- ACTION, WHICH BELONGS ON THE D-56 CUTOVER CHECKLIST AND NOT
  -- ONLY ON THIS PHASE'S CLOSE:
  --   RE-RUN B5 AND B6 ONCE D-56 IS SWITCHED ON AND AT LEAST ONE
  --   WORKSPACE HAS TWO MEMBERS, **BEFORE BETA TRAFFIC**. At that
  --   point B5 becomes a real positive control (self-call returns
  --   the caller's actual role) and B6 becomes a real negative.
  -- ==============================================================

  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', coalesce(v_u1, NOBODY)::text, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    txt := public.workspace_member_role(NOBODY, coalesce(v_u1, NOBODY));
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
      6, 'B5 workspace_member_role(ws, SELF) - W1, NO POSITIVE CONTROL',
      'returned ' || coalesce(txt, 'NULL')
        || ' | workspaces=' || coalesce(v_ws::text,'?')
        || ' workspace_members=' || coalesce(v_wsm::text,'?'),
      CASE WHEN coalesce(v_wsm, 0) = 0
           THEN 'INFO - NOT A PASS. workspace_members is empty, so NULL here means "no data", not "authorised". This is carry-forward W1: the bind on the phase''s most-referenced helper is proven STRUCTURALLY (Part A B1) and NOT behaviourally. RE-RUN B5/B6 AFTER D-56 IS ON, BEFORE BETA TRAFFIC.'
           ELSE 'INFO - workspace_members is NO LONGER EMPTY. Re-run this file against a real (workspace, member) pair: B5 must return that member''s actual role, and only then does B6 mean anything.' END);
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE; v_msg := left(SQLERRM, 120);
    RESET ROLE; PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
      6, 'B5 workspace_member_role(ws, SELF) - W1, NO POSITIVE CONTROL',
      v_state || ': ' || v_msg,
      CASE WHEN v_state = '42501'
           THEN '*** FAIL - authenticated LOST EXECUTE on a Tier-2 helper. The TRAP was applied to the wrong tier - every policy calling it is about to raise 42501. REVERT. ***'
           ELSE '*** ERROR ***' END);
  END;

  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', coalesce(v_u1, NOBODY)::text, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    txt := public.workspace_member_role(NOBODY, coalesce(v_u2, NOBODY));
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
      7, 'B6 workspace_member_role(ws, OTHER) - W1, WEAKER THAN B2/B4',
      'impersonating u1, asking about u2 - returned ' || coalesce(txt, 'NULL'),
      CASE WHEN txt IS NOT NULL
           THEN '*** FAIL - returned a role for another user. The CASE guard is not binding p_uid to auth.uid(). ***'
           ELSE 'INFO - NULL, as required, BUT THIS IS NOT A PASS. B6 is strictly weaker than B2 and B4: those two have a same-user positive control on the same real row and this one does not, because the workspace tables are empty while D-56 is off. A helper that returned NULL to EVERYBODY would produce this identical row while having taken down workspace_audit_log, workspace_roster_relationships and workspaces reads. RE-RUN AFTER D-56 IS ON.' END);
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE; v_msg := left(SQLERRM, 120);
    RESET ROLE; PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
      7, 'B6 workspace_member_role(ws, OTHER) - W1, WEAKER THAN B2/B4',
      v_state || ': ' || v_msg, '*** ERROR ***');
  END;

  -- ==============================================================
  -- B7 - THE SERVICE-ROLE BRANCH. CLOSES RESEARCH ASSUMPTION A2.
  --
  -- Two application routes call these helpers through a SERVICE
  -- client, on a connection where `auth.uid()` is NULL:
  --   lib/trust-safety/reports.ts:179  -> green_room_can_view_post
  --   lib/green-room/placements-admin.ts:353 -> no_block
  -- Both ask about somebody who is not the caller, which is exactly
  -- what the bind refuses. The `auth.role() = 'service_role'`
  -- disjunct is the escape hatch that keeps them working, and until
  -- this row runs its presence is only a text assertion.
  --
  -- Claims are set with role=service_role and NO `sub`, and the
  -- session role is deliberately NOT changed - that is the shape of
  -- a supabase-js service-client connection.
  --
  -- SCOPE OF THE PROOF, STATED PLAINLY: this proves the DATABASE
  -- side - that the disjunct fires when auth.uid() is NULL and
  -- auth.role() is 'service_role'. It does NOT prove that
  -- supabase-js actually sets role='service_role' in the JWT. That
  -- is corroborated instead by migration 174 already shipping this
  -- same branch in production with those routes working.
  -- ==============================================================

  IF v_post IS NULL OR v_viewer IS NULL OR NOT v_gr_strict THEN
    INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
      8, 'B7 service_role disjunct fires when auth.uid() is NULL',
      'needs the STRICT Green Room subject (a post the OTHER viewer could genuinely see) - not available',
      'INFO - SKIPPED. Without a subject whose true answer is TRUE, a TRUE here would be unprovable and a FALSE ambiguous.');
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('role', 'service_role')::text, true);
      ok := public.green_room_can_view_post(v_post, v_viewer);
      PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
        8, 'B7 service_role disjunct fires when auth.uid() is NULL',
        'claims role=service_role with NO sub, session role unchanged - same call B2 made - returned '
          || coalesce(ok::text,'NULL') || ' (B2 returned false for this same pair)',
        CASE WHEN ok IS TRUE
             THEN 'PASS - the service path gets the TRUE answer where a bound user session gets false. lib/trust-safety/reports.ts keeps working.'
             ELSE '*** FAIL - THE SERVICE-ROLE ESCAPE DOES NOT FIRE. lib/trust-safety/reports.ts:179 and lib/green-room/placements-admin.ts:353 are broken by migration 209. Research assumption A2 is FALSE on this database. ***' END);
    EXCEPTION WHEN OTHERS THEN
      v_state := SQLSTATE; v_msg := left(SQLERRM, 120);
      PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
        8, 'B7 service_role disjunct fires when auth.uid() is NULL',
        v_state || ': ' || v_msg, '*** ERROR ***');
    END;
  END IF;

  -- ==============================================================
  -- B8 / B9 / B9b - THE TIER-1 REVOKES ARE REAL (BEHAV-3).
  --
  -- Part A reads `has_function_privilege`. That is the catalogue's
  -- opinion. These rows make `authenticated` actually try.
  --
  -- THE SQLSTATE IS RECORDED, NOT JUST "it errored", because the
  -- codes mean different things:
  --   42501 insufficient_privilege -> the revoke worked. PASS.
  --   42883 undefined_function     -> the function is GONE. That is
  --         correct for the DROP target (B9b) and a DIFFERENT
  --         FINDING for the three revoke targets.
  --   no error                     -> the revoke did not apply.
  -- ==============================================================

  v_unexpected := FALSE;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    ok := public.workspace_access_enabled();
    RESET ROLE;
    v_unexpected := TRUE;
    INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
      9, 'B8 Tier-1 revoke: workspace_access_enabled() as authenticated',
      'call SUCCEEDED and returned ' || coalesce(ok::text,'NULL'),
      '*** FAIL - authenticated CAN STILL EXECUTE IT. Migration 208 did not apply, or something re-granted (see Part A''s C-block). ***');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE; v_msg := left(SQLERRM, 120);
    RESET ROLE;
    IF NOT v_unexpected THEN
      INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
        9, 'B8 Tier-1 revoke: workspace_access_enabled() as authenticated',
        'SQLSTATE ' || v_state || ': ' || v_msg,
        CASE v_state
          WHEN '42501' THEN 'PASS - 42501 insufficient_privilege. The revoke is real, not merely written.'
          WHEN '42883' THEN '*** FAIL - 42883: the FUNCTION IS GONE. Migration 208 revokes this one, it never drops it. Eleven definer bodies call it. ***'
          ELSE '*** ERROR - unexpected SQLSTATE - expected 42501 ***' END);
    END IF;
  END;

  v_unexpected := FALSE;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    ok := public.green_room_post_matches_custom_audience(coalesce(v_post, NOBODY), coalesce(v_viewer, NOBODY));
    RESET ROLE;
    v_unexpected := TRUE;
    INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
      10, 'B9 Tier-1 revoke: green_room_post_matches_custom_audience(uuid,uuid) as authenticated',
      'call SUCCEEDED and returned ' || coalesce(ok::text,'NULL'),
      '*** FAIL - authenticated CAN STILL EXECUTE IT. The custom-audience membership of any post is still readable as an RPC. ***');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE; v_msg := left(SQLERRM, 120);
    RESET ROLE;
    IF NOT v_unexpected THEN
      INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
        10, 'B9 Tier-1 revoke: green_room_post_matches_custom_audience(uuid,uuid) as authenticated',
        'SQLSTATE ' || v_state || ': ' || v_msg,
        CASE v_state
          WHEN '42501' THEN 'PASS - 42501 insufficient_privilege. The revoke is real.'
          WHEN '42883' THEN '*** FAIL - 42883: the FUNCTION IS GONE. 208 revokes this one - green_room_can_view_post calls it from its own body. ***'
          ELSE '*** ERROR - unexpected SQLSTATE - expected 42501 ***' END);
    END IF;
  END;

  v_unexpected := FALSE;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    ok := public.workspace_roster_relationship_is_live(NOBODY, NOBODY);
    RESET ROLE;
    v_unexpected := TRUE;
    INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
      11, 'B9b Tier-1 DROP: workspace_roster_relationship_is_live as authenticated',
      'call SUCCEEDED and returned ' || coalesce(ok::text,'NULL'),
      '*** FAIL - the function is present AND executable. Neither the drop nor the documented 2BP01 revoke fallback applied. ***');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE; v_msg := left(SQLERRM, 120);
    RESET ROLE;
    IF NOT v_unexpected THEN
      INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
        11, 'B9b Tier-1 DROP: workspace_roster_relationship_is_live as authenticated',
        'SQLSTATE ' || v_state || ': ' || v_msg,
        CASE v_state
          WHEN '42883' THEN 'PASS - 42883 undefined_function. The drop applied - the endpoint no longer exists rather than being guarded.'
          WHEN '42501' THEN 'PASS (FALLBACK PATH) - 42501: still present but revoked. This is migration 208''s documented 2BP01 fallback. Confirm the owner took it deliberately, and cross-read Part A''s A2 row.'
          ELSE '*** ERROR - unexpected SQLSTATE - expected 42883 (dropped) or 42501 (fallback) ***' END);
    END IF;
  END;

  -- ==============================================================
  -- B10 - THE Q2 COROLLARY, AND THE ASSERTION THAT WOULD CATCH THE
  --       WORST POSSIBLE MISTAKE IN THIS PHASE.
  --
  -- The entire safety argument for migration 208 is that a
  -- SECURITY DEFINER body executes with the privileges of the
  -- function OWNER, so a caller that can no longer EXECUTE
  -- `workspace_access_enabled()` directly can still reach it
  -- THROUGH a definer that calls it.
  --
  -- `workspace_project_permission` calls BOTH revoked helpers from
  -- inside its own body - `workspace_access_enabled()` and
  -- `workspace_grant_lineage_live(g.id)`. Called here as
  -- `authenticated`, it MUST RETURN A BOOLEAN AND MUST NOT RAISE.
  -- The VALUE IS NOT THE POINT: false is a perfectly good answer
  -- when there is no grant. What is being tested is that it
  -- ANSWERS AT ALL.
  --
  -- The caller's own uuid is passed as `p_uid` deliberately, so
  -- migration 209's bind is satisfied and evaluation proceeds INTO
  -- the body where the revoked calls live. Passing a stranger's id
  -- would let the bind short-circuit and the row would prove
  -- nothing.
  --
  -- IF THIS RAISES 42501, THE Q2 COROLLARY IS WRONG FOR THIS
  -- DATABASE AND MIGRATION 208 MUST BE REVERTED.
  -- ==============================================================

  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', coalesce(v_u1, NOBODY)::text, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    ok := public.workspace_project_permission(v_project, coalesce(v_u1, NOBODY), 'view_summaries');
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
      12, 'B10 definer-body callers survive the Tier-1 revoke (Q2 corollary)',
      'workspace_project_permission returned ' || coalesce(ok::text,'NULL')
        || ' without raising, as authenticated, on a '
        || CASE WHEN v_proj_real THEN 'REAL' ELSE 'synthetic' END || ' project id'
        || ' | its body calls workspace_access_enabled() and workspace_grant_lineage_live(), BOTH revoked from authenticated by migration 208',
      'PASS - a definer body still reaches the revoked helpers, exactly as the owner-privilege model requires. The value returned is irrelevant.');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE; v_msg := left(SQLERRM, 120);
    RESET ROLE; PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
      12, 'B10 definer-body callers survive the Tier-1 revoke (Q2 corollary)',
      'SQLSTATE ' || v_state || ': ' || v_msg,
      CASE v_state
        WHEN '42501' THEN '*** FAIL - THE Q2 COROLLARY IS WRONG ON THIS DATABASE. A definer body cannot reach the revoked helpers. REVERT MIGRATION 208. This is the worst outcome in the phase and it is why this row exists. ***'
        WHEN '42883' THEN '*** FAIL - 42883: something the body calls is GONE. If it names workspace_roster_relationship_is_live, the drop broke a caller that Part A''s E-block should have found first. ***'
        ELSE '*** ERROR - unexpected SQLSTATE ***' END);
  END;

  -- ==============================================================
  -- B11 - AN RLS-PROTECTED READ STILL RETURNS ROWS (BEHAV-4).
  --
  -- The most direct test of the "returns false to everybody"
  -- failure mode. `green_room_posts_select_visible` calls
  -- `green_room_can_view_post(id, auth.uid())`; if the bound helper
  -- were broken, this count collapses to zero and the Green Room
  -- goes dark with no error anywhere.
  --
  -- The baseline is computed BEFORE impersonation, from the
  -- editor's own session - normally `postgres`, the table owner,
  -- for whom RLS is not enforced - so it is the raw row count. The
  -- comparison is scoped to THE AUTHOR'S OWN POSTS, because those
  -- must be visible to the author under any correct version of the
  -- helper, which makes equality the right expectation rather than
  -- a vague "greater than zero".
  -- ==============================================================

  IF v_author IS NULL THEN
    INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
      13, 'B11 RLS read: author sees their own green_room_posts',
      'no author subject', 'INFO - SKIPPED, no subject');
    INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
      14, 'B11b RLS read: green_room_comments still readable',
      'no author subject', 'INFO - SKIPPED, no subject');
  ELSE
    BEGIN
      SELECT count(*) INTO v_base_own
        FROM public.green_room_posts
       WHERE author_id = v_author AND deleted_at IS NULL AND moderation_status = 'visible';

      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_author::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      SELECT count(*) INTO n
        FROM public.green_room_posts
       WHERE author_id = v_author AND deleted_at IS NULL AND moderation_status = 'visible';
      SELECT count(*) INTO n2 FROM public.green_room_posts;
      RESET ROLE;
      PERFORM set_config('request.jwt.claims', NULL, true);

      INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
        13, 'B11 RLS read: author sees their own green_room_posts',
        'baseline (editor session, RLS not enforced for the owner) = ' || v_base_own
          || '  |  as impersonated author under RLS = ' || n
          || '  |  total posts visible to that author = ' || n2,
        CASE
          WHEN v_base_own = 0
            THEN 'INFO - the author has no visible posts to count, so this row cannot discriminate. Choose a different subject or re-run when the Green Room has data.'
          WHEN n = v_base_own
            THEN 'PASS - every one of the author''s own visible posts is still readable under RLS. The helper is not answering false to everybody.'
          WHEN n = 0
            THEN '*** FAIL - DROPPED TO ZERO. This is the exact signature of a helper that now returns false to EVERYBODY. The Green Room is dark. REVERT 208 AND 209. ***'
          ELSE '*** FAIL - the author sees FEWER of their own posts than exist. The bound helper is refusing rows it must admit. ***'
        END);
    EXCEPTION WHEN OTHERS THEN
      v_state := SQLSTATE; v_msg := left(SQLERRM, 120);
      RESET ROLE; PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
        13, 'B11 RLS read: author sees their own green_room_posts',
        'SQLSTATE ' || v_state || ': ' || v_msg,
        CASE v_state
          WHEN '42501' THEN '*** FAIL - 42501 inside an RLS read. A policy calls a helper `authenticated` can no longer execute. THE TRAP HAS BEEN SPRUNG. REVERT. ***'
          ELSE '*** ERROR ***' END);
    END;

    BEGIN
      SELECT count(*) INTO v_base_comments
        FROM public.green_room_comments
       WHERE author_id = v_author AND deleted_at IS NULL AND moderation_status = 'visible';

      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_author::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      SELECT count(*) INTO n FROM public.green_room_comments;
      RESET ROLE;
      PERFORM set_config('request.jwt.claims', NULL, true);

      INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
        14, 'B11b RLS read: green_room_comments still readable',
        'author''s own visible comments (baseline) = ' || v_base_comments
          || '  |  comments visible to that author under RLS = ' || n,
        CASE
          WHEN v_base_comments = 0 AND n = 0
            THEN 'INFO - no comments to read - this row cannot discriminate.'
          WHEN n >= v_base_comments AND n > 0
            THEN 'PASS - green_room_comments_select_visible still admits rows. That policy calls BOTH green_room_can_view_post and no_block, so it also exercises the Tier-3 helper this phase does not change.'
          ELSE '*** FAIL - the comment read collapsed. Its policy calls green_room_can_view_post - a bound helper answering false to everybody produces exactly this. ***'
        END);
    EXCEPTION WHEN OTHERS THEN
      v_state := SQLSTATE; v_msg := left(SQLERRM, 120);
      RESET ROLE; PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
        14, 'B11b RLS read: green_room_comments still readable',
        'SQLSTATE ' || v_state || ': ' || v_msg,
        CASE v_state
          WHEN '42501' THEN '*** FAIL - 42501 inside an RLS read. THE TRAP HAS BEEN SPRUNG. REVERT. ***'
          ELSE '*** ERROR ***' END);
    END;
  END IF;

  -- ==============================================================
  -- B12 - INFO BASELINE FOR PLAN 06. NOT A DEFECT TO FIX HERE.
  --
  -- `rc_select_public` on `release_comments` carries NO `TO`
  -- clause, so it applies to `anon` as well as `authenticated`, and
  -- migration 061 rewrote it to call `no_block(auth.uid(), ...)`.
  -- Whatever this returns TODAY - a count, or a SQLSTATE - is the
  -- baseline that PLAN 06 MUST REPRODUCE EXACTLY after `no_block`
  -- is relocated to a non-exposed schema (owner decision D4,
  -- migration 210).
  --
  -- IT IS AN INFO ROW WITH NO VERDICT, deliberately. If it comes
  -- back 42501 that is not a bug this phase introduced and not one
  -- it fixes; it is the state plan 06 must preserve. Cross-read it
  -- against Part A's A3b row, which records whether `anon` holds
  -- EXECUTE on `no_block` at all.
  -- ==============================================================

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    EXECUTE 'SET LOCAL ROLE anon';
    SELECT count(*) INTO n FROM public.release_comments;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
      15, 'B12 anon baseline for plan 06: count(*) release_comments',
      'returned ' || n || ' row(s), no error',
      'INFO - BASELINE, NO VERDICT. Plan 06 must reproduce this EXACT outcome after relocating no_block (migration 210). Record the number.');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE; v_msg := left(SQLERRM, 120);
    RESET ROLE; PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
      15, 'B12 anon baseline for plan 06: count(*) release_comments',
      'SQLSTATE ' || v_state || ': ' || v_msg,
      'INFO - BASELINE, NO VERDICT. This is the CURRENT behaviour and is NOT a defect this phase fixes. Plan 06 must reproduce this EXACT SQLSTATE after relocating no_block. Record it verbatim.');
  END;

  -- ==============================================================
  -- B13 - THE HARNESS LEFT NOTHING BEHIND.
  --
  -- The 38.0.1 B10 lesson: a `SET LOCAL ROLE` that is not reset
  -- leaves every later statement running as the wrong role, which
  -- would silently invalidate every assertion after it. If this row
  -- fails, DISTRUST EVERY ROW ABOVE IT - the session state was not
  -- what those rows assumed.
  -- ==============================================================

  INSERT INTO verify_b_38_0_3 (ord, check_name, detail, verdict) VALUES (
    16, 'B13 session is clean - the harness wrote nothing',
    'current_user=' || current_user || '  session_user=' || session_user
      || '  request.jwt.claims=' || coalesce(nullif(current_setting('request.jwt.claims', true), ''), '(unset)')
      || '  | this file created ONE temp table and no other object, and issued no INSERT, UPDATE or DELETE against any application table',
    CASE WHEN current_user = session_user
              AND coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') = ''
         THEN 'PASS - role reset and impersonation cleared'
         ELSE '*** FAIL - THE SESSION IS STILL IMPERSONATING. Every row above ran under uncertain identity - distrust all of them, close this connection and re-run in a fresh one. ***' END);

END
$BLOCK$;

-- Only the most recent run. Paste the file twice in one session and you see
-- the second run, not both interleaved.
SELECT ord, check_name, detail, verdict
FROM verify_b_38_0_3
WHERE run_at = (SELECT max(run_at) FROM verify_b_38_0_3)
ORDER BY ord;

-- ============================================================
-- END OF PART B. HOW TO READ IT.
--
-- THE POSITIVE CONTROLS ARE B1, B3 AND B11. If any of those fails,
-- a helper is returning false to everybody: REVERT MIGRATIONS 208
-- AND 209. DO NOT DEBUG IN PLACE - Green Room reads, split-sheet
-- reads and the workspace roster are all downstream of these
-- thirteen bodies.
--
-- THE BIND ASSERTIONS ARE B2 AND B4. Each is meaningful only
-- because its positive control passed on the same real row.
--
-- B5 AND B6 ARE INFO, NOT PASSES. `workspace_member_role` - the
-- 37-reference helper feeding workspace_audit_log,
-- workspace_roster_relationships and workspaces - is proven
-- STRUCTURALLY ONLY (Part A, row B1). RE-RUN B5/B6 ONCE D-56 IS ON
-- AND A WORKSPACE HAS TWO MEMBERS, BEFORE BETA TRAFFIC. Put it on
-- the D-56 cutover checklist, not only on this phase's close.
--
-- B12 IS A BASELINE FOR PLAN 06, not a verdict. Record its exact
-- outcome.
--
-- STILL TO DO AFTER THIS FILE: the three `curl` calls in the header.
-- Nothing in this file proves the HTTP route is gone - only that
-- the privilege behind it is.
-- ============================================================
