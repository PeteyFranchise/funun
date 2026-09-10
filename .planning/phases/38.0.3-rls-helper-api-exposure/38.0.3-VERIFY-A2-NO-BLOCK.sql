-- ============================================================
-- Phase 38.0.3 - VERIFICATION PART A2: STRUCTURAL, `no_block`
-- RELOCATION (migration 210, Tier 3, owner decision D4)
--
-- ONE query, ONE result table (ord, check_name, detail, verdict).
-- Paste the whole file in the Supabase SQL editor and run it
-- against PRODUCTION.
--
-- --- 0. WRITE-STATEMENT COUNT: ZERO -------------------------------
-- There is no INSERT, no UPDATE, no DELETE, no TRUNCATE, no ALTER,
-- no DROP, no CREATE, no GRANT and no REVOKE anywhere in this file.
-- It creates no table, not even a TEMP one. It does not seed and it
-- does not tear down. It does not flip the D-56 kill switch. It is
-- a single `WITH ... SELECT ... ORDER BY 1;` and nothing else.
--
-- It deliberately does NOT recreate `public.zz_verify_b_results`.
-- Row X6 REPORTS that leftover so it can be dropped by hand.
--
-- --- 1. STATUS OF THIS FILE AS OF 2026-09-09 ----------------------
--
-- MIGRATIONS 208, 209 AND 210 ARE ALL APPLIED IN PRODUCTION.
-- Migration 210 was applied by the owner on 2026-09-09 as one paste
-- (`Success. No rows returned.`). Plan 04 is deployed at 80c8e1a7.
--
-- SO: DO NOT READ THE G-BLOCK BELOW AS A PENDING DECISION. IT IS
-- NOT ASKING WHETHER MIGRATION 210 MAY BE APPLIED. IT ALREADY WAS.
-- The G-block is retained because it is the only enumeration that
-- can ever answer "is a string-literal function body still pointing
-- at a helper that moved", and that question stays worth asking on
-- every re-run - but its verdict strings are written for the
-- POST-APPLY world, and the recorded pre-apply answer is quoted
-- beside each one.
--
-- THE RECORDED PRE-APPLY GATE RESULT, 2026-09-09, verbatim from
-- `.planning/phases/38.0.3-rls-helper-api-exposure/
--  38.0.3-GATE-210-RESULTS.md`:
--
--   G1 public body callers of no_block ..... discover_profile_id_by_email,
--                                            green_room_can_view_post
--                                            PASS - exactly the two
--                                            that section 3 retargets
--   G2 body callers outside public ......... (none)          PASS
--   G3 public.no_block pre-state ........... PRESENT, secdef, stable,
--                                            search_path="", authenticated
--                                            held EXECUTE          (see 3.)
--   G4 policies referencing no_block ....... 11                PASS
--   G5 policies not covered by section 4 ... (none)            PASS
--   G6 schema `private` .................... absent            PASS
--   G7 PostgREST exposed schemas ........... `private` absent  PASS
--
-- GATE VERDICT ON THE DAY: GREEN. Migration 210 was cleared to
-- apply, and it applied.
--
-- WHAT THE GATE EXISTED TO PREVENT, stated once so a re-runner
-- understands what they are looking at: PostgreSQL records a
-- dependency for a helper named in an RLS POLICY expression, but
-- NOT for one named in a string-literal `AS $$ ... $$` body, and
-- every function in this repo uses that form. PostgreSQL's own
-- CREATE FUNCTION documentation says that form "may leave dangling
-- functions". So `DROP FUNCTION public.no_block(uuid, uuid)` in
-- migration 210 section 5 is self-verifying FOR POLICIES ONLY. Had
-- a third definer body still named the helper, the drop would have
-- succeeded cleanly and that body would have raised
-- `42883 function does not exist` on its next live invocation, in
-- production, with no prior warning.
--
-- That is migration 198's failure shape exactly: green text-lock
-- suite, clean apply, `42702 column reference is ambiguous` raised
-- on the very first live call the `ON CONFLICT` clause ever
-- received. A structural probe reported PASS on every row.
--
-- --- 2. THE POST-APPLY RUN IS THE PROOF. EVERY VERDICT MUST READ
--        PASS. -----------------------------------------------------
-- Recorded post-apply result, 2026-09-09: 12 of 12 PASS. The
-- confirmed live values this file asserts against are:
--
--   private.no_block(uuid,uuid) ......... exists
--   public.no_block(uuid,uuid) .......... absent
--   USAGE on schema private ............. authenticated=true
--                                         anon=false service_role=false
--   EXECUTE on private.no_block ......... authenticated=true
--                                         anon=false service_role=false
--   relocated attributes ................ prosecdef=true
--                                         provolatile='s'
--                                         proconfig=search_path=""
--   policies naming private.no_block .... 11 of 11
--   rc_select_public roles .............. {public}  (pre-existing:
--                                         the policy has no TO clause)
--   the other ten policies .............. {authenticated}
--   green_room_can_view_post ............ still carries the Tier-2
--                                         bind AND calls private.no_block
--   discover_profile_id_by_email ........ retargeted to private.no_block
--   exposed public definers ............. 48
--   all public definers ................. 114 (107 after migration 210,
--                                         plus seven internal/service-only
--                                         Playbook functions from 201-207)
--
-- --- 3. RESOLVE OBJECTS BY IDENTITY, NEVER BY A RENDERED STRING ---
-- THIS FILE'S SINGLE MOST IMPORTANT DESIGN RULE, and it is written
-- here because this phase has now paid for it four separate times:
--
--   * 38.0.2 Part A - twelve false `search_path` FAILs from a
--     hand-written predicate compared to an assumed rendering.
--   * A `%public.%` LIKE pattern that also matched `graphql_public.`.
--   * The 2026-09-09 pre-apply gate's row G3, which read
--     `*** STOP - public.no_block is ABSENT ***` on a function that
--     was present and completely healthy. Its predicate was
--     `AND pg_get_function_identity_arguments(p.oid) = 'uuid, uuid'`
--     - and that function KEEPS PARAMETER NAMES. Production returns
--     `a uuid, b uuid`, length 14. The equality was never going to
--     hold.
--   * The same day's X1 row, which read 63 exposed definers instead
--     of 48, because an ad-hoc predicate omitted two filters the
--     canonical sweep carries.
--
-- Every one of the four had correct data and a wrong ruler. So:
--   * Functions here are resolved with `to_regprocedure(...)`, which
--     resolves by TYPE SIGNATURE and is immune to how names, spacing
--     and parameter names render.
--   * Schemas are resolved by joining `pg_namespace`, so a missing
--     schema yields no row rather than an exception.
--   * The exposed-definer predicate in the `defs` CTE is COPIED
--     CHARACTER-FOR-CHARACTER from `38.0.3-VERIFY-A-STRUCTURAL.sql`
--     and is not retyped.
--   * Every row prints the RAW VALUE it judged, and its length where
--     length is what goes wrong. A wrong assertion should diagnose
--     itself in one read, not in a follow-up query.
--
-- --- 4. WHAT THIS FILE CAN AND CANNOT PROVE -----------------------
-- IT PROVES SHAPE, NOT BEHAVIOUR. Every row is a reading of the
-- catalogue: this function exists, this role holds this privilege,
-- this policy predicate contains this text. NONE OF IT IS AN
-- OBSERVATION OF THE DATABASE DOING ANYTHING.
--
-- Behaviour is the job of the companion file:
--   .planning/phases/38.0.3-rls-helper-api-exposure/
--     38.0.3-VERIFY-B2-NO-BLOCK.sql
--
-- And neither file is an HTTP request. Only the two `curl` calls
-- listed at the foot of Part B2 prove that the ROUTE is gone rather
-- than the privilege.
--
-- --- 5. AN ERROR IS ITSELF A FINDING ------------------------------
-- Object lookups here are NULL-tolerant on purpose (`to_regprocedure`,
-- a LEFT JOIN, a scalar subquery with `coalesce`) so that an absent
-- object produces a row that SAYS it is absent rather than an empty
-- result set. An absent row reads as "nothing to see"; that is the
-- one outcome this file refuses to produce.
--
-- --- HOW TO READ THE OUTPUT ---------------------------------------
-- Read the `verdict` column. Anything containing FAIL or STOP is a
-- finding. Rows marked INFO carry no pass/fail - they are recorded
-- so the answer is evidenced rather than asserted.
--
-- Block map:
--   G (100s) - body callers and the pre-apply gate, now historical.
--   P (200s) - placement, grants and the four preserved attributes.
--   D (300s) - the eleven policies, read from PRODUCTION.
--   B (400s) - Tier 2 survived Tier 3.
--   X (500s) - environment record.
-- ============================================================

