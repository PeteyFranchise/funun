-- ============================================================
-- Phase 38.0.3 - VERIFICATION PART B2: BEHAVIOURAL, `no_block`
-- RELOCATION (migration 210, Tier 3, owner decision D4)
--
-- RUN THE WHOLE FILE AS ONE PASTE in the Supabase SQL editor,
-- against PRODUCTION, AFTER `38.0.3-VERIFY-A2-NO-BLOCK.sql` reads
-- clean.
--
-- --- 0. WHAT THIS FILE WRITES -------------------------------------
--
-- WRITE-STATEMENT COUNT: 1 `CREATE TEMP TABLE` and 25 `INSERT`
-- statements, ALL of them against that one TEMP table. That is the
-- entire mutation footprint. (25 INSERT statements, not 25 result
-- rows: the two loops each emit one row per iteration from a single
-- statement, and the mutually exclusive branches mean only one of
-- each pair ever runs.)
--
-- WRITES TO APPLICATION TABLES: ZERO. There is no INSERT, UPDATE,
-- DELETE or TRUNCATE against any table in `public` or `auth`
-- anywhere in this file. It seeds nothing, creates no user, no
-- post, no comment, no block. It issues no GRANT and no REVOKE. It
-- performs no DDL outside the one TEMP table. It does not flip the
-- D-56 kill switch - Part A2 reports that switch's state and
-- neither file touches it.
--
-- ON THAT TEMP TABLE, EXPLICITLY, BECAUSE THE PHASE HAS A SCAR
-- HERE: the 38.0.1 and 38.0.2 harnesses wrote their results to a
-- PERMANENT table in `public` and left it there - no RLS, no
-- revoke, which makes it a PostgREST-readable table, the same class
-- of defect this phase exists to close, and it had to be dropped by
-- hand. THIS FILE DOES NOT DO THAT. `CREATE TEMP TABLE` places the
-- table in this connection's `pg_temp` schema. PostgREST does not
-- introspect `pg_temp`, no other session can see it, and it is
-- destroyed when the connection closes. It cannot be left behind.
--
-- A TEMP table is not a style preference here, it is a
-- requirement of the mechanism: every assertion below has to change
-- role and then change back, which needs PL/pgSQL, and a `DO` block
-- returns no result set. Accumulating rows somewhere and selecting
-- them at the end is the only way this file can report anything at
-- all. The results still come back as ONE `SELECT` at the foot of
-- the file.
--
-- --- 1. THIS FILE IS RUN TWICE, AND THE COMPARISON IS THE
--        ASSERTION -----------------------------------------------
-- Several rows below carry NO pass/fail. They are INFO counts, and
-- THEIR VALUE IS THE ASSERTION: the owner runs this file, keeps the
-- output, and compares it against the other run side by side. Any
-- count that MOVED is a finding.
--
-- Read that literally for the B2-4 block. A count that dropped to
-- zero is the signature of a policy that now refuses everything - a
-- silent, total read outage with no error anywhere. A count that
-- rose is the signature of a policy that now permits more than it
-- did. Both are findings and neither raises an exception.
--
-- EVERY SUBJECT-SELECTION QUERY IS DETERMINISTICALLY ORDERED so the
-- two runs pick IDENTICAL rows. Row B2-0 prints which subjects were
-- chosen precisely so that can be checked rather than assumed.
-- RE-ORDERING ANY OF THEM SILENTLY INVALIDATES THE COMPARISON: the
-- counts would then differ because the subject changed, and nothing
-- in the output would say so.
--
-- --- 2. STATUS AS OF 2026-09-09 ----------------------------------
-- MIGRATIONS 208, 209 AND 210 ARE ALL APPLIED. Part A2's structural
-- proof has already returned 12 of 12 PASS. What remains unproven,
-- and what this file exists for, is BEHAVIOUR: no live read has yet
-- exercised a retargeted policy.
--
-- If this file is being run for the first time AFTER the apply,
-- there is no pre-apply baseline to diff the B2-4 counts against.
-- SAY SO IN THE VERIFICATION RECORD rather than treating the
-- post-apply numbers as if they had been compared to something.
-- They then become the baseline for the NEXT run.
--
-- --- 3. THE HONESTY RULE, AND IT OUTRANKS A GREEN OUTPUT ---------
--
-- A harness that reports PASS for a thing the data cannot support
-- is worse than one that reports nothing, because somebody will
-- believe it. Two conditions trigger an explicit UNPROVEN here:
--
--   (a) `public.blocks` IS EMPTY, or holds no usable pair. Then
--       B2-3 - the load-bearing behavioural assertion of this file
--       - records INFO / UNPROVEN. IT DOES NOT RECORD PASS, and no
--       pair is invented to keep it alive. An empty `blocks` table
--       is the one condition under which this harness cannot do its
--       job, and admitting that is the only correct response.
--
--   (b) THE POSITIVE CONTROL RETURNS ZERO. A count of zero for the
--       blocked party is consistent with two very different worlds:
--       the block is being enforced, or there was nothing there to
--       see. The third-party control is what tells them apart. If
--       the control ALSO reads zero the row records INFO / UNPROVEN
--       - the test could not distinguish enforcement from absence
--       of data, and says so.
--
-- The same applies to every Green Room subject: no post, no author,
-- no assertion. INFO, never PASS.
--
-- --- 4. THE IMPERSONATION IDIOM IS COPIED, NOT INVENTED ----------
--   PERFORM set_config('request.jwt.claims',
--          json_build_object('sub', <uuid>, 'role','authenticated')::text, true);
--   EXECUTE 'SET LOCAL ROLE authenticated';
--   ... read ...
--   RESET ROLE;
--   PERFORM set_config('request.jwt.claims', NULL, true);
-- is already proven three times against THIS production database:
-- 38.0.1, 38.0.2 and 38.0.3's own Part B.
--
-- `RESET ROLE` and the claims clear run on BOTH the success path
-- and the failure path of EVERY assertion that changes role. That
-- is the 38.0.1 row B10 lesson: a `SET LOCAL ROLE` left unreset
-- makes every later statement run as the wrong role, which would
-- silently invalidate every assertion after it. Row B2-8 asserts
-- the session is clean at the end; if B2-8 fails, DISTRUST
-- EVERYTHING ABOVE IT.
--
-- The results table is written ONLY while the session has been
-- reset to its own role. A TEMP table belongs to the session user,
-- and an INSERT attempted while impersonating `authenticated` would
-- fail on privileges and lose the row.
--
-- --- 5. RECORD THE SQLSTATE, NEVER JUST "IT ERRORED" -------------
-- Three different failures produce three different fixes and they
-- are told apart only by the code:
--   42883 undefined_function ..... the function is not where the
--                                  migration put it
--   42501 insufficient_privilege .. the EXECUTE grant on the
--                                  function, or USAGE on the
--                                  schema, is missing
--   3F000 invalid_schema_name ..... the schema itself is absent
-- Every handler below records SQLSTATE, the message, and the
-- message's length. Four false verdicts in this phase were each
-- diagnosed in one follow-up only because the detail column carried
-- the real value.
--
-- --- 6. WHAT THIS FILE CANNOT PROVE ------------------------------
-- IT IS NOT AN HTTP REQUEST. It exercises the helper from inside
-- PostgreSQL with impersonated claims, which is the same evaluation
-- path PostgREST uses once a request reaches the database - but it
-- says NOTHING about whether the ROUTE still exists. The two `curl`
-- calls at the foot of this file are the only checks that do, and
-- no SQL file can perform them.
--
-- --- 7. HOW TO READ THE OUTPUT -----------------------------------
-- Read the `verdict` column. Anything containing FAIL is a finding.
-- Rows marked INFO carry NO pass/fail AND MUST NOT BE REPORTED AS
-- PASSES - see B2-3 and B2-4 in particular.
--
-- SAFETY: one `DO` block is one statement is one transaction. Every
-- assertion is its own `BEGIN ... EXCEPTION` subtransaction, so one
-- failure costs one result row rather than the whole result set.
-- The table is created `IF NOT EXISTS` and every row carries
-- `run_at`; the closing SELECT returns only the MOST RECENT run, so
-- pasting the file twice on one connection shows the second run
-- rather than both interleaved.
-- ============================================================