WITH

-- --- The live SECURITY DEFINER sweep --------------------------------------
--
-- COPIED CHARACTER-FOR-CHARACTER from the `defs` CTE in
-- `38.0.3-VERIFY-A-STRUCTURAL.sql`, which in turn reproduces the predicate
-- that produced `38.0.3-LIVE-EXPOSED.txt` on 2026-09-08. It is copied and not
-- retyped because two of its filters are easy to omit and omitting them is
-- exactly what made the 2026-09-09 ad-hoc sweep report 63 instead of 48:
--
--     AND p.prorettype <> 'trigger'::regtype
--     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
--
-- The first excludes trigger functions, which have no callable route. The
-- second excludes extension-owned functions, which were never in the 53
-- baseline. Without both, the number below is not comparable to anything.
defs AS (
  SELECT p.oid,
         p.proname,
         pg_get_function_identity_arguments(p.oid)                 AS idargs,
         coalesce(array_to_string(p.proconfig, ','), '(none)')      AS proconfig,
         has_function_privilege('anon', p.oid, 'EXECUTE')           AS anon_exec,
         has_function_privilege('authenticated', p.oid, 'EXECUTE')  AS authed_exec,
         has_function_privilege('service_role', p.oid, 'EXECUTE')   AS service_exec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND p.prorettype <> 'trigger'::regtype
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
),

exposed AS (SELECT * FROM defs WHERE anon_exec OR authed_exec),

-- `38.0.3-LIVE-EXPOSED.txt`, verbatim - the 53 public definers `anon` or
-- `authenticated` could reach on 2026-09-08, before this phase touched
-- anything. After migrations 208 and 210 the expectation is 53 minus the four
-- Tier-1 names minus `no_block` = 48.
live_exposed_20260908 AS (
  SELECT unnest(ARRAY[
    'resolve_profile_by_handle','can_read_song_passport','can_view_song_passport_value',
    'claim_ai_usage','claim_upload_admission','create_work_lyric_block_comment',
    'create_work_lyric_block_suggestion','create_work_studio_note','create_work_version_comment',
    'custody_transfer_visible','decide_work_lyric_block_suggestion','detach_lyric_block_with_text',
    'discover_profile_id_by_email','finish_ai_usage','finish_upload_admission',
    'green_room_can_view_post','green_room_post_matches_custom_audience','has_song_passport_grant',
    'idea_access_level','is_buyer_org_member','is_green_room_eligible','is_project_owner',
    'is_split_sheet_initiator','is_split_sheet_party','is_work_owner','is_workspace_owner',
    'no_block','ownership_transfer_visible','project_member_role',
    'restore_locked_lyric_block_snapshot','review_work_version_comment_carry',
    'save_locked_lyric_block_text','set_work_lyric_block_comment_resolution',
    'set_work_studio_note_resolution','set_work_version_comment_resolution',
    'toggle_work_note_reaction','work_member_tier','workspace_access_enabled',
    'workspace_agreement_evidence_visible','workspace_attachment_visible','workspace_audit_page',
    'workspace_audit_visible','workspace_catalogue_page','workspace_grant_lineage_live',
    'workspace_grant_visible_to_member','workspace_member_role','workspace_project_permission',
    'workspace_read_assets','workspace_read_documents','workspace_read_tool_outputs',
    'workspace_read_tracks','workspace_roster_page','workspace_roster_relationship_is_live'
  ]) AS proname
),

-- --- G-block input: every string-literal body that names the helper -------
--
-- The scan is `\mno_block\s*\(` - word-boundary anchored, so it matches a
-- bare `no_block(`, a `public.no_block(` and a `private.no_block(` alike (the
-- character before `no_block` in a qualified reference is `.`, which is not a
-- word character, so `\m` still holds). That is deliberate: after the
-- relocation the caller SET should be unchanged and only the QUALIFIER should
-- have moved, and this scan is the only thing that can show both at once.
--
-- CAVEAT SO A ROW HERE IS NOT MISREAD: `prosrc` includes comments inside the
-- body, so a body that merely MENTIONS the helper in a comment is counted.
-- That errs safe - it produces a spurious caller row, which the reader reads,
-- rather than a false clean.
nb_bodycaller AS (
  SELECT n.nspname                                   AS caller_schema,
         p.proname                                   AS caller,
         pg_get_function_identity_arguments(p.oid)   AS caller_args,
         (p.prosrc LIKE '%private.no_block%')        AS refs_private,
         (p.prosrc LIKE '%public.no_block%')         AS refs_public,
         -- Neutralise BOTH qualified forms, then look for what is left. A
         -- one-directional substitution would report a bare reference as
         -- qualified, which is the drift this check exists to catch.
         (replace(replace(p.prosrc, 'private.no_block', '#Q#'),
                                    'public.no_block',  '#Q#') ~ '\mno_block\s*\(') AS refs_bare
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosrc ~ '\mno_block\s*\('
    AND p.proname <> 'no_block'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
),

-- --- P-block input: the relocated function, resolved BY IDENTITY ----------
-- `to_regprocedure` resolves by type signature and returns NULL rather than
-- raising when the object is absent. This is the form the plan-05 gate used
-- and the form row G3 should have used on 2026-09-09.
nb_fn AS (
  SELECT p.oid,
         n.nspname || '.' || p.proname                              AS qname,
         pg_get_function_identity_arguments(p.oid)                  AS idargs,
         p.prosecdef,
         p.provolatile::text                                        AS provolatile,
         coalesce(array_to_string(p.proconfig, ','), '(none)')      AS proconfig,
         coalesce(array_to_string(p.proacl, ', '), '(no explicit ACL - PostgreSQL default, EXECUTE to PUBLIC)') AS proacl_txt,
         has_function_privilege('authenticated', p.oid, 'EXECUTE')  AS authed_exec,
         has_function_privilege('anon',          p.oid, 'EXECUTE')  AS anon_exec,
         has_function_privilege('service_role',  p.oid, 'EXECUTE')  AS service_exec,
         has_function_privilege('public',        p.oid, 'EXECUTE')  AS public_exec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.oid = to_regprocedure('private.no_block(uuid,uuid)')::oid
),

-- The relocated schema, resolved by joining `pg_namespace` rather than by
-- passing the literal name to `has_schema_privilege`. A missing schema then
-- yields NO ROW - which row P3 reports as an explicit absence - instead of
-- `3F000 schema does not exist` aborting the whole file.
priv_ns AS (
  SELECT n.oid,
         n.nspname,
         coalesce(array_to_string(n.nspacl, ', '), '(no explicit ACL)')     AS nspacl_txt,
         has_schema_privilege('authenticated', n.oid, 'USAGE')              AS authed_usage,
         has_schema_privilege('anon',          n.oid, 'USAGE')              AS anon_usage,
         has_schema_privilege('service_role',  n.oid, 'USAGE')              AS service_usage,
         has_schema_privilege('public',        n.oid, 'USAGE')              AS public_usage
  FROM pg_namespace n
  WHERE n.nspname = 'private'
),

-- --- D-block input: the eleven policies -----------------------------------
--
-- THIS TABLE IS THE LOAD-BEARING INPUT OF BLOCK D. The names and the expected
-- `roles` value are transcribed from migration 210 section 4. Get one row
-- wrong and block D reports a clean bill of health on a policy nobody checked.
--
-- `rc_select_public` expects `{public}` and NOT `{authenticated}`. That is not
-- a typo and not a defect this phase introduced: migration 061 wrote that
-- policy with no `TO` clause, migration 210 reproduced the omission exactly
-- rather than tidying it, and a `{authenticated}` reading here would mean
-- somebody CHANGED it. See the pre-existing observation recorded as row B12 of
-- `38.0.3-VERIFY-B-PRODUCTION-SINGLE.sql`.
exp_pol AS (
  SELECT * FROM (VALUES
    ('follows',              'follows_insert_own',                 '{authenticated}'),
    ('wall_posts',           'wall_insert_author',                 '{authenticated}'),
    ('endorsements',         'endo_insert_author',                 '{authenticated}'),
    ('dm_threads',           'dmt_insert_participant',             '{authenticated}'),
    ('dm_messages',          'dmm_insert_sender',                  '{authenticated}'),
    ('connections',          'connections_insert_own',             '{authenticated}'),
    ('green_room_comments',  'green_room_comments_select_visible',  '{authenticated}'),
    ('green_room_reactions', 'green_room_reactions_select_visible', '{authenticated}'),
    ('green_room_reposts',   'green_room_reposts_select_visible',   '{authenticated}'),
    ('release_comments',     'rc_select_public',                    '{public}'),
    ('release_comments',     'rc_insert_author',                    '{authenticated}')
  ) t(tablename, policyname, expect_roles)
),

prod_pol AS (
  SELECT p.tablename,
         p.policyname,
         p.cmd,
         p.roles::text                                                       AS roles_txt,
         coalesce(p.qual, '(no USING)') || '   ||WITH CHECK||   '
           || coalesce(p.with_check, '(no WITH CHECK)')                      AS expr
  FROM pg_policies p
  WHERE p.schemaname = 'public'
),

-- Every production policy that names the helper in ANY form. Neutralise BOTH
-- qualified spellings before looking for a leftover, for the same reason as
-- `nb_bodycaller` above.
nb_pol AS (
  SELECT tablename, policyname, cmd, roles_txt, expr,
         (expr LIKE '%private.no_block%')                                    AS has_reloc,
         (replace(replace(expr, 'private.no_block', '#Q#'),
                              'public.no_block',  '#Q#') LIKE '%no_block%')  AS has_stray
  FROM prod_pol
  WHERE expr LIKE '%no_block%'
),

d1 AS (
  SELECT e.tablename,
         e.policyname,
         e.expect_roles,
         pp.roles_txt,
         pp.cmd,
         pp.expr,
         (pp.expr IS NOT NULL AND pp.expr LIKE '%no_block%')                 AS names_helper,
         (pp.expr IS NOT NULL AND pp.expr LIKE '%private.no_block%')         AS has_reloc,
         (pp.expr IS NOT NULL
            AND replace(replace(pp.expr, 'private.no_block', '#Q#'),
                                       'public.no_block',  '#Q#') LIKE '%no_block%') AS has_stray
  FROM exp_pol e
  LEFT JOIN prod_pol pp
    ON pp.tablename = e.tablename AND pp.policyname = e.policyname
),

-- --- B-block input: the two DEPLOYED definitions --------------------------
-- Read off `pg_get_functiondef`, whitespace-normalised, so the assertions are
-- about what PostgreSQL COMPILED rather than about what a migration file says.
grcvp AS (
  SELECT p.oid,
         regexp_replace(pg_get_functiondef(p.oid), '\s+', ' ', 'g')          AS def,
         p.prosecdef,
         coalesce(array_to_string(p.proconfig, ','), '(none)')               AS proconfig
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.green_room_can_view_post(uuid,uuid)')::oid
),

dpibe AS (
  SELECT p.oid,
         regexp_replace(pg_get_functiondef(p.oid), '\s+', ' ', 'g')          AS def,
         p.prosecdef,
         coalesce(array_to_string(p.proconfig, ','), '(none)')               AS proconfig
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.discover_profile_id_by_email(text)')::oid
)

-- ==========================================================================
-- G - BODY CALLERS. THE PRE-APPLY GATE, NOW HISTORICAL.
--
-- READ THE HEADER FIRST. Migration 210 IS ALREADY APPLIED. This block is not
-- asking permission for anything; it is the standing enumeration of every
-- string-literal function body that names the helper, and its recorded
-- pre-apply answer is quoted in each verdict so a re-run reads as a
-- comparison rather than as a pending decision.
--
-- The set should be UNCHANGED by the relocation - the same two callers - with
-- only the QUALIFIER moved. A third name here now means a body was written
-- after 2026-09-09 that names the helper, and the qualifier it uses decides
-- whether it works: `private.no_block` resolves, a bare or `public.`-qualified
-- reference raises `42883` on its next live call.
-- ==========================================================================