CREATE TEMP TABLE IF NOT EXISTS verify_b2_38_0_3 (
  ord        INT,
  check_name TEXT,
  detail     TEXT,
  verdict    TEXT,
  run_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $BLOCK$
DECLARE
  -- generic deterministic profile pair
  v_u1          UUID;
  v_u2          UUID;

  -- the real block pair, and a third party who is not involved in it
  v_blocker     UUID;
  v_blocked     UUID;
  v_block_at    TIMESTAMPTZ;
  v_third       UUID;
  v_blocks_n    BIGINT;

  -- Green Room subjects
  v_post        UUID;
  v_author      UUID;
  v_other       UUID;
  v_gr_strict   BOOLEAN := FALSE;

  -- email-discovery subject
  v_email       TEXT;
  v_email_owner UUID;
  v_email_caller UUID;
  v_found       UUID;

  -- scratch
  ok            BOOLEAN;
  n             BIGINT;
  n_base        BIGINT;
  n_blocked     BIGINT;
  n_third       BIGINT;
  v_state       TEXT;
  v_msg         TEXT;
  v_rec         RECORD;
  v_surface     RECORD;
BEGIN

  -- ==============================================================
  -- SUBJECT SELECTION - READ ONLY, DETERMINISTIC, NEVER INVENTED.
  --
  -- These SELECTs run as the editor's own session (normally
  -- `postgres`, the table owner, for whom RLS is not enforced), so
  -- they can see real rows. That is a READ, and it is the only way
  -- to choose a subject without seeding one.
  --
  -- Ordering is deterministic on a stable key so that two runs pick
  -- THE SAME subjects and the B2-4 counts are comparable. If a
  -- subject comes back NULL the dependent assertion records an INFO
  -- row naming what is unavailable. NO ID IS EVER INVENTED.
  -- ==============================================================

  BEGIN
    SELECT id INTO v_u1 FROM public.user_profiles ORDER BY created_at, id LIMIT 1;
    SELECT id INTO v_u2 FROM public.user_profiles WHERE id <> v_u1 ORDER BY created_at, id LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_u1 := NULL; v_u2 := NULL; END;

  -- THE BLOCK PAIR. Ordered on (created_at, blocker_id, blocked_id),
  -- which is total: (blocker_id, blocked_id) is the table's primary key.
  BEGIN
    SELECT count(*) INTO v_blocks_n FROM public.blocks;
    SELECT b.blocker_id, b.blocked_id, b.created_at
      INTO v_blocker, v_blocked, v_block_at
      FROM public.blocks b
     ORDER BY b.created_at, b.blocker_id, b.blocked_id
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- PL/pgSQL variable assignments are NOT rolled back by a subtransaction,
    -- so partially populated target variables have to be cleared by hand.
    v_blocker := NULL; v_blocked := NULL; v_block_at := NULL; v_blocks_n := NULL; END;

  -- THE THIRD PARTY - the positive control for B2-3. Must be neither party to
  -- the chosen block, and must have no block in EITHER direction with the
  -- blocker, or the "control" would be gated by a block of its own and would
  -- read zero for the wrong reason.
  IF v_blocker IS NOT NULL THEN
    BEGIN
      SELECT u.id INTO v_third
        FROM public.user_profiles u
       WHERE u.id <> v_blocker
         AND u.id <> v_blocked
         AND NOT EXISTS (SELECT 1 FROM public.blocks b
                          WHERE (b.blocker_id = u.id       AND b.blocked_id = v_blocker)
                             OR (b.blocker_id = v_blocker  AND b.blocked_id = u.id))
       ORDER BY u.created_at, u.id
       LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_third := NULL; END;
  END IF;

  -- GREEN ROOM SUBJECT. STRICT first: a published, visible, public post by a
  -- public author, plus a second real profile with no block in either
  -- direction. Without all of that, B2-6's FALSE could be ordinary
  -- invisibility rather than the Tier-2 bind.
  BEGIN
    SELECT p.id, p.author_id, u.id
      INTO v_post, v_author, v_other
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
    v_post := NULL; v_author := NULL; v_other := NULL; v_gr_strict := FALSE; END;

  -- LOOSE fallback: any visible, undeleted post. The author branch of
  -- green_room_can_view_post admits the author regardless of publish state, so
  -- B2-6's positive half still works - but its negative half is downgraded and
  -- says so in its own detail column.
  IF v_post IS NULL THEN
    BEGIN
      SELECT p.id, p.author_id
        INTO v_post, v_author
        FROM public.green_room_posts p
       WHERE p.deleted_at IS NULL AND p.moderation_status = 'visible'
       ORDER BY p.created_at, p.id
       LIMIT 1;
      SELECT id INTO v_other FROM public.user_profiles
       WHERE id <> v_author ORDER BY created_at, id LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_post := NULL; v_author := NULL; v_other := NULL; END;
  END IF;

  -- EMAIL-DISCOVERY SUBJECT for B2-7. `discover_profile_id_by_email` excludes
  -- the caller's own profile, so the caller must be somebody else.
  --
  -- NEITHER THE EMAIL NOR THE RESOLVED ID IS EVER PRINTED. This output is
  -- pasted in a planning document and these are real Funun users. Only the
  -- email's LENGTH and whether a row came back are recorded.
  BEGIN
    SELECT lower(a.email), p.id
      INTO v_email, v_email_owner
      FROM auth.users a
      JOIN public.user_profiles p ON p.id = a.id
     WHERE a.deleted_at IS NULL
       AND a.email IS NOT NULL
       AND p.is_public = TRUE
       AND p.profile_visibility = 'public'
     ORDER BY p.created_at, p.id
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_email := NULL; v_email_owner := NULL; END;

  IF v_email_owner IS NOT NULL THEN
    BEGIN
      SELECT u.id INTO v_email_caller
        FROM public.user_profiles u
       WHERE u.id <> v_email_owner
         AND NOT EXISTS (SELECT 1 FROM public.blocks b
                          WHERE (b.blocker_id = u.id            AND b.blocked_id = v_email_owner)
                             OR (b.blocker_id = v_email_owner   AND b.blocked_id = u.id))
       ORDER BY u.created_at, u.id
       LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_email_caller := NULL; END;
  END IF;

  -- --------------------------------------------------------------
  -- B2-0 - WHAT WAS SELECTED. UUIDs are abbreviated to eight
  -- characters ON PURPOSE: that is enough to confirm two subjects
  -- are distinct and that a re-run picked the same ones, and it is
  -- not enough to identify anybody.
  -- --------------------------------------------------------------
  INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
    1, 'B2-0 subjects selected (INFO)',
    'u1=' || coalesce(left(v_u1::text, 8), '(none)')
      || ' u2=' || coalesce(left(v_u2::text, 8), '(none)')
      || ' | blocks_rows=' || coalesce(v_blocks_n::text, '?')
      || ' blocker=' || coalesce(left(v_blocker::text, 8), '(none)')
      || ' blocked=' || coalesce(left(v_blocked::text, 8), '(none)')
      || ' block_created_at=' || coalesce(v_block_at::text, '(none)')
      || ' third_party=' || coalesce(left(v_third::text, 8), '(none)')
      || ' | post=' || coalesce(left(v_post::text, 8), '(none)')
      || ' author=' || coalesce(left(v_author::text, 8), '(none)')
      || ' other=' || coalesce(left(v_other::text, 8), '(none)')
      || ' green_room_subject=' || CASE WHEN v_post IS NULL THEN 'NONE'
                                        WHEN v_gr_strict THEN 'STRICT' ELSE 'LOOSE' END
      || ' | email_subject=' || CASE WHEN v_email IS NULL THEN 'NONE'
                                     ELSE 'present (len=' || length(v_email)::text || ')' END
      || ' email_caller=' || coalesce(left(v_email_caller::text, 8), '(none)'),
    'INFO - COMPARE THIS ROW ACROSS THE TWO RUNS BEFORE READING ANYTHING ELSE. If any subject differs, the B2-4 counts below are not comparable and no conclusion may be drawn from them.'
  );

  -- ==============================================================
  -- B2-1 - THE RELOCATED HELPER IS CALLABLE BY `authenticated`.
  --
  -- The relocation removes the HTTP ROUTE, not the privilege. All
  -- eleven policies call this helper, and a policy expression is
  -- evaluated with the privileges of the QUERYING role - so if this
  -- row fails, every block-gated read and write in the product is
  -- failing right now.
  -- ==============================================================

  IF v_u1 IS NULL OR v_u2 IS NULL THEN
    INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
      2, 'B2-1 private.no_block(uuid, uuid) callable as authenticated',
      'fewer than two rows exist in public.user_profiles, so there are no real uuids to pass',
      'INFO - UNPROVEN, no subject. This is not a pass.');
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_u1::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      ok := private.no_block(v_u1, v_u2);
      RESET ROLE;
      PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
        2, 'B2-1 private.no_block(uuid, uuid) callable as authenticated',
        'returned ' || coalesce(ok::text, 'NULL')
          || '  (subjects u1=' || left(v_u1::text, 8) || ' u2=' || left(v_u2::text, 8) || ')',
        CASE WHEN ok IS NULL
             THEN '*** FAIL - returned NULL rather than a boolean. The helper is not answering. ***'
             ELSE 'PASS - `authenticated` holds both schema USAGE and function EXECUTE, and the helper returns a boolean. The eleven policies can evaluate.' END);
    EXCEPTION WHEN OTHERS THEN
      v_state := SQLSTATE; v_msg := left(SQLERRM, 200);
      RESET ROLE; PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
        2, 'B2-1 private.no_block(uuid, uuid) callable as authenticated',
        'SQLSTATE ' || v_state || ': ' || v_msg || '  (msg_len=' || length(v_msg)::text || ')',
        CASE v_state
          WHEN '42501' THEN '*** FAIL - 42501. `authenticated` lacks EXECUTE on private.no_block, or lacks USAGE on the schema. Migration 210 grants both. Every block-gated read is DOWN. Cross-read Part A2 rows P3 and P4. ***'
          WHEN '3F000' THEN '*** FAIL - 3F000. The schema `private` does not exist or is not reachable. Migration 210 section 1 did not apply. Cross-read Part A2 row P3. ***'
          WHEN '42883' THEN '*** FAIL - 42883. The function is NOT where migration 210 put it. Cross-read Part A2 row P1. ***'
          ELSE '*** ERROR - unexpected SQLSTATE. Read the code above before assuming anything. ***' END);
    END;
  END IF;

  -- ==============================================================
  -- B2-2 - THE `public` COPY IS GONE, AND GONE IS NOT THE SAME AS
  -- REVOKED.
  --
  -- 42883 means the function does not exist, so PostgREST can have
  -- no route to it. 42501 means it DOES still exist and was merely
  -- revoked - a weaker outcome that leaves the route in place and
  -- MUST NOT be reported as a pass.
  -- ==============================================================

  IF v_u1 IS NULL OR v_u2 IS NULL THEN
    INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
      3, 'B2-2 public.no_block(uuid, uuid) raises 42883',
      'no real uuids to pass', 'INFO - UNPROVEN, no subject. This is not a pass.');
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_u1::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      ok := public.no_block(v_u1, v_u2);
      RESET ROLE;
      PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
        3, 'B2-2 public.no_block(uuid, uuid) raises 42883',
        'THE CALL SUCCEEDED and returned ' || coalesce(ok::text, 'NULL'),
        '*** FAIL - public.no_block STILL EXISTS AND IS STILL EXECUTABLE BY authenticated. The DROP in migration 210 section 5 did not apply. The symmetric block oracle still has an HTTP RPC route - threat T-08-03 is open. ***');
    EXCEPTION WHEN OTHERS THEN
      v_state := SQLSTATE; v_msg := left(SQLERRM, 200);
      RESET ROLE; PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
        3, 'B2-2 public.no_block(uuid, uuid) raises 42883',
        'SQLSTATE ' || v_state || ': ' || v_msg || '  (msg_len=' || length(v_msg)::text || ')',
        CASE v_state
          WHEN '42883' THEN 'PASS - 42883 undefined_function. The function is GONE, not merely forbidden, so no route can exist.'
          WHEN '42501' THEN '*** FAIL - 42501, NOT 42883. The function STILL EXISTS and was only revoked. PostgREST still has a route to it and would answer 401/403 rather than 404. This is the weaker outcome and it must not be recorded as a pass. ***'
          ELSE '*** ERROR - unexpected SQLSTATE. Expected 42883. ***' END);
    END;
  END IF;

  -- ==============================================================
  -- B2-3 - BLOCK ENFORCEMENT STILL ENFORCES.
  --
  -- THE LOAD-BEARING BEHAVIOURAL ASSERTION OF THIS FILE, and the
  -- one place where a green-looking harness would do real harm.
  --
  -- Three readings per surface:
  --   baseline    - from the editor's own session, RLS not enforced
  --                 for the owner: how many rows the BLOCKER
  --                 actually authored. If this is zero there is
  --                 nothing to hide and the row proves nothing.
  --   blocked     - the same query as the BLOCKED party. MUST be 0.
  --   third party - the same query as somebody not involved in the
  --                 block. THE POSITIVE CONTROL. If this is > 0 the
  --                 zero above is enforcement. If it is also 0 the
  --                 test could not tell enforcement apart from
  --                 absence of data, and says INFO / UNPROVEN.
  --
  -- WITHOUT THE THIRD-PARTY CONTROL a zero for the blocked party
  -- would be reported as enforcement when it is really an empty
  -- table, a post nobody can see, or a policy that refuses
  -- everybody. That last one is the outage this phase most fears
  -- and it produces exactly the same zero.
  -- ==============================================================

  IF v_blocker IS NULL OR v_blocked IS NULL THEN
    INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
      4, 'B2-3 block enforcement on the three Green Room surfaces',
      'public.blocks holds ' || coalesce(v_blocks_n::text, 'an unreadable number of')
        || ' row(s), so no real block pair could be selected',
      'INFO - UNPROVEN, AND EXPLICITLY NOT A PASS. An empty `blocks` table is the one condition under which this harness cannot do its job. No pair is invented to keep the check alive. BLOCK ENFORCEMENT IS UNVERIFIED BY THIS RUN - re-run once a real block exists, and do not record Tier 3 as behaviourally proven until then.');
  ELSIF v_third IS NULL THEN
    INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
      4, 'B2-3 block enforcement on the three Green Room surfaces',
      'a block pair exists (blocker=' || left(v_blocker::text, 8)
        || ' blocked=' || left(v_blocked::text, 8)
        || ') but no third profile is free of a block with the blocker, so there is no positive control',
      'INFO - UNPROVEN. Without a third-party control a zero below cannot be told apart from absence of data. Not a pass.');
  ELSE
    FOR v_surface IN
      SELECT * FROM (VALUES
        (1, 'green_room_comments',  'author_id'),
        (2, 'green_room_reactions', 'user_id'),
        (3, 'green_room_reposts',   'author_id')
      ) s(seq, tbl, author_col) ORDER BY seq
    LOOP
      BEGIN
        -- baseline, as the editor's own session
        EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', v_surface.tbl, v_surface.author_col)
          INTO n_base USING v_blocker;

        -- as the BLOCKED party
        PERFORM set_config('request.jwt.claims',
          json_build_object('sub', v_blocked::text, 'role', 'authenticated')::text, true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', v_surface.tbl, v_surface.author_col)
          INTO n_blocked USING v_blocker;
        RESET ROLE;
        PERFORM set_config('request.jwt.claims', NULL, true);

        -- as the THIRD PARTY - the positive control
        PERFORM set_config('request.jwt.claims',
          json_build_object('sub', v_third::text, 'role', 'authenticated')::text, true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', v_surface.tbl, v_surface.author_col)
          INTO n_third USING v_blocker;
        RESET ROLE;
        PERFORM set_config('request.jwt.claims', NULL, true);

        INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
          4 + v_surface.seq,
          'B2-3.' || v_surface.seq || ' block enforcement: public.' || v_surface.tbl,
          'rows authored by the blocker, baseline (editor session, RLS not enforced) = ' || n_base
            || '  |  visible to the BLOCKED party = ' || n_blocked
            || '  |  visible to a THIRD PARTY (positive control) = ' || n_third
            || '  |  blocker=' || left(v_blocker::text, 8)
            || ' blocked=' || left(v_blocked::text, 8)
            || ' third=' || left(v_third::text, 8),
          CASE
            WHEN n_base = 0
              THEN 'INFO - UNPROVEN. The blocker authored nothing on this surface, so there was nothing for the block to hide. A zero here means an empty table, not an enforced block. NOT A PASS.'
            WHEN n_blocked > 0
              THEN '*** FAIL - BLOCK ENFORCEMENT IS BROKEN. The blocked party can read ' || n_blocked || ' row(s) authored by the person who blocked them. The policy on this table either lost its private.no_block call or is evaluating it wrongly. Cross-read Part A2 row D1 for this table. ***'
            WHEN n_third > 0
              THEN 'PASS - the blocked party sees 0 of ' || n_base || ' while an uninvolved third party sees ' || n_third || '. The zero is enforcement, not emptiness, and the policy is not refusing everybody.'
            ELSE 'INFO - UNPROVEN. Both the blocked party AND the uninvolved third party see 0 of ' || n_base || ' rows. This run cannot tell an enforced block apart from rows nobody can see - or from a policy that now refuses EVERYBODY, which is a silent total outage and looks identical from here. NOT A PASS. Read the B2-4 count for this table before concluding.'
          END);
      EXCEPTION WHEN OTHERS THEN
        v_state := SQLSTATE; v_msg := left(SQLERRM, 200);
        RESET ROLE; PERFORM set_config('request.jwt.claims', NULL, true);
        INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
          4 + v_surface.seq,
          'B2-3.' || v_surface.seq || ' block enforcement: public.' || v_surface.tbl,
          'SQLSTATE ' || v_state || ': ' || v_msg || '  (msg_len=' || length(v_msg)::text || ')',
          CASE v_state
            WHEN '42501' THEN '*** FAIL - 42501 raised inside an RLS read. A policy on this table calls a helper the querying role can no longer execute, or a schema it can no longer reach. THE READ IS DOWN. ***'
            WHEN '42883' THEN '*** FAIL - 42883 raised inside an RLS read. A policy on this table still names a function that no longer exists - almost certainly the dropped public.no_block. Cross-read Part A2 row D1. ***'
            WHEN '3F000' THEN '*** FAIL - 3F000 raised inside an RLS read. The querying role cannot reach the schema the policy''s helper lives in. ***'
            ELSE '*** ERROR - unexpected SQLSTATE inside an RLS read. ***' END);
      END;
    END LOOP;
  END IF;

  -- ==============================================================
  -- B2-4 - BEFORE AND AFTER ROW COUNTS ON ALL TEN AFFECTED TABLES.
  --
  -- These rows carry NO verdict. THE NUMBER IS THE ASSERTION and
  -- the comparison between the two runs is where it lives.
  --
  --   dropped to zero -> a policy that now refuses everything. A
  --                      silent, total read outage: no exception,
  --                      no error, just an empty screen.
  --   went up         -> a policy that now permits more than it
  --                      did. A block that used to be enforced is
  --                      not.
  -- Both are findings. Neither raises.
  --
  -- The same impersonated profile is used for all ten so the
  -- comparison has one variable. Row B2-0 records which profile.
  -- ==============================================================

  IF v_u1 IS NULL THEN
    INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
      10, 'B2-4 per-table row counts under RLS',
      'no profile exists to impersonate', 'INFO - UNPROVEN, no subject. This is not a pass.');
  ELSE
    FOR v_rec IN
      SELECT t.seq, t.name FROM unnest(ARRAY[
        'follows', 'wall_posts', 'endorsements', 'dm_threads', 'dm_messages',
        'connections', 'green_room_comments', 'green_room_reactions',
        'green_room_reposts', 'release_comments'
      ]) WITH ORDINALITY AS t(name, seq) ORDER BY t.seq
    LOOP
      BEGIN
        EXECUTE format('SELECT count(*) FROM public.%I', v_rec.name) INTO n_base;

        PERFORM set_config('request.jwt.claims',
          json_build_object('sub', v_u1::text, 'role', 'authenticated')::text, true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        EXECUTE format('SELECT count(*) FROM public.%I', v_rec.name) INTO n;
        RESET ROLE;
        PERFORM set_config('request.jwt.claims', NULL, true);

        INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
          10 + v_rec.seq,
          'B2-4.' || v_rec.seq || ' row count under RLS: public.' || v_rec.name,
          'total rows (editor session, RLS not enforced) = ' || n_base
            || '  |  visible to ' || left(v_u1::text, 8) || ' as authenticated = ' || n,
          'INFO - NO VERDICT. Compare BOTH numbers against the other run. A visible count that dropped to zero while the total stayed non-zero is a policy refusing everything; a visible count that rose is a policy permitting more than it did. Neither raises an error, so this row is the only place either becomes visible.');
      EXCEPTION WHEN OTHERS THEN
        v_state := SQLSTATE; v_msg := left(SQLERRM, 200);
        RESET ROLE; PERFORM set_config('request.jwt.claims', NULL, true);
        INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
          10 + v_rec.seq,
          'B2-4.' || v_rec.seq || ' row count under RLS: public.' || v_rec.name,
          'SQLSTATE ' || v_state || ': ' || v_msg || '  (msg_len=' || length(v_msg)::text || ')',
          CASE v_state
            WHEN '42501' THEN '*** FAIL - 42501. A policy on this table calls something the querying role can no longer execute or reach. This read is DOWN. ***'
            WHEN '42883' THEN '*** FAIL - 42883. A policy on this table names a function that no longer exists. Cross-read Part A2 row D1 for this table. ***'
            WHEN '3F000' THEN '*** FAIL - 3F000. The querying role cannot reach the schema a policy helper lives in. ***'
            ELSE '*** ERROR - unexpected SQLSTATE. ***' END);
      END;
    END LOOP;
  END IF;

  -- ==============================================================
  -- B2-5 - THE ANONYMOUS `release_comments` BASELINE.
  --
  -- A PRE-EXISTING OBSERVATION RECORDED FOR THE OWNER. NOT A DEFECT
  -- THIS PHASE INTRODUCED AND EXPLICITLY NOT ONE IT FIXES.
  --
  -- `rc_select_public` carries NO `TO` clause, so `anon` evaluates
  -- it - and `anon` has never held EXECUTE on this helper (migration
  -- 035 granted `authenticated` only). So an anonymous read of
  -- release_comments ALREADY FAILED before migration 210. Plan 03's
  -- Part B row B12 recorded exactly what it failed with:
  --
  --   SQLSTATE 42501: permission denied for function no_block
  --
  -- THE ASSERTION IS THAT IT FAILS THE SAME WAY, NOT THAT IT
  -- SUCCEEDS.
  --
  -- ONE THING IS EXPECTED TO CHANGE, AND ONLY ONE: the MESSAGE. The
  -- barrier used to be the missing EXECUTE grant on
  -- `public.no_block`; it is now the missing USAGE grant on schema
  -- `private`, which `anon` was deliberately not given. So the text
  -- may read "permission denied for schema private" rather than
  -- "permission denied for function no_block". THE SQLSTATE - 42501
  -- insufficient_privilege - IS WHAT MUST MATCH, because that is
  -- what determines the HTTP status PostgREST returns to an
  -- anonymous caller, and that is the observable behaviour being
  -- preserved. The raw message and its length are printed so the
  -- difference can be seen rather than guessed at.
  --
  -- A COUNT COMING BACK IS A FAILURE, not a success: it would mean
  -- anonymous reads of release_comments now WORK where they did not
  -- before, which is a behaviour change this phase did not sanction.
  -- ==============================================================

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    EXECUTE 'SET LOCAL ROLE anon';
    SELECT count(*) INTO n FROM public.release_comments;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
      21, 'B2-5 anon read of public.release_comments (plan 03 row B12 baseline)',
      'THE READ SUCCEEDED and returned ' || n || ' row(s), with no error'
        || '  |  plan 03 row B12 recorded: SQLSTATE 42501, permission denied for function no_block',
      '*** FAIL - BEHAVIOUR CHANGED. Anonymous reads of release_comments failed with 42501 before this phase and now succeed. That is a widening, not a preservation, and nothing in migration 210 was supposed to grant `anon` anything. Read Part A2 rows P3 and P4: something gave `anon` USAGE on `private` or EXECUTE on the helper. ***');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE; v_msg := left(SQLERRM, 200);
    RESET ROLE; PERFORM set_config('request.jwt.claims', NULL, true);
    INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
      21, 'B2-5 anon read of public.release_comments (plan 03 row B12 baseline)',
      'SQLSTATE ' || v_state || ': ' || v_msg || '  (msg_len=' || length(v_msg)::text || ')'
        || '  |  plan 03 row B12 recorded: SQLSTATE 42501, permission denied for function no_block',
      CASE v_state
        WHEN '42501' THEN 'PASS - 42501 insufficient_privilege, the same SQLSTATE plan 03 row B12 recorded, so PostgREST returns an anonymous caller the same status it did before. The MESSAGE is expected to name schema `private` rather than function `no_block` now: the barrier moved from the function grant to the schema grant, and `anon` was deliberately given neither. This is a PRE-EXISTING observation recorded for the owner and explicitly NOT fixed by this phase.'
        WHEN '42883' THEN '*** FAIL - 42883, not 42501. The policy is naming a function that does not exist rather than one the role may not execute. That means a stray `public.no_block` survives in rc_select_public''s predicate - and it would break the AUTHENTICATED read of this table too. Cross-read Part A2 row D1 for release_comments. ***'
        WHEN '3F000' THEN 'PASS (with a note) - 3F000 invalid_schema_name rather than 42501. The read still fails for `anon`, which is the behaviour being preserved, but the code changed. Record both codes in the verification record and confirm the HTTP status PostgREST returns to an anonymous caller is unchanged.'
        ELSE '*** ERROR - unexpected SQLSTATE. Plan 03 row B12 recorded 42501. Record this code verbatim before drawing any conclusion. ***' END);
  END;

  -- ==============================================================
  -- B2-6 - TIER 2 SURVIVED TIER 3, BEHAVIOURALLY.
  --
  -- The counterpart of Part A2's row B1. Migration 210 REPLACES the
  -- whole body of green_room_can_view_post - the only way to
  -- retarget a call inside a string literal - and a body copied
  -- from the wrong source migration would revert migration 209's
  -- caller-identity bind while every relocation check still passed.
  --
  -- Both calls are made from the SAME impersonated session (the
  -- post's real author) against the SAME real post. The ONLY thing
  -- that differs is the uuid passed as `p_viewer`. The first is the
  -- positive control: on its own, a FALSE from the second is
  -- equally consistent with "the bind works" and "the function is
  -- broken and answers false to everybody", and the second would
  -- take the whole Green Room down.
  -- ==============================================================

  IF v_post IS NULL OR v_author IS NULL OR v_other IS NULL THEN
    INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
      22, 'B2-6 green_room_can_view_post: the Tier-2 bind, behaviourally',
      'no usable Green Room subject (post=' || coalesce(left(v_post::text, 8), 'none')
        || ' author=' || coalesce(left(v_author::text, 8), 'none')
        || ' other=' || coalesce(left(v_other::text, 8), 'none') || ')',
      'INFO - UNPROVEN, no subject. Part A2 row B1 proves this STRUCTURALLY; nothing here proves it behaviourally. Re-run once the Green Room holds a visible post. NOT A PASS.');
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_author::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      ok := public.green_room_can_view_post(v_post, v_author);
      RESET ROLE;
      PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
        22, 'B2-6a POSITIVE CONTROL green_room_can_view_post(post, SELF)',
        'impersonating the post''s real author (' || left(v_author::text, 8)
          || ') and asking about that same author - returned ' || coalesce(ok::text, 'NULL'),
        CASE WHEN ok IS TRUE
             THEN 'PASS - the author can still see their own post. The helper has NOT been broken toward answering false to everybody, and it reached private.no_block without raising.'
             ELSE '*** FAIL - THE POSITIVE CONTROL FAILED. The helper refuses the caller''s own row. Green Room reads are down. This is a REVERT, not a debug-in-place. ***' END);
    EXCEPTION WHEN OTHERS THEN
      v_state := SQLSTATE; v_msg := left(SQLERRM, 200);
      RESET ROLE; PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
        22, 'B2-6a POSITIVE CONTROL green_room_can_view_post(post, SELF)',
        'SQLSTATE ' || v_state || ': ' || v_msg || '  (msg_len=' || length(v_msg)::text || ')',
        CASE v_state
          WHEN '42883' THEN '*** FAIL - 42883. The replaced body still names the dropped public.no_block, or names it unqualified under SET search_path = ''''. Cross-read Part A2 row B1. ***'
          WHEN '42501' THEN '*** FAIL - 42501. The body is a SECURITY DEFINER and should reach the helper as its OWNER regardless of the caller. If this is 42501 the definer property was lost in the replace. Cross-read Part A2 row P5. ***'
          ELSE '*** ERROR - treat as a FAILED positive control. ***' END);
    END;

    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_author::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      ok := public.green_room_can_view_post(v_post, v_other);
      RESET ROLE;
      PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
        23, 'B2-6b THE TIER-2 BIND green_room_can_view_post(post, OTHER)',
        'still impersonating the author, now asking about viewer ' || left(v_other::text, 8)
          || ' - returned ' || coalesce(ok::text, 'NULL')
          || CASE WHEN v_gr_strict
                  THEN '  [STRICT subject: published, visible, public post by a public author, no block either way - this call returned TRUE before migration 209]'
                  ELSE '  [LOOSE subject: this call may have answered FALSE before migration 209 as well]' END,
        CASE
          WHEN ok IS TRUE
            THEN '*** FAIL - MIGRATION 210 REVERTED MIGRATION 209. `p_viewer` is no longer bound to auth.uid(), so any logged-in user can ask this function about any other user again. The relocation checks in Part A2 blocks P and D would all still read PASS. This is the phase''s most plausible silent regression and this row is one of the two guards against it. ***'
          WHEN NOT v_gr_strict
            THEN 'WEAK PASS - returned false, but no STRICT subject was available, so this does not discriminate the Tier-2 bind from ordinary invisibility. Re-run when a published public post by a public author exists.'
          ELSE 'PASS - false on a subject that would have answered TRUE before migration 209, from a session whose auth.uid() is somebody else. The Tier-2 bind survived Tier 3.'
        END);
    EXCEPTION WHEN OTHERS THEN
      v_state := SQLSTATE; v_msg := left(SQLERRM, 200);
      RESET ROLE; PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
        23, 'B2-6b THE TIER-2 BIND green_room_can_view_post(post, OTHER)',
        'SQLSTATE ' || v_state || ': ' || v_msg || '  (msg_len=' || length(v_msg)::text || ')',
        '*** ERROR - the bind assertion could not be evaluated. Read B2-6a first. ***');
    END;
  END IF;

  -- ==============================================================
  -- B2-7 - `discover_profile_id_by_email` STILL WORKS.
  --
  -- Migration 210 rewrites this body to retarget ONE call. Owner
  -- decision D2 declared the function itself correct and out of
  -- scope. The assertion is that it RETURNS WITHOUT RAISING, which
  -- is what a retarget that missed would not do.
  --
  -- NEITHER THE EMAIL NOR THE RESOLVED ID IS PRINTED. Only whether
  -- a row came back, and the email's length. This is a verification
  -- artifact that gets pasted in a planning document; it is not a
  -- place to print a real user's identity.
  -- ==============================================================

  IF v_email IS NULL OR v_email_caller IS NULL THEN
    INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
      24, 'B2-7 discover_profile_id_by_email returns without raising',
      'no usable subject (email present=' || (v_email IS NOT NULL)::text
        || ' caller present=' || (v_email_caller IS NOT NULL)::text || ')',
      'INFO - UNPROVEN, no subject. Part A2 row B2 proves the retarget STRUCTURALLY; this run does not prove it behaviourally. NOT A PASS.');
  ELSE
    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_email_caller::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      v_found := public.discover_profile_id_by_email(v_email);
      RESET ROLE;
      PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
        24, 'B2-7 discover_profile_id_by_email returns without raising',
        'called as ' || left(v_email_caller::text, 8)
          || ' with a real public profile''s email (email_len=' || length(v_email)::text
          || ', value deliberately not printed) - a profile id '
          || CASE WHEN v_found IS NULL THEN 'was NOT returned' ELSE 'WAS returned' END
          || ' (the id itself is deliberately not printed)',
        CASE WHEN v_found IS NOT NULL
             THEN 'PASS - the function resolved a profile without raising, so its retargeted private.no_block call executes. Migration 210 section 3b applied and owner decision D2''s function still works.'
             ELSE 'INFO - the function returned NULL without raising. NULL is a legitimate answer here (the subject may be filtered by profile_visibility, by a block, or by the self-exclusion), so this run proves only that the retargeted call does not RAISE - which is the thing a missed retarget would do. Not a full pass; read Part A2 row B2 alongside it.' END);
    EXCEPTION WHEN OTHERS THEN
      v_state := SQLSTATE; v_msg := left(SQLERRM, 200);
      RESET ROLE; PERFORM set_config('request.jwt.claims', NULL, true);
      INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
        24, 'B2-7 discover_profile_id_by_email returns without raising',
        'SQLSTATE ' || v_state || ': ' || v_msg || '  (msg_len=' || length(v_msg)::text || ')',
        CASE v_state
          WHEN '42883' THEN '*** FAIL - 42883. The retarget in migration 210 section 3b MISSED: the body still names the dropped public.no_block, or names it unqualified under SET search_path = ''''. Email discovery is broken in production right now. This is the exact failure the pre-apply gate existed to prevent. ***'
          WHEN '42501' THEN '*** FAIL - 42501. This is a SECURITY DEFINER and should reach the helper as its OWNER. If the definer property survived, this should not happen. Cross-read Part A2 row B2. ***'
          ELSE '*** ERROR - unexpected SQLSTATE. ***' END);
    END;
  END IF;

  -- ==============================================================
  -- B2-8 - THE HARNESS LEFT NOTHING BEHIND.
  --
  -- The 38.0.1 row B10 lesson. If this row fails, DISTRUST EVERY
  -- ROW ABOVE IT: the session state was not what those rows
  -- assumed. Close the connection and re-run in a fresh one.
  -- ==============================================================

  INSERT INTO verify_b2_38_0_3 (ord, check_name, detail, verdict) VALUES (
    30, 'B2-8 session is clean - the harness wrote nothing',
    'current_user=' || current_user || '  session_user=' || session_user
      || '  request.jwt.claims=' || coalesce(nullif(current_setting('request.jwt.claims', true), ''), '(unset)')
      || '  |  this file created ONE session-local TEMP table and no other object, and issued no INSERT, UPDATE or DELETE against any table in public or auth',
    CASE WHEN current_user = session_user
              AND coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') = ''
         THEN 'PASS - role reset and impersonation cleared'
         ELSE '*** FAIL - THE SESSION IS STILL IMPERSONATING. Every row above ran under an uncertain identity. Distrust all of them, close this connection and re-run in a fresh one. ***' END);