SELECT 100 + row_number() OVER (ORDER BY caller_schema, caller) AS ord,
       'G1 body caller of no_block: ' || caller_schema || '.' || caller
         || '(' || caller_args || ')' AS check_name,
       'refs_private=' || refs_private::text
         || '  refs_public=' || refs_public::text
         || '  refs_bare=' || refs_bare::text AS detail,
       CASE
         WHEN refs_public
           THEN '*** FAIL - this body still names `public.no_block`, which migration 210 DROPPED. It will raise 42883 function does not exist on its next live call. ***'
         WHEN refs_bare
           THEN '*** FAIL - this body names an UNQUALIFIED `no_block(`. Every function in this repo carries SET search_path = '''', so an unqualified name resolves to nothing and raises 42883 on the next live call. ***'
         WHEN refs_private AND caller IN ('green_room_can_view_post', 'discover_profile_id_by_email')
           THEN 'PASS - one of the two callers migration 210 section 3 retargets, and it points at the relocated helper'
         WHEN refs_private
           THEN '*** FAIL - THIRD BODY CALLER. On 2026-09-09 the gate recorded EXACTLY TWO (discover_profile_id_by_email, green_room_can_view_post). This name is new. It resolves today, but it was written after the relocation and nothing in this phase reviewed it - triage it. ***'
         ELSE 'INFO - matched the scan but names no recognised qualified form. Read the body; `prosrc` includes comments, so this may be a mention rather than a call.'
       END AS verdict
FROM nb_bodycaller
WHERE caller_schema = 'public'

UNION ALL
-- G1b - the anti-vacuity control for G1. On 2026-09-09 the scan found exactly
-- two callers in `public`. Zero here would mean the scan matched nothing, and
-- G1 would then be silent because it read nothing rather than because the
-- database is clean.
SELECT 120,
       'G1b body-caller scan anti-vacuity (public)',
       'callers found in public = ' || (SELECT count(*) FROM nb_bodycaller WHERE caller_schema = 'public')
         || '  |  recorded 2026-09-09 pre-apply = 2 (discover_profile_id_by_email, green_room_can_view_post)'
         || '  |  names now = ' || coalesce((SELECT string_agg(caller, ', ' ORDER BY caller)
                                               FROM nb_bodycaller WHERE caller_schema = 'public'), '(none)'),
       CASE
         WHEN (SELECT count(*) FROM nb_bodycaller WHERE caller_schema = 'public') = 0
           THEN '*** FAIL - THE SCAN FOUND NOTHING. G1 is vacuous. Two bodies are known to name this helper; if the scan cannot see them it cannot see a third either. ***'
         WHEN (SELECT count(*) FROM nb_bodycaller WHERE caller_schema = 'public') = 2
           THEN 'PASS - the caller set is unchanged at two, exactly as the 2026-09-09 gate recorded'
         ELSE '*** FAIL - the caller count moved from the recorded 2. Read the G1 rows: a new body names this helper, or one of the two was rewritten. ***'
       END

UNION ALL
-- G2 - the same enumeration OUTSIDE `public`, so a helper that already lives
-- elsewhere is visible. After the relocation `private.no_block` itself does
-- NOT appear here: its body reads `public.blocks` directly and never names
-- itself. Recorded 2026-09-09 pre-apply: (none).
SELECT 121,
       'G2 body callers of no_block OUTSIDE public',
       coalesce((SELECT string_agg(caller_schema || '.' || caller || '(' || caller_args || ')'
                                     || ' [private=' || refs_private::text
                                     || ' public=' || refs_public::text
                                     || ' bare=' || refs_bare::text || ']',
                                   ' | ' ORDER BY caller_schema, caller)
                   FROM nb_bodycaller WHERE caller_schema <> 'public'),
                '(none)'),
       CASE WHEN EXISTS (SELECT 1 FROM nb_bodycaller WHERE caller_schema <> 'public')
            THEN 'INFO - a body outside `public` names the helper. Recorded 2026-09-09 pre-apply: (none). Read the qualifier in the detail column - `public=true` or `bare=true` here is a 42883 waiting to happen.'
            ELSE 'PASS - no body outside `public` names the helper, matching the 2026-09-09 pre-apply reading' END

UNION ALL
-- G3 - THE ROW THAT PRODUCED A FALSE STOP ON 2026-09-09, rewritten.
--
-- The original located the function with
--     AND pg_get_function_identity_arguments(p.oid) = 'uuid, uuid'
-- and that function KEEPS PARAMETER NAMES: production returned `a uuid, b uuid`
-- (length 14), so the equality failed on a function that was present and
-- healthy, and the row read STOP. `to_regprocedure` resolves by type signature
-- and cannot be fooled that way. The raw identity-argument string and its
-- length are printed below precisely so the same mistake diagnoses itself.
SELECT 130,
       'G3 public.no_block(uuid, uuid) - the dropped copy',
       'to_regprocedure(''public.no_block(uuid,uuid)'') = '
         || coalesce(to_regprocedure('public.no_block(uuid,uuid)')::text, 'NULL')
         || '  |  pre-apply 2026-09-09: PRESENT (prosecdef=true, provolatile=s, proconfig=search_path="", authenticated held EXECUTE, anon did not)'
         || '  |  any surviving no_block in ANY schema: '
         || coalesce((SELECT string_agg(n.nspname || '.' || p.proname || '('
                                          || pg_get_function_identity_arguments(p.oid) || ') len='
                                          || length(pg_get_function_identity_arguments(p.oid))::text,
                                        ' | ' ORDER BY n.nspname)
                        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                       WHERE p.proname = 'no_block'), '(none anywhere)'),
       CASE WHEN to_regprocedure('public.no_block(uuid,uuid)') IS NULL
            THEN 'PASS - the public copy is gone, so PostgREST can expose no RPC route to it. This is the whole point of Tier 3.'
            ELSE '*** FAIL - public.no_block STILL EXISTS. Either the DROP in migration 210 section 5 refused with 2BP01 (read its DETAIL line, it names the policy that still depends on it) or something recreated the function. Until this reads NULL the HTTP route is still live. ***' END

UNION ALL
-- G4 - the assumption-free policy count, read from PRODUCTION rather than
-- from the repo. Recorded 2026-09-09 pre-apply: 11.
SELECT 131,
       'G4 policies naming no_block (any qualifier)',
       'count=' || (SELECT count(*) FROM nb_pol)
         || '  (pre-apply 2026-09-09 recorded 11; post-apply recorded 11 of 11 on private.no_block)'
         || '  |  ' || coalesce((SELECT string_agg(tablename || '.' || policyname
                                                     || ' roles=' || roles_txt || ' cmd=' || cmd,
                                                   ' | ' ORDER BY tablename, policyname)
                                   FROM nb_pol), '(none)'),
       CASE (SELECT count(*) FROM nb_pol)
         WHEN 11 THEN 'PASS - eleven, matching both the pre-apply gate and migration 210 section 4'
         WHEN 0  THEN '*** FAIL - ZERO policies name the helper. Either every block check was removed from every policy, or pg_policies is not readable to this session. Both are findings and the second makes block D vacuous. ***'
         ELSE '*** FAIL - the count is not 11. Read rows G5 and D2: a twelfth policy names the helper, or one of the eleven no longer does. ***'
       END

UNION ALL
-- G5 - any policy naming the helper that migration 210 section 4 does not
-- cover. Recorded 2026-09-09 pre-apply: (none).
SELECT 132,
       'G5 policies naming no_block that section 4 does NOT cover',
       coalesce((SELECT string_agg(np.tablename || '.' || np.policyname
                                     || ' roles=' || np.roles_txt
                                     || ' private=' || np.has_reloc::text
                                     || ' stray=' || np.has_stray::text,
                                   ' | ' ORDER BY np.tablename, np.policyname)
                   FROM nb_pol np
                  WHERE NOT EXISTS (SELECT 1 FROM exp_pol e
                                     WHERE e.tablename = np.tablename
                                       AND e.policyname = np.policyname)),
                '(none)'),
       CASE WHEN EXISTS (SELECT 1 FROM nb_pol np
                          WHERE NOT EXISTS (SELECT 1 FROM exp_pol e
                                             WHERE e.tablename = np.tablename
                                               AND e.policyname = np.policyname))
            THEN '*** FAIL - a policy names the helper and migration 210 never rewrote it. If its detail shows stray=true it is pointing at the dropped function and the read it gates is broken. ***'
            ELSE 'PASS - every policy naming the helper is one of the eleven, matching the 2026-09-09 pre-apply reading' END

-- ==========================================================================
-- P - PLACEMENT, GRANTS AND THE FOUR PRESERVED ATTRIBUTES.
--
-- Placement and existence are reported as SEPARATE ROWS on purpose. The
-- intermediate state - the new copy created and the old one still present
-- because the drop refused with 2BP01 - is a real, documented, RECOVERABLE
-- outcome of migration 210, and collapsing it together with a healthy state on
-- one row would report it as a single confusing FAIL instead of two legible
-- rows.
-- ==========================================================================

UNION ALL
SELECT 200,
       'P1 private.no_block(uuid, uuid) exists',
       coalesce((SELECT qname || '(' || idargs || ')  oid=' || oid::text
                          || '  idargs_len=' || length(idargs)::text FROM nb_fn),
                'ABSENT - to_regprocedure(''private.no_block(uuid,uuid)'') returned NULL'),
       CASE WHEN EXISTS (SELECT 1 FROM nb_fn)
            THEN 'PASS - the helper exists in the unexposed schema. Note the idargs string shown: it KEEPS PARAMETER NAMES (`a uuid, b uuid`, length 14). Never compare it to ''uuid, uuid'' - that is the false STOP of 2026-09-09.'
            ELSE '*** FAIL - THE RELOCATED FUNCTION IS NOT THERE. Every one of the eleven policies calls it. If row G3 also reads PASS then the helper exists nowhere at all and every block-gated read is raising 42883 right now. ***' END

UNION ALL
SELECT 201,
       'P2 public.no_block(uuid, uuid) is absent',
       'to_regprocedure(''public.no_block(uuid,uuid)'') = '
         || coalesce(to_regprocedure('public.no_block(uuid,uuid)')::text, 'NULL'),
       CASE WHEN to_regprocedure('public.no_block(uuid,uuid)') IS NULL
            THEN 'PASS - absent, so no HTTP route can exist. PostgREST introspects only exposed schemas.'
            ELSE '*** FAIL - both copies exist. This is the 2BP01 intermediate state: migration 210 created the relocated copy and its DROP refused. The RPC route is STILL LIVE. Read the DETAIL line the drop printed - it names the policy that still depends on the public copy. ***' END

UNION ALL
SELECT 202,
       'P3 schema USAGE on `private`',
       coalesce((SELECT 'authenticated=' || authed_usage::text
                          || '  anon=' || anon_usage::text
                          || '  service_role=' || service_usage::text
                          || '  PUBLIC=' || public_usage::text
                          || '  |  nspacl = ' || nspacl_txt
                   FROM priv_ns),
                'SCHEMA `private` DOES NOT EXIST'),
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM priv_ns)
           THEN '*** FAIL - the schema is not there. Migration 210 section 1 did not apply. ***'
         WHEN (SELECT authed_usage AND NOT anon_usage AND NOT service_usage FROM priv_ns)
           THEN 'PASS - authenticated=true, anon=false, service_role=false, matching the 2026-09-09 post-apply reading. anon is deliberately excluded (granting it would be a behaviour change, not a preservation) and service_role is deliberately excluded (definer bodies run as the function OWNER and need no grant of their own).'
         WHEN (SELECT NOT authed_usage FROM priv_ns)
           THEN '*** FAIL - authenticated has LOST USAGE on the schema. Every one of the eleven policies evaluates as the QUERYING role, so every block-gated read is about to raise 3F000 permission denied for schema. REVERT. ***'
         ELSE '*** FAIL - anon or service_role holds USAGE. Neither was granted by migration 210. Something else granted it - read the nspacl string in the detail column. ***'
       END

UNION ALL
SELECT 203,
       'P4 EXECUTE on private.no_block(uuid, uuid)',
       coalesce((SELECT 'authenticated=' || authed_exec::text
                          || '  anon=' || anon_exec::text
                          || '  service_role=' || service_exec::text
                          || '  PUBLIC=' || public_exec::text
                          || '  |  proacl = ' || proacl_txt
                   FROM nb_fn),
                '(function absent - see P1)'),
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM nb_fn)
           THEN '*** FAIL - no function to hold a grant. See P1. ***'
         WHEN (SELECT authed_exec AND NOT anon_exec AND NOT service_exec FROM nb_fn)
           THEN 'PASS - authenticated=true, anon=false, service_role=false, matching the 2026-09-09 post-apply reading. The relocation removes the ROUTE, not the privilege: a policy expression runs as the querying role and would raise 42501 without this grant.'
         WHEN (SELECT NOT authed_exec FROM nb_fn)
           THEN '*** FAIL - authenticated has LOST EXECUTE. Every block-gated read is about to raise 42501 permission denied for function. REVERT. ***'
         ELSE '*** FAIL - anon or service_role holds EXECUTE. Migration 210 revoked from PUBLIC, anon and authenticated and then granted authenticated only. Read the proacl string in the detail column - a direct Supabase grant does not come off with a FROM PUBLIC revoke (that is migration 047''s defect). ***'
       END

UNION ALL
-- P5 - the four attributes migration 035 shipped and migration 210 had to
-- preserve. SECURITY DEFINER is the load-bearing one and its loss is INVISIBLE
-- to every other check in this file: `blocks_select_own` restricts the calling
-- role to `blocker_id = auth.uid()`, so without definer rights the helper can
-- no longer see the OTHER direction - "did they block me" - and answers the
-- reverse case wrongly while still existing, still applying and still granting.
SELECT 204,
       'P5 relocated function attributes (prosecdef / provolatile / proconfig)',
       coalesce((SELECT 'prosecdef=' || prosecdef::text
                          || '  provolatile=''' || provolatile || ''''
                          || '  proconfig=' || proconfig
                          || '  |  expected: prosecdef=true provolatile=''s'' proconfig=search_path=""'
                   FROM nb_fn),
                '(function absent - see P1)'),
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM nb_fn) THEN '*** FAIL - function absent. See P1. ***'
         WHEN (SELECT NOT prosecdef FROM nb_fn)
           THEN '*** FAIL - SECURITY DEFINER WAS DROPPED. The helper can no longer read the reverse direction of a block, because blocks_select_own confines the querying role to its own blocklist. It will answer "not blocked" for every block placed AGAINST the caller, silently, while every other row in this file still reads PASS. ***'
         WHEN (SELECT provolatile <> 's' FROM nb_fn)
           THEN '*** FAIL - volatility changed. STABLE is what lets the planner cache the result within one statement when the call is wrapped as (SELECT no_block(...)) in a policy. Losing it means per-row re-evaluation on every block-gated read. ***'
         WHEN (SELECT proconfig <> 'search_path=""' FROM nb_fn)
           THEN '*** FAIL - search_path is not pinned to the empty string. The definer now resolves unqualified names against the CALLER''s search_path, which is the T-08-04 hijack vector migration 035 closed and migration 200 closed globally. ***'
         ELSE 'PASS - prosecdef, volatility and search_path all match migration 035, carried through the relocation intact'
       END

-- ==========================================================================
-- D - THE ELEVEN POLICIES, READ FROM PRODUCTION.
--
-- Not from the repo. `pg_policies` deparses what PostgreSQL stored, so this is
-- what is actually evaluated on every read and write those tables receive.
--
-- The stray-reference test NEUTRALISES BOTH QUALIFIED SPELLINGS before looking
-- for a leftover `no_block`. A one-directional substitution - replace
-- `private.no_block` and then search - would report `public.no_block` as clean,
-- which is the exact drift this block exists to catch.
--
-- The full predicate text is printed for EVERY row, passing or failing, so a
-- verdict never has to be taken on trust and a wrong one can be diagnosed
-- without a follow-up query.
-- ==========================================================================

UNION ALL
SELECT 300 + row_number() OVER (ORDER BY tablename, policyname),
       'D1 ' || tablename || '.' || policyname,
       'roles=' || coalesce(roles_txt, '(policy absent)')
         || '  expected=' || expect_roles
         || '  cmd=' || coalesce(cmd, '-')
         || '  names_helper=' || coalesce(names_helper::text, 'n/a')
         || '  private_qualified=' || coalesce(has_reloc::text, 'n/a')
         || '  stray_reference=' || coalesce(has_stray::text, 'n/a')
         || '  expr_len=' || coalesce(length(expr)::text, '0')
         || '  |  PREDICATE: ' || coalesce(expr, '(none - no policy of this name on this table)'),
       CASE
         WHEN expr IS NULL
           THEN '*** FAIL - THE POLICY DOES NOT EXIST. Migration 210 drops each of the eleven and recreates it; a DROP that applied without its CREATE leaves this table with fewer policies, and under RLS that is default-deny for the operation it gated. ***'
         WHEN NOT names_helper
           THEN '*** FAIL - the policy exists but NO LONGER NAMES THE HELPER AT ALL. The block check has been removed from this predicate. Blocked users can now reach this surface. ***'
         WHEN has_stray
           THEN '*** FAIL - a bare or `public.`-qualified `no_block` survives in this predicate. `public.no_block` was dropped, so this policy raises 42883 on every evaluation and the read or write it gates is DOWN. Read the PREDICATE text in the detail column. ***'
         WHEN NOT has_reloc
           THEN '*** FAIL - the predicate names the helper but not as `private.no_block`. Read the PREDICATE text in the detail column. ***'
         WHEN roles_txt IS DISTINCT FROM expect_roles
           THEN '*** FAIL - the `roles` column changed. Compare the two values printed above. For rc_select_public the expected value is {public} and NOT {authenticated}: migration 061 wrote it with no TO clause and migration 210 reproduced that omission deliberately, so {authenticated} here means somebody tidied it and anonymous reads of release_comments have changed behaviour. ***'
         ELSE 'PASS - the production predicate names `private.no_block`, carries no stray reference, and its roles match'
       END
FROM d1

UNION ALL
-- D2 - the reverse direction: a policy naming the helper that is not one of
-- the eleven. Duplicates G5 by design; G5 reads the gate's question ("did
-- section 4 miss one before the drop"), D2 reads the post-apply question
-- ("does an unreviewed policy name this helper now"). Same data, two readers.
SELECT 320 + row_number() OVER (ORDER BY np.tablename, np.policyname),
       'D2 UNEXPECTED policy naming the helper: ' || np.tablename || '.' || np.policyname,
       'roles=' || np.roles_txt || '  cmd=' || np.cmd
         || '  private_qualified=' || np.has_reloc::text
         || '  stray_reference=' || np.has_stray::text
         || '  expr_len=' || length(np.expr)::text
         || '  |  PREDICATE: ' || np.expr,
       '*** FAIL - migration 210 section 4 never rewrote this policy. If stray_reference reads true it points at the dropped function and the operation it gates is raising 42883 right now. ***'
FROM nb_pol np
WHERE NOT EXISTS (SELECT 1 FROM exp_pol e
                   WHERE e.tablename = np.tablename AND e.policyname = np.policyname)

UNION ALL
-- D3 - anti-vacuity. Without it, a `pg_policies` that this session cannot read
-- would produce zero D1 mismatches, zero D2 rows, and a clean bill of health
-- from a block that read nothing at all.
SELECT 340,
       'D3 D-block anti-vacuity and totals',
       'expected policies=' || (SELECT count(*) FROM exp_pol)
         || '  found in production=' || (SELECT count(*) FROM d1 WHERE expr IS NOT NULL)
         || '  naming private.no_block=' || (SELECT count(*) FROM nb_pol WHERE has_reloc)
         || '  carrying a stray reference=' || (SELECT count(*) FROM nb_pol WHERE has_stray)
         || '  total public policies visible to this session=' || (SELECT count(*) FROM prod_pol),
       CASE
         WHEN (SELECT count(*) FROM prod_pol) = 0
           THEN '*** FAIL - pg_policies returned NOTHING. Every row in block D is vacuous. Re-run as a role that can read pg_policies. ***'
         WHEN (SELECT count(*) FROM d1 WHERE expr IS NOT NULL) = 11
              AND (SELECT count(*) FROM nb_pol WHERE has_reloc) = 11
              AND (SELECT count(*) FROM nb_pol WHERE has_stray) = 0
           THEN 'PASS - eleven of eleven present, eleven of eleven qualified to the relocated schema, zero stray references. This reproduces the 2026-09-09 post-apply rows D1 through D4.'
         ELSE '*** FAIL - the totals do not close. Read the individual D1 rows; each prints its full predicate. ***'
       END

-- ==========================================================================
-- B - TIER 2 SURVIVED TIER 3.
--
-- THE SINGLE MOST LIKELY SILENT REGRESSION IN THE WHOLE PHASE.
--
-- Migration 210 section 3a does not ALTER `green_room_can_view_post`; it
-- REPLACES the whole body, because the only way to retarget a call inside a
-- string-literal body is to rewrite the literal. Migration 209 had bound that
-- function's `p_viewer` parameter to `auth.uid()` one wave earlier. A body
-- copied from migration 174 or from 060 instead of from 209 would revert the
-- Tier-2 bind while every relocation check in blocks P and D still read PASS.
--
-- Recorded 2026-09-09 post-apply: "bound AND retargeted".
-- ==========================================================================

UNION ALL
SELECT 400,
       'B1 green_room_can_view_post: Tier-2 bind AND the retarget',
       coalesce((SELECT 'binds_p_viewer=' || (def ~ '\mp_viewer = \(SELECT auth\.uid\(\)\)')::text
                          || '  service_role_disjunct=' || (def LIKE '%(SELECT auth.role()) = ''service_role''%')::text
                          || '  calls_private_no_block=' || (def LIKE '%private.no_block(%')::text
                          || '  stray_no_block=' || (replace(replace(def, 'private.no_block', '#Q#'),
                                                                   'public.no_block',  '#Q#') LIKE '%no_block%')::text
                          || '  pg_trigger_depth=' || (def LIKE '%pg_trigger_depth%')::text
                          || '  prosecdef=' || prosecdef::text
                          || '  proconfig=' || proconfig
                          || '  def_len=' || length(def)::text
                   FROM grcvp),
                'ABSENT - to_regprocedure(''public.green_room_can_view_post(uuid,uuid)'') returned NULL'),
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM grcvp)
           THEN '*** FAIL - THE FUNCTION IS GONE. Twelve RLS policies name it. The Green Room is dark. ***'
         WHEN (SELECT NOT (def ~ '\mp_viewer = \(SELECT auth\.uid\(\)\)') FROM grcvp)
           THEN '*** FAIL - THE TIER-2 BIND IS GONE. Migration 210 replaced this body with one copied from the WRONG SOURCE MIGRATION and reverted migration 209. The cross-user disclosure this phase closed is open again, and blocks P and D would still have read PASS. This is the regression those two blocks cannot see. ***'
         WHEN (SELECT NOT (def LIKE '%(SELECT auth.role()) = ''service_role''%') FROM grcvp)
           THEN '*** FAIL - bound, but the auth.role() = service_role disjunct is absent. lib/trust-safety/reports.ts and lib/green-room/placements-admin.ts run on a connection where auth.uid() is NULL and will break. ***'
         WHEN (SELECT (replace(replace(def, 'private.no_block', '#Q#'), 'public.no_block', '#Q#') LIKE '%no_block%') FROM grcvp)
           THEN '*** FAIL - the body carries a bare or `public.`-qualified no_block. `public.no_block` was dropped and the body has SET search_path = '''', so this raises 42883 on the next Green Room read. ***'
         WHEN (SELECT NOT (def LIKE '%private.no_block(%') FROM grcvp)
           THEN '*** FAIL - the body no longer calls the helper at all. The block check has been removed from Green Room post visibility. ***'
         WHEN (SELECT (def LIKE '%pg_trigger_depth%') FROM grcvp)
           THEN '*** FAIL - the deployed body carries migration 174''s pg_trigger_depth escape. Migrations 209 and 210 both omit it deliberately, so a body other than 210''s is deployed. ***'
         WHEN (SELECT NOT prosecdef OR proconfig <> 'search_path=""' FROM grcvp)
           THEN '*** FAIL - SECURITY DEFINER or the pinned empty search_path was lost in the replace. ***'
         ELSE 'PASS - bound to auth.uid(), service-role disjunct present, retargeted to private.no_block, no stray reference, no trigger-depth escape, definer and search_path intact. Tier 2 survived Tier 3.'
       END

UNION ALL
-- B2 - `discover_profile_id_by_email`. Owner decision D2 declared this
-- function already correct and OUT OF SCOPE: it binds `auth.uid()` DIRECTLY
-- rather than accepting an identity parameter, which is the model this phase
-- copies. Migration 210 changes exactly one thing about it - the helper
-- qualifier - and this row is what makes "exactly one thing" checkable.
SELECT 401,
       'B2 discover_profile_id_by_email: D2 posture AND the retarget',
       coalesce((SELECT 'uses_auth_uid_directly=' || (def LIKE '%auth.uid()%')::text
                          || '  self_exclusion=' || (def LIKE '%profile.id <> auth.uid()%')::text
                          || '  calls_private_no_block=' || (def LIKE '%private.no_block(auth.uid(), profile.id)%')::text
                          || '  stray_no_block=' || (replace(replace(def, 'private.no_block', '#Q#'),
                                                                   'public.no_block',  '#Q#') LIKE '%no_block%')::text
                          || '  is_public_required=' || (def LIKE '%profile.is_public = true%')::text
                          || '  prosecdef=' || prosecdef::text
                          || '  proconfig=' || proconfig
                          || '  def_len=' || length(def)::text
                   FROM dpibe),
                'ABSENT - to_regprocedure(''public.discover_profile_id_by_email(text)'') returned NULL'),
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM dpibe)
           THEN '*** FAIL - THE FUNCTION IS GONE. Migration 210 replaces it; it never drops it. ***'
         WHEN (SELECT (replace(replace(def, 'private.no_block', '#Q#'), 'public.no_block', '#Q#') LIKE '%no_block%') FROM dpibe)
           THEN '*** FAIL - a bare or `public.`-qualified no_block survives in the body. This function has SET search_path = '''' and the public copy is dropped, so email discovery raises 42883 on its next call. ***'
         WHEN (SELECT NOT (def LIKE '%private.no_block(auth.uid(), profile.id)%') FROM dpibe)
           THEN '*** FAIL - the retargeted call is not there in migration 149''s exact form. Either the retarget did not apply, or the body was rewritten from a different source and owner decision D2''s "one mechanical change and nothing else" claim is false. ***'
         WHEN (SELECT NOT (def LIKE '%profile.id <> auth.uid()%') FROM dpibe)
           THEN '*** FAIL - the self-exclusion is gone. D2''s posture - bind auth.uid() directly, never accept an identity parameter - has been altered by a file that was only supposed to change a qualifier. ***'
         WHEN (SELECT NOT (def LIKE '%profile.is_public = true%') FROM dpibe)
           THEN '*** FAIL - the public-profile requirement is gone. This function resolves an EMAIL to a profile id; without that clause it discloses non-public profiles. ***'
         WHEN (SELECT NOT prosecdef OR proconfig <> 'search_path=""' FROM dpibe)
           THEN '*** FAIL - SECURITY DEFINER or the pinned empty search_path was lost in the replace. ***'
         ELSE 'PASS - retargeted to private.no_block and owner decision D2''s posture is intact: auth.uid() bound directly, self excluded, public profiles only, definer with an empty search_path.'
       END

-- ==========================================================================
-- X - ENVIRONMENT RECORD.
-- ==========================================================================

UNION ALL
-- X1 - THE CONTROL THE WHOLE OF TIER 3 RESTS ON, AND IT IS A MUTABLE SETTING.
--
-- The relocation is a ROUTING control, not a privilege control: `private` is
-- unreachable over HTTP only for as long as it stays off the PostgREST
-- exposed-schema list. Adding it under Supabase, API settings, Exposed
-- schemas would restore an RPC route to every function in it and silently
-- undo this entire tier. Nothing in the database prevents that, so this row
-- exists to make the drift visible on every run.
SELECT 500,
       'X1 PostgREST exposed schemas',
       'pgrst.db_schemas = ' || coalesce(current_setting('pgrst.db_schemas', true),
                                         '(NULL - not visible at the database level)'),
       CASE
         WHEN current_setting('pgrst.db_schemas', true) IS NULL
           THEN 'INFO - OWNER ACTION REQUIRED, THIS ROW CANNOT ANSWER ITSELF. PostgREST is configured out of band on Supabase, so the database-level setting is normally NULL. Read Supabase, Project Settings, API, Exposed schemas by eye and confirm `private` is NOT listed, then paste the list in the verification record. Recorded 2026-09-09: `private` was not present.'
         WHEN current_setting('pgrst.db_schemas', true) LIKE '%private%'
           THEN '*** FAIL - `private` IS ON THE EXPOSED-SCHEMA LIST. Tier 3 is undone: every function in that schema has an HTTP RPC route again, including the symmetric block oracle (threat T-08-03). Remove it. ***'
         ELSE 'PASS - `private` is not on the database-level list. STILL CONFIRM THE DASHBOARD VALUE BY EYE - the dashboard is the authoritative one.'
       END

UNION ALL
-- X2 - the exposed-definer count. THE PREDICATE IS THE `defs` CTE ABOVE,
-- COPIED CHARACTER-FOR-CHARACTER from 38.0.3-VERIFY-A-STRUCTURAL.sql. On
-- 2026-09-09 an ad-hoc version of this row read 63 because it omitted
-- `prorettype <> 'trigger'` and the pg_depend extension exclusion, counting
-- trigger and extension functions that were never in the 53 baseline. The
-- count cannot RISE from a migration that only revokes and drops, so a high
-- reading is a suspect ruler before it is a suspect database.
--
-- The arithmetic that closes it:
--     53  baseline 2026-09-08
--     -4  Tier 1 (migration 208): three revokes and one drop   -> 49
--     -1  Tier 3 (migration 210): no_block relocated           -> 48
--
-- The total-definer count is now 114 after the Playbook production apply on
-- 2026-09-10. Its seven additional definers are internal/service-only, so the
-- security-sensitive exposed count remains unchanged at 48.
SELECT 501,
       'X2 exposed public definers (anon or authenticated)',
       'exposed_count=' || (SELECT count(*) FROM exposed)
         || '  expected=48'
         || '  delta_from_expected=' || ((SELECT count(*) FROM exposed) - 48)
         || '  |  all_public_definers=' || (SELECT count(*) FROM defs)
         || '  expected=114'
         || '  |  2026-09-08 baseline was 53 exposed of 109 total; migration 210 left 48 of 107; Playbook added seven non-exposed definers',
       CASE
         WHEN (SELECT count(*) FROM exposed) = 48 AND (SELECT count(*) FROM defs) = 114
           THEN 'PASS - 48 exposed of 114 after the Playbook apply. The seven new definers are not browser-exposed.'
         WHEN (SELECT count(*) FROM exposed) = 48
           THEN 'PARTIAL - the exposed count is right at 48 but the total definer count is not 114. A definer was added or removed by another workstream. Read X3 before accepting the drift.'
         WHEN (SELECT count(*) FROM exposed) = 63
           THEN '*** FAIL - 63 is the number the BROKEN predicate produced on 2026-09-09. If you are reading 63 you are not running the `defs` CTE in this file. Check that both filters survived: prorettype <> trigger, and the pg_depend deptype = ''e'' exclusion. ***'
         WHEN (SELECT count(*) FROM exposed) > 48
           THEN '*** FAIL - MORE exposed definers than expected. Read X3 first: the excess may be a NEW exposure opened by another workstream, which outranks anything this phase closed. ***'
         ELSE '*** FAIL - FEWER exposed definers than expected. Read X4: something lost a grant that this phase never touched, and a policy that names it is about to raise 42501. ***'
       END

UNION ALL
-- X3 - HIGHER PRIORITY THAN ANYTHING THIS PHASE SET OUT TO FIX. A public
-- definer reachable by anon or authenticated that the 2026-09-08 sweep did not
-- record is a new hole opened after this phase started.
SELECT 502,
       'X3 NEW exposures since 2026-09-08 (not in 38.0.3-LIVE-EXPOSED.txt)',
       coalesce((SELECT string_agg(DISTINCT e.proname || '(' || e.idargs || ') anon='
                                     || e.anon_exec::text || ' authed=' || e.authed_exec::text,
                                   ', ' ORDER BY e.proname || '(' || e.idargs || ') anon='
                                     || e.anon_exec::text || ' authed=' || e.authed_exec::text)
                   FROM exposed e
                  WHERE e.proname NOT IN (SELECT proname FROM live_exposed_20260908)),
                '(none)'),
       CASE WHEN EXISTS (SELECT 1 FROM exposed e
                          WHERE e.proname NOT IN (SELECT proname FROM live_exposed_20260908))
            THEN '*** FAIL - A NEW EXPOSED DEFINER APPEARED SINCE THE SWEEP. Triage it before closing this phase; a fresh hole outranks a closed one. ***'
            ELSE 'PASS - no exposure exists that the 2026-09-08 sweep did not already record' END

UNION ALL
-- X4 - the reverse direction, INFO. After migrations 208 and 210 this should
-- be exactly five names: the four Tier-1 functions plus `no_block`.
SELECT 503,
       'X4 baseline names no longer exposed (INFO)',
       'count=' || (SELECT count(*) FROM live_exposed_20260908 l
                     WHERE l.proname NOT IN (SELECT proname FROM exposed))
         || '  |  ' || coalesce((SELECT string_agg(l.proname, ', ' ORDER BY l.proname)
                                   FROM live_exposed_20260908 l
                                  WHERE l.proname NOT IN (SELECT proname FROM exposed)), '(none)'),
       'INFO - expected to be exactly these five: green_room_post_matches_custom_audience, no_block, workspace_access_enabled, workspace_grant_lineage_live, workspace_roster_relationship_is_live. Anything else here lost a grant this phase never touched.'

UNION ALL
-- X5 - the leftover harness table from the 38.0.1 and 38.0.2 runs. A table in
-- `public` with no RLS is a PostgREST-readable table, which is the same class
-- of defect this phase exists to close. This file REPORTS it and does not drop
-- it; dropping is the owner's action, tracked at
-- .planning/todos/pending/2026-09-08-drop-zz-verify-b-results-public-table.md
SELECT 504,
       'X5 leftover public.zz_verify_b_results (INFO)',
       coalesce(
         (SELECT 'EXISTS  rls_enabled=' || c.relrowsecurity::text
                 || '  approx_rows=' || coalesce(c.reltuples::bigint::text, '?')
                 || '  grants: ' || coalesce(
                      (SELECT string_agg(g.grantee || ':' || g.privilege_type, ', ')
                         FROM information_schema.role_table_grants g
                        WHERE g.table_schema = 'public' AND g.table_name = 'zz_verify_b_results'
                          AND g.grantee IN ('anon','authenticated','service_role','PUBLIC')),
                      '(none to anon/authenticated/service_role/PUBLIC)')
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'zz_verify_b_results'),
         'ABSENT - already dropped, nothing to do'),
       CASE WHEN EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                          WHERE n.nspname = 'public' AND c.relname = 'zz_verify_b_results')
            THEN 'INFO - OWNER ACTION: drop it by hand. It was left behind by the 38.0.1 and 38.0.2 harnesses with no RLS and no revoke. Neither this file nor Part B2 creates another one - Part B2 uses a session-local TEMP table that cannot outlive the connection.'
            ELSE 'INFO - absent. Nothing to do.' END

UNION ALL
-- X6 - the D-56 kill switch. REPORTED, NEVER TOUCHED, by either file.
SELECT 505,
       'X6 D-56 workspace access kill switch (INFO)',
       'enabled = ' || coalesce((SELECT enabled::text FROM public.workspace_access_config LIMIT 1), '(no row)'),
       'INFO - neither this file nor Part B2 flips this switch. Recorded for the environment picture only; it is unrelated to the no_block relocation.'

ORDER BY 1;

-- ============================================================
-- END OF PART A2.
--
-- HOW TO READ IT, GIVEN THAT MIGRATION 210 IS ALREADY APPLIED:
--
--   1. Every verdict must read PASS, except the rows marked INFO
--      (G2 when it finds something, X1 when the database-level
--      setting is NULL, X4, X5, X6).
--   2. X1 CANNOT ANSWER ITSELF. Read Supabase, Project Settings,
--      API, Exposed schemas by eye and confirm `private` is absent.
--      That is the control the whole of Tier 3 rests on and it is a
--      dashboard setting, not a database one.
--   3. X2 must read 48 exposed of 114 total. The seven-function increase from
--      the post-210 total of 107 is the non-exposed Playbook workstream. A
--      reading of 63 exposed means
--      the `defs` CTE was altered, not that the database changed.
--   4. B1 is the row to read twice. Blocks P and D can all pass
--      while migration 210 has quietly reverted migration 209's
--      bind, and B1 is the only structural row that can see it.
--      Its behavioural counterpart is row B2-6 of
--      38.0.3-VERIFY-B2-NO-BLOCK.sql - run both.
--   5. If X5 says the leftover table EXISTS, drop it by hand.
--   6. Then run 38.0.3-VERIFY-B2-NO-BLOCK.sql, and finally the two
--      `curl` calls listed at the foot of that file. Only those
--      prove the HTTP ROUTE is gone rather than the privilege.
-- ============================================================