END
$BLOCK$;

-- Only the most recent run. Paste the file twice on one connection and you see
-- the second run, not both interleaved.
SELECT ord, check_name, detail, verdict
FROM verify_b2_38_0_3
WHERE run_at = (SELECT max(run_at) FROM verify_b2_38_0_3)
ORDER BY ord;

-- ============================================================
-- END OF PART B2. HOW TO READ IT.
--
-- 1. READ B2-8 FIRST. If the session was still impersonating at the
--    end, nothing above it is trustworthy.
--
-- 2. B2-6a IS THE POSITIVE CONTROL FOR B2-6b, and B2-3's
--    third-party column is the positive control for its blocked
--    column. A negative result without its control is not evidence.
--
-- 3. THESE ROWS ARE UNPROVEN-BY-DESIGN WHEN THE DATA IS ABSENT, and
--    every one of them says so in its own verdict string rather
--    than reporting a quiet pass:
--      * B2-3 when `public.blocks` is empty, when no uninvolved
--        third party exists, when the blocker authored nothing on
--        that surface, or when the positive control also reads
--        zero. Threat T-38.0.3-06-08 is precisely the claim that
--        block enforcement is proven while `blocks` is empty. It is
--        not, and this file will not say it is.
--      * B2-6 when the Green Room holds no usable post, and WEAK
--        PASS when only a LOOSE subject was available.
--      * B2-7 when no public profile with an email exists, and INFO
--        when the function legitimately returns NULL.
--      * B2-1 and B2-2 when fewer than two profiles exist.
--    An INFO row is not a pass and must not be recorded as one.
--
-- 4. B2-4's ten rows carry no verdict at all. Diff them against the
--    other run. If this was the first run after the apply, say so
--    in the verification record - there is then nothing to diff
--    against, and these numbers become the baseline for next time.
--
-- 5. B2-5 must match plan 03's row B12 ON THE SQLSTATE (42501). The
--    message is expected to name schema `private` rather than
--    function `no_block`, because the barrier moved from the
--    function grant to the schema grant. Record both verbatim.
--
-- 6. THEN RUN THE TWO `curl` CALLS BELOW. NO SQL FILE CAN PERFORM
--    THEM, and they are the only checks that prove the ROUTE is
--    gone rather than the privilege behind it. Everything above
--    exercises the helper from INSIDE PostgreSQL.
--
--    (a) With the ANON key:
--
--      curl -i -X POST \
--        "https://<PROJECT-REF>.supabase.co/rest/v1/rpc/no_block" \
--        -H "apikey: <ANON KEY>" \
--        -H "Authorization: Bearer <ANON KEY>" \
--        -H "Content-Type: application/json" \
--        -d '{"a":"00000000-0000-0000-0000-000000000000",
--             "b":"00000000-0000-0000-0000-000000000000"}'
--
--    (b) With the SERVICE ROLE key, same body and URL, both headers
--        set to the service key.
--
--    EXPECT 404 FROM BOTH, with a PostgREST body along the lines of
--    "Could not find the function public.no_block". 404 is the
--    proof: the route does not exist. A 401 or 403 would mean the
--    function is still there and merely forbidden - the weaker
--    outcome, and one that leaves the route in place.
--
--    THE SERVICE-KEY CALL IS THE MORE IMPORTANT OF THE TWO. The
--    service role bypasses RLS and holds broad privileges, so a 404
--    there proves the absence is a ROUTING fact and not a privilege
--    one. If (b) returns 200 while (a) returns 404, `private` is on
--    the PostgREST exposed-schema list and Tier 3 is undone -
--    cross-read Part A2 row X1 immediately.
--
--    RECORD BOTH HTTP STATUSES IN THE VERIFICATION RECORD. They are
--    the closing evidence for the whole phase.
--
-- 7. Finally: if Part A2 row X5 still reports the leftover harness
--    table in `public` left behind by the 38.0.1 and 38.0.2 runs,
--    drop it by hand. Part A2 names it; THIS FILE DELIBERATELY DOES
--    NOT, not even in prose, because the automated guard on this
--    file is a raw absence grep for that identifier and a mention
--    anywhere would defeat it. This file adds nothing of the kind:
--    its results table lives in `pg_temp` and dies with the
--    connection.
-- ============================================================
