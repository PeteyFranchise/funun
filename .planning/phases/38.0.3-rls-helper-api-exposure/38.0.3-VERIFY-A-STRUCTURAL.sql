-- ============================================================
-- Phase 38.0.3 — VERIFICATION PART A: STRUCTURAL
--
-- ONE query, ONE result table. Paste into the Supabase SQL editor
-- and run against PRODUCTION.
--
-- Subject: migration 208 (`208_definer_helper_targeted_revokes.sql`,
-- the three Tier-1 EXECUTE revokes plus the one drop) and migration
-- 209 (`209_definer_helper_caller_binding.sql`, the thirteen Tier-2
-- caller-identity binds).
--
-- NUMBERING, STATED ONCE SO NOTHING BELOW IS AMBIGUOUS. Phase
-- 38.0.3's plans were written expecting to claim 207 and 208. 207
-- was taken by the parallel Playbook workstream between planning and
-- execution, so wave 1 shipped 208 and wave 2 shipped 209. The
-- `no_block` relocation (plans 04-06) will claim 210. Wherever a
-- PLAN.md in this phase says "207 and 208", read "208 and 209".
--
-- ─── 1. THIS FILE IS 100% READ-ONLY ───────────────────────────
-- There is no INSERT, UPDATE, DELETE, TRUNCATE, ALTER, DROP,
-- CREATE, GRANT or REVOKE anywhere in it. It creates no table, not
-- even a TEMP one. It does not seed. It does not tear down. It does
-- not touch the D-56 kill switch — it only reports its state. It
-- writes nothing, anywhere, under any branch.
--
-- It deliberately does NOT recreate `public.zz_verify_b_results`.
-- That table was left in `public` by the 38.0.1 and 38.0.2
-- harnesses, with no RLS and no revoke, which makes it a
-- PostgREST-readable table — the same class of defect this phase
-- exists to close. Block F REPORTS it so it can be dropped
-- (tracked at
-- .planning/todos/pending/2026-09-08-drop-zz-verify-b-results-public-table.md).
-- Neither this file nor Part B adds another one.
--
-- ─── 2. WHAT THIS FILE CAN AND CANNOT PROVE ───────────────────
-- IT PROVES SHAPE, NOT BEHAVIOUR. Every row below is a reading of
-- the catalogue: this grant is absent, this function definition
-- contains this text, this policy exists, this event trigger has
-- this handler. NONE OF IT IS AN OBSERVATION OF THE DATABASE DOING
-- ANYTHING.
--
-- That distinction is load-bearing here, and it is not theoretical.
-- This repo has shipped TWO migration defects that a fully green
-- text-lock suite could not see:
--
--   * MIGRATION 139. Migration 190's suite was green, its function
--     existed, and the route called it correctly — and custody
--     transfer was broken in production for a day, because
--     migration 139's differently-named `guard_owner_immutable`
--     also fires on `vault_projects` and refused the sanctioned
--     RPC. A structural probe of 190 would have reported PASS on
--     every row.
--   * MIGRATION 198. Its text-lock suite was green while its
--     `ON CONFLICT` clause raised `42702 column reference is
--     ambiguous` on the very first live call it ever received.
--
-- Both migrations under test here were authored by an agent that
-- opened no database connection, and both are locked only by text
-- tests. Behaviour is Part B's job:
--   .planning/phases/38.0.3-rls-helper-api-exposure/
--     38.0.3-VERIFY-B-PRODUCTION-SINGLE.sql
--
-- ─── 3. RUN IT TWICE. THE PRE-RUN IS A GATE, NOT A REPORT. ─────
--
-- RUN 1 — **BEFORE** applying migration 208 or 209.
-- RUN 2 — AFTER applying both, 208 first.
--
-- The pre-run is not a formality and it is not optional:
--
--   (a) THE GRANT ROWS WILL READ FAIL IN THE PRE-RUN, AND THAT IS
--       THE POINT. Blocks A1/A2 reading "EXPOSED" is the only
--       evidence that the disclosure ever existed. Once the revokes
--       land, that evidence CANNOT BE RECONSTRUCTED — the catalogue
--       keeps no history of a removed grant. If you apply first and
--       verify afterwards, the phase can never show what it fixed.
--       Save the pre-run output verbatim.
--
--   (b) THE PRE-RUN MUST CLEAR THREE GATES BEFORE YOU APPLY
--       ANYTHING. Each is a research assumption that, if false,
--       changes the phase's conclusion rather than merely failing a
--       check:
--
--       E-BLOCK — zero function-body callers of
--         `workspace_roster_relationship_is_live`. PostgreSQL records
--         no dependency for a reference inside a string-literal
--         `AS $$ … $$` body, and every function in this repo uses
--         that form, so migration 208's modifier-free DROP would
--         SUCCEED CLEANLY and leave a caller that raises `42883` on
--         its next invocation. If E2 shows any caller: DO NOT APPLY
--         THE DROP. Use the revoke fallback documented verbatim in
--         migration 208's header instead.
--
--       C-BLOCK — no event trigger grants EXECUTE (research
--         assumption A1). Supabase installs event triggers owned by
--         `supabase_admin` and does not publish the full list. If
--         one of them grants, migrations 208 and 209 ARE NOT
--         DURABLE and the phase needs a different mechanism
--         entirely. STOP and report.
--
--       D-BLOCK — no `UNEXPECTED` policy (research assumption A5).
--         The entire Q1 finding — and therefore the justification
--         for not rewriting a single RLS policy — assumes every
--         production policy originated from a migration file. A
--         policy typed by hand into the Supabase SQL editor would be
--         invisible to a repo-side enumeration. A5 is flagged in
--         38.0.3-RESEARCH.md as "the one thing that could still
--         collapse Q1". An UNEXPECTED row invalidates Q1 for that
--         helper and must be resolved before 209 is applied.
--
--   (c) In the POST-RUN every verdict must read PASS. A row whose
--       verdict still says EXPOSED or NOT BOUND in the post-run
--       means the migration did not apply.
--
-- Paste BOTH outputs into the verification record. One without the
-- other proves nothing: the post-run alone cannot show there was
-- ever a hole, and the pre-run alone cannot show it was closed.
--
-- Verdict strings are written so ONE file reads correctly in BOTH
-- runs. Where a row is expected to differ, the verdict names which
-- run it is describing.
--
-- ─── 4. AN ERROR IS ITSELF A FINDING ──────────────────────────
-- Nothing here is wrapped in `to_regclass`, `to_regprocedure` or a
-- try/catch, DELIBERATELY. If this file raises
-- `relation ... does not exist` or `function ... does not exist`,
-- that IS the result: the object it names is gone or was never
-- created. A silent NULL would be a worse answer than a loud error,
-- because a NULL renders as an absent row and an absent row reads
-- as "nothing to see".
--
-- ─── HOW TO READ THE OUTPUT ───────────────────────────────────
-- Read the `verdict` column. Anything containing FAIL is a finding.
-- Rows marked INFO are informational and carry no pass/fail — they
-- are recorded so the answer is on the record rather than merely
-- asserted.
--
-- Block map:
--   A (100s) — live grant posture. The reading of PRODUCTION that
--              replaces "the migration says so".
--   B (200s) — the bind is in the DEPLOYED definitions, per
--              function, against that function's OWN parameter name.
--   C (300s) — event triggers. ENV-1 / assumption A1.
--   D (400s) — pg_policies diff. ENV-2 / assumption A5.
--   E (550s) — function-body callers. Pitfall 5 / assumption A7.
--   F (600s) — environment record. INFO only.
-- ============================================================

WITH

-- ─── The live SECURITY DEFINER sweep, verbatim from 38.0.3-INVENTORY.md ──
-- Same predicate that produced 38.0.3-LIVE-EXPOSED.txt on 2026-09-08:
-- schema `public`, prosecdef, return type is not `trigger`, not
-- extension-owned. Reproduced character-for-character so the count below is
-- comparable to that file rather than merely similar to it.
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

-- The four Tier-1 functions. Named as a literal list, LEFT JOINed, so a
-- function that has VANISHED surfaces as a row with a null oid rather than as
-- one fewer row in the output. An absent row reads as "nothing to see".
tier1 AS (
  SELECT * FROM (VALUES
    ('workspace_access_enabled',                'revoke'),
    ('workspace_grant_lineage_live',            'revoke'),
    ('green_room_post_matches_custom_audience', 'revoke'),
    ('workspace_roster_relationship_is_live',   'drop')
  ) t(proname, action)
),

-- The thirteen Tier-2 functions WITH THEIR OWN IDENTITY PARAMETER NAME.
--
-- THIS TABLE IS THE LOAD-BEARING INPUT OF BLOCK B. The names are NOT uniform:
-- eleven take `p_uid`, `green_room_can_view_post` takes `p_viewer`, and the
-- two split-sheet helpers take a bare `uid`. `CREATE OR REPLACE FUNCTION`
-- cannot rename a parameter, so a bind written against the wrong name is a
-- no-op that READS AS A FIX. Get one row here wrong and block B will happily
-- report PASS on a function that binds nothing.
--
-- And note `uid` is a SUBSTRING of `p_uid`: the B1 check therefore uses a
-- word-boundary regex (`\m`), not a plain `LIKE '%uid = ...%'`. Wave 2's
-- mutation 2 proved a plain containment check passes on
-- `is_split_sheet_party` bound against the wrong name.
tier2 AS (
  SELECT * FROM (VALUES
    ('workspace_project_permission',         'p_uid'),
    ('workspace_member_role',                'p_uid'),
    ('is_workspace_owner',                   'p_uid'),
    ('green_room_can_view_post',             'p_viewer'),
    ('workspace_audit_visible',              'p_uid'),
    ('custody_transfer_visible',             'p_uid'),
    ('ownership_transfer_visible',           'p_uid'),
    ('workspace_attachment_visible',         'p_uid'),
    ('workspace_agreement_evidence_visible', 'p_uid'),
    ('workspace_grant_visible_to_member',    'p_uid'),
    ('is_split_sheet_initiator',             'uid'),
    ('is_split_sheet_party',                 'uid'),
    ('is_green_room_eligible',               'p_uid')
  ) t(proname, ident)
),

-- Migration 174's six. They MUST still carry the trigger-depth disjunct:
-- migrations 146 and 160 have trigger-side callers that depend on it, and an
-- over-eager cleanup that stripped it from 174 while "tidying up" after
-- migration 209 would break them SILENTLY — a trigger has no auth.uid() to be,
-- so the helper simply answers false and the trigger does the wrong thing
-- without raising. That is exactly how migration 160's
-- review_work_version_comment_carry came to strip cross-user @mentions.
m174 AS (
  SELECT * FROM (VALUES
    ('is_project_owner'),
    ('project_member_role'),
    ('is_buyer_org_member'),
    ('is_work_owner'),
    ('work_member_tier'),
    ('idea_access_level')
  ) t(proname)
),

-- 38.0.3-LIVE-EXPOSED.txt, verbatim — the 53 public definers `anon` or
-- `authenticated` could reach on 2026-09-08, before this phase.
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

-- ─── Block B input: the deployed definitions, whitespace-normalised ──────
t2def AS (
  SELECT t.proname,
         t.ident,
         d.oid,
         regexp_replace(coalesce(pg_get_functiondef(d.oid), ''), '\s+', ' ', 'g') AS def
  FROM tier2 t
  LEFT JOIN defs d ON d.proname = t.proname
),
t2chk AS (
  SELECT proname, ident,
         count(oid) AS n_defs,
         -- Word-boundary anchored. `\muid = ...` cannot match inside `p_uid`,
         -- because the char before `uid` there is `_`, a word character.
         bool_and(def ~ ('\m' || ident || ' = \(SELECT auth\.uid\(\)\)')) AS has_bind,
         bool_and(def LIKE '%(SELECT auth.role()) = ''service_role''%')   AS has_service_disjunct,
         bool_or (def LIKE '%pg_trigger_depth%')                          AS has_trigger_depth
  FROM t2def
  GROUP BY proname, ident
),
m174def AS (
  SELECT m.proname, d.oid,
         regexp_replace(coalesce(pg_get_functiondef(d.oid), ''), '\s+', ' ', 'g') AS def
  FROM m174 m
  LEFT JOIN defs d ON d.proname = m.proname
),
m174chk AS (
  SELECT proname,
         count(oid) AS n_defs,
         bool_and(def LIKE '%pg_trigger_depth%') AS has_trigger_depth
  FROM m174def
  GROUP BY proname
),

-- ─── Block C input: every event trigger and its handler body ─────────────
evt AS (
  SELECT e.evtname,
         e.evtevent,
         -- `evtenabled` is the internal "char" type, not text. Cast it here so
         -- the concatenations below cannot depend on an implicit coercion.
         e.evtenabled::text AS evtenabled,
         n.nspname                       AS handler_schema,
         p.proname                       AS handler,
         pg_get_userbyid(p.proowner)     AS handler_owner,
         coalesce(p.prosrc, '')          AS handler_src
  FROM pg_event_trigger e
  JOIN pg_proc p      ON p.oid = e.evtfoid
  JOIN pg_namespace n ON n.oid = p.pronamespace
),

-- ─── Block D input ───────────────────────────────────────────────────────
--
-- THE EXPECTATION LIST BELOW IS GENERATED, NOT HAND-TYPED. It was produced by
-- the parser in `__tests__/rls-helper-callsites.test.ts` (wave 1) — the same
-- comment-stripping, dollar-region-mapping, balanced-argument parser that
-- proves the Q1 finding on every `npm test` — extended with a DROP POLICY fold
-- so the list is the FINAL state of the corpus rather than every policy ever
-- written. A hand-typed list would only prove that somebody typed it.
--
-- Fold: statements are replayed in filename order and, within a file, in
-- character offset order. CREATE/ALTER POLICY sets the authoritative text for
-- (table, policy); DROP POLICY removes it. 208 policies survive the fold, and
-- 44 of them name one of the eighteen in-scope helpers, across 48 call sites.
--
-- CORROBORATION, WORTH RECORDING: this fold independently reproduces
-- plan-check's own count of **11** live `no_block` policy sites — not the 15
-- that owner decision D4 quoted loosely, which is the pre-fold historical
-- figure. Two parsers written from different starting points agreeing on a
-- non-obvious number is the only reason to believe either.
--
-- Tier-1 contributes ZERO tuples, deliberately: assertion (b) of the wave-1
-- test proves all four are named by no policy at all, and that zero IS the
-- justification for migration 208's revokes. Any Tier-1 name appearing in
-- production's policy set is therefore an UNEXPECTED row and a hard FAIL.
repo_pol AS (
  SELECT * FROM (VALUES
    ('public', 'connections', 'connections_insert_own', 'no_block'),
    ('public', 'dm_messages', 'dmm_insert_sender', 'no_block'),
    ('public', 'dm_threads', 'dmt_insert_participant', 'no_block'),
    ('public', 'endorsements', 'endo_insert_author', 'no_block'),
    ('public', 'follows', 'follows_insert_own', 'no_block'),
    ('public', 'green_room_comments', 'green_room_comments_insert_visible_post', 'green_room_can_view_post'),
    ('public', 'green_room_comments', 'green_room_comments_select_visible', 'green_room_can_view_post'),
    ('public', 'green_room_comments', 'green_room_comments_select_visible', 'no_block'),
    ('public', 'green_room_post_audiences', 'green_room_audiences_select_visible', 'green_room_can_view_post'),
    ('public', 'green_room_posts', 'green_room_posts_insert_own', 'is_green_room_eligible'),
    ('public', 'green_room_posts', 'green_room_posts_select_visible', 'green_room_can_view_post'),
    ('public', 'green_room_reactions', 'green_room_reactions_insert_own_visible_post', 'green_room_can_view_post'),
    ('public', 'green_room_reactions', 'green_room_reactions_select_visible', 'green_room_can_view_post'),
    ('public', 'green_room_reactions', 'green_room_reactions_select_visible', 'no_block'),
    ('public', 'green_room_reposts', 'green_room_reposts_insert_own_visible_original', 'green_room_can_view_post'),
    ('public', 'green_room_reposts', 'green_room_reposts_select_visible', 'green_room_can_view_post'),
    ('public', 'green_room_reposts', 'green_room_reposts_select_visible', 'no_block'),
    ('public', 'release_comments', 'rc_insert_author', 'no_block'),
    ('public', 'release_comments', 'rc_select_public', 'no_block'),
    ('public', 'split_sheet_parties', 'Initiator sees all parties', 'is_split_sheet_initiator'),
    ('public', 'split_sheets', 'Parties can view split sheets', 'is_split_sheet_party'),
    ('public', 'vault_projects', 'vault_projects_select_owner_or_member', 'workspace_project_permission'),
    ('public', 'vault_projects', 'vault_projects_update_owner_or_editor', 'workspace_project_permission'),
    ('public', 'wall_posts', 'wall_insert_author', 'no_block'),
    ('public', 'workspace_agreement_evidence', 'workspace_agreement_evidence_select', 'workspace_agreement_evidence_visible'),
    ('public', 'workspace_attachments', 'workspace_attachments_select', 'workspace_attachment_visible'),
    ('public', 'workspace_audit_log', 'workspace_audit_log_select', 'workspace_member_role'),
    ('public', 'workspace_custody_transfers', 'workspace_custody_transfers_select', 'custody_transfer_visible'),
    ('public', 'workspace_grants', 'workspace_grants_select', 'workspace_grant_visible_to_member'),
    ('public', 'workspace_grants', 'workspace_grants_select', 'workspace_member_role'),
    ('public', 'workspace_invitations', 'workspace_invitations_select', 'is_workspace_owner'),
    ('public', 'workspace_invitations', 'workspace_invitations_select', 'workspace_member_role'),
    ('public', 'workspace_members', 'workspace_members_select', 'is_workspace_owner'),
    ('public', 'workspace_members', 'workspace_members_select', 'workspace_member_role'),
    ('public', 'workspace_ownership_transfers', 'workspace_ownership_transfers_select', 'ownership_transfer_visible'),
    ('public', 'workspace_permission_bundles', 'workspace_permission_bundles_select', 'workspace_member_role'),
    ('public', 'workspace_permission_requests', 'workspace_permission_requests_workspace_insert', 'is_workspace_owner'),
    ('public', 'workspace_permission_requests', 'workspace_permission_requests_workspace_insert', 'workspace_member_role'),
    ('public', 'workspace_permission_requests', 'workspace_permission_requests_workspace_select', 'is_workspace_owner'),
    ('public', 'workspace_permission_requests', 'workspace_permission_requests_workspace_select', 'workspace_member_role'),
    ('public', 'workspace_permission_requests', 'workspace_permission_requests_workspace_withdraw', 'is_workspace_owner'),
    ('public', 'workspace_permission_requests', 'workspace_permission_requests_workspace_withdraw', 'workspace_member_role'),
    ('public', 'workspace_roster_relationships', 'workspace_roster_relationships_select', 'workspace_member_role'),
    ('public', 'workspaces', 'workspaces_select_member', 'workspace_member_role')
  ) t(schemaname, tablename, policyname, helper_name)
),

-- The eighteen in-scope helpers with the ZERO-BASED index of the
-- caller-supplied IDENTITY argument. Copied from IDENTITY_INDEX in the wave-1
-- parser test, where the same non-uniformity is documented: eleven two-arg
-- helpers and the one three-arg helper take (row_id, uid[, permission]) so the
-- identity is index 1; `is_green_room_eligible` takes (uid) so index 0; and
-- `no_block(a, b)` takes THE VIEWER FIRST, so index 0. Getting one wrong is
-- precisely how this block would pass while reading a row-derived id and
-- cheerfully confirming it is not auth.uid(). NULL = no identity argument.
inscope AS (
  SELECT * FROM (VALUES
    ('workspace_project_permission',           1),
    ('workspace_member_role',                  1),
    ('is_workspace_owner',                     1),
    ('green_room_can_view_post',               1),
    ('workspace_audit_visible',                1),
    ('custody_transfer_visible',               1),
    ('ownership_transfer_visible',             1),
    ('workspace_attachment_visible',           1),
    ('workspace_agreement_evidence_visible',   1),
    ('workspace_grant_visible_to_member',      1),
    ('is_split_sheet_initiator',               1),
    ('is_split_sheet_party',                   1),
    ('is_green_room_eligible',                 0),
    ('no_block',                               0),
    ('workspace_access_enabled',               NULL),
    ('workspace_grant_lineage_live',           NULL),
    ('green_room_post_matches_custom_audience', 1),
    ('workspace_roster_relationship_is_live',  NULL)
  ) t(helper_name, ident_idx)
),

prod_pol AS (
  SELECT schemaname, tablename, policyname,
         coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
  FROM pg_policies
  WHERE schemaname = 'public'
),

-- Every (production policy, in-scope helper) pair. `\m` is PostgreSQL's
-- beginning-of-word constraint, so `no_block` cannot match inside a longer
-- identifier, and `public.no_block(` still matches because `.` is not a word
-- character. pg_get_expr deparses the qual, so schema qualification may or may
-- not be present depending on search_path — both forms are covered.
prod_named AS (
  SELECT p.schemaname, p.tablename, p.policyname,
         i.helper_name, i.ident_idx, p.expr
  FROM prod_pol p
  JOIN inscope i ON p.expr ~ ('\m' || i.helper_name || '\(')
),

-- ─── Identity-argument extraction FROM PRODUCTION TEXT ───────────────────
--
-- This is the assumption-free half of the D-block. The repo-side test proves
-- the identity index of every call site the REPO produced; this proves what
-- PRODUCTION actually contains, without trusting the repo at all.
--
-- Method, in three steps, all read-only and all inside this query:
--   1. `call_site` finds each occurrence of `<helper>(` in the deparsed
--      expression that is not part of a longer identifier.
--   2. `arg_scan` walks the characters from just after that paren, carrying a
--      running parenthesis depth. The call's argument list ends at the first
--      position where the depth reaches -1 (the call's own closing paren), and
--      a comma at depth 0 is a TOP-LEVEL argument separator. A naive split on
--      commas would be wrong against real call sites in this repo:
--      `dmt_insert_participant` passes a `CASE … END` expression, and several
--      policies nest scalar subselects inside an argument.
--   3. `arg_seg` slices the original text at those boundaries, so argument
--      numbering matches the parser's zero-based IDENTITY_INDEX exactly.
call_site AS (
  SELECT pn.tablename, pn.policyname, pn.helper_name, pn.ident_idx, pn.expr,
         g.i + length(pn.helper_name) + 1 AS argstart
  FROM prod_named pn
  CROSS JOIN LATERAL generate_series(1, length(pn.expr)) g(i)
  WHERE substr(pn.expr, g.i, length(pn.helper_name) + 1) = pn.helper_name || '('
    AND (g.i = 1 OR substr(pn.expr, g.i - 1, 1) !~ '[A-Za-z0-9_]')
),
arg_scan AS (
  SELECT c.tablename, c.policyname, c.helper_name, c.ident_idx, c.expr, c.argstart,
         k,
         substr(c.expr, k, 1) AS ch,
         sum(CASE substr(c.expr, k, 1) WHEN '(' THEN 1 WHEN ')' THEN -1 ELSE 0 END)
           OVER (PARTITION BY c.tablename, c.policyname, c.helper_name, c.argstart
                 ORDER BY k) AS depth_after
  FROM call_site c
  CROSS JOIN LATERAL generate_series(c.argstart, length(c.expr)) k
),
call_end AS (
  SELECT tablename, policyname, helper_name, ident_idx, expr, argstart,
         min(k) FILTER (WHERE depth_after = -1) AS endk
  FROM arg_scan
  GROUP BY tablename, policyname, helper_name, ident_idx, expr, argstart
),
boundary AS (
  SELECT tablename, policyname, helper_name, ident_idx, expr, argstart, endk,
         argstart - 1 AS bpos
  FROM call_end
  UNION ALL
  SELECT s.tablename, s.policyname, s.helper_name, s.ident_idx, s.expr, s.argstart, e.endk,
         s.k
  FROM arg_scan s
  JOIN call_end e USING (tablename, policyname, helper_name, argstart)
  WHERE s.ch = ',' AND s.depth_after = 0 AND s.k < e.endk
  UNION ALL
  SELECT tablename, policyname, helper_name, ident_idx, expr, argstart, endk, endk
  FROM call_end
),
arg_seg AS (
  SELECT tablename, policyname, helper_name, ident_idx, argstart,
         row_number() OVER (PARTITION BY tablename, policyname, helper_name, argstart
                            ORDER BY bpos) - 1 AS argno,
         btrim(substr(
           expr,
           bpos + 1,
           lead(bpos) OVER (PARTITION BY tablename, policyname, helper_name, argstart
                            ORDER BY bpos) - bpos - 1
         )) AS argtext
  FROM boundary
),
-- No re-join to `prod_named` here, deliberately: `arg_seg` already carries
-- ident_idx down from it, and a redundant join could only duplicate rows and
-- inflate the D4b anti-vacuity count into a false PASS.
ident_arg AS (
  SELECT a.tablename, a.policyname, a.helper_name, a.argstart, a.argtext,
         -- Accepts every form PostgreSQL's deparser produces for the two ways
         -- this repo writes the caller identity: `auth.uid()` bare, and the
         -- `(SELECT auth.uid())` wrapping migrations 193/194 introduced, which
         -- deparses as `( SELECT auth.uid() AS uid)`.
         lower(regexp_replace(coalesce(a.argtext, ''), '\s+', '', 'g'))
           ~ '^\(?(select)?auth\.uid\(\)(as[a-z_]+)?\)?$' AS is_auth_uid
  FROM arg_seg a
  WHERE a.argno = a.ident_idx AND a.ident_idx IS NOT NULL
),

-- ─── Block E input: string-literal function bodies ───────────────────────
--
-- PostgreSQL records a dependency for a reference inside a POLICY expression
-- but NOT for one inside a string-literal `AS $$ … $$` body, and every
-- function in this repo uses that form. PostgreSQL's own CREATE FUNCTION
-- documentation says as much: that form "may leave dangling functions". So
-- migration 208's modifier-free DROP is self-verifying for policies and
-- BLIND TO BODIES — it succeeds cleanly and the caller raises 42883 later.
--
-- CAVEAT, STATED SO A ROW HERE IS NOT MISREAD: `prosrc` includes comments
-- inside the body. A body that merely MENTIONS the helper in a comment is
-- counted here. That errs safe — it produces a spurious caller row, and the
-- owner reads the row rather than applying a drop on a false clean. Read E1
-- before concluding.
bodycaller AS (
  SELECT t.proname AS helper,
         p.proname AS caller,
         pg_get_function_identity_arguments(p.oid) AS caller_args
  FROM tier1 t
  JOIN pg_proc p      ON p.prosrc ~ ('\m' || t.proname || '\s*\(')
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname <> t.proname
)

-- ══════════════════════════════════════════════════════════════════════════
-- A — LIVE GRANT POSTURE. THE READING OF PRODUCTION.
--
-- The repo does NOT reliably reflect grants. Migration 047 is the proof: it
-- revoked `apply_to_opportunity_atomic` FROM PUBLIC and the repo looked
-- correct, while Supabase's DIRECT grants to `anon`/`authenticated` survived
-- untouched from 2026 until the sweep on 2026-09-08. Every claim below is
-- therefore a reading of `has_function_privilege` against the live catalogue,
-- never a reading of a migration file.
-- ══════════════════════════════════════════════════════════════════════════

-- A1 — the three Tier-1 REVOKE targets. Expect anon=false AND authed=false.
SELECT 100 + row_number() OVER (ORDER BY t.proname) AS ord,
       'A1 Tier-1 revoked: ' || t.proname AS check_name,
       coalesce(
         string_agg(t.proname || '(' || d.idargs || ') anon=' || d.anon_exec
                    || ' authed=' || d.authed_exec || ' service=' || d.service_exec, ' | '),
         '(function not present in pg_proc)'
       ) AS detail,
       CASE
         WHEN count(d.oid) = 0
           THEN '*** FAIL — FUNCTION IS GONE. 208 revokes, it never drops these three. ***'
         WHEN bool_or(d.anon_exec) OR bool_or(d.authed_exec)
           THEN '*** FAIL — EXPOSED. EXPECTED IN THE PRE-RUN (this row is the disclosure evidence); a FAIL here in the POST-RUN means migration 208 did not apply. ***'
         ELSE 'PASS — anon and authenticated hold no EXECUTE'
       END AS verdict
FROM tier1 t
LEFT JOIN defs d ON d.proname = t.proname
WHERE t.action = 'revoke'
GROUP BY t.proname

UNION ALL
-- A2 — the one DROP target. Three distinct outcomes, deliberately not two:
-- "still present but revoked" is the documented FALLBACK path from migration
-- 208's header (used when the live DROP refuses with 2BP01), and collapsing it
-- into a plain FAIL would hide a correct, deliberate owner decision.
SELECT 110,
       'A2 Tier-1 dropped: workspace_roster_relationship_is_live',
       coalesce(
         (SELECT string_agg(d.proname || '(' || d.idargs || ') anon=' || d.anon_exec
                            || ' authed=' || d.authed_exec, ' | ')
            FROM defs d WHERE d.proname = 'workspace_roster_relationship_is_live'),
         '(absent from pg_proc)'
       ),
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM defs d WHERE d.proname = 'workspace_roster_relationship_is_live')
           THEN 'PASS — function no longer exists (the drop applied)'
         WHEN EXISTS (SELECT 1 FROM defs d WHERE d.proname = 'workspace_roster_relationship_is_live'
                        AND NOT d.anon_exec AND NOT d.authed_exec)
           THEN 'PASS (FALLBACK PATH) — still present but revoked from anon and authenticated. This is migration 208''s documented 2BP01 fallback. Confirm the owner took it deliberately.'
         ELSE '*** FAIL — PRESENT AND STILL EXECUTABLE. Expected in the PRE-RUN; in the POST-RUN it means neither the drop nor the fallback revoke applied. ***'
       END

UNION ALL
-- A3 — the thirteen Tier-2 functions. THE EXPECTATION IS THE OPPOSITE OF A1.
--
-- Tier 2 deliberately KEEPS the `authenticated` EXECUTE grant. These thirteen
-- ARE named by RLS policies (44 policies, 48 call sites — see block D), and a
-- policy expression is evaluated with the privileges of the QUERYING role, so
-- revoking one raises `42501 permission denied for function` on every read
-- that policy gates. The BODY closes the disclosure, not the grant.
--
-- A ROW HERE READING authed=false IS AN EMERGENCY, NOT A SUCCESS: it means
-- somebody applied migration 208's TRAP exemption to the wrong tier and Green
-- Room reads, split sheets, the workspace roster and the audit log are about
-- to start failing.
SELECT 120 + row_number() OVER (ORDER BY t.proname),
       'A3 Tier-2 grant posture: ' || t.proname,
       coalesce(
         string_agg(t.proname || '(' || d.idargs || ') anon=' || d.anon_exec
                    || ' authed=' || d.authed_exec || ' service=' || d.service_exec, ' | '),
         '(function not present in pg_proc)'
       ),
       CASE
         WHEN count(d.oid) = 0 THEN '*** FAIL — FUNCTION IS MISSING ***'
         WHEN bool_or(d.anon_exec)
           THEN '*** FAIL — anon can EXECUTE. 209 revokes anon explicitly; either it did not apply or something re-granted. ***'
         WHEN NOT bool_and(d.authed_exec)
           THEN '*** FAIL — authenticated LOST EXECUTE. THE TRAP WAS APPLIED TO THE WRONG TIER. Every policy calling this helper is about to raise 42501. REVERT. ***'
         ELSE 'PASS — authenticated keeps EXECUTE (required), anon does not'
       END
FROM tier2 t
LEFT JOIN defs d ON d.proname = t.proname
GROUP BY t.proname

UNION ALL
-- A3b — `no_block`, INFO. NEITHER MIGRATION 208 NOR 209 TOUCHES IT: owner
-- decision D4 relocates it to a non-exposed schema in plans 04-06 (migration
-- 210) rather than binding it, because `no_block(a, b)` is symmetric and any
-- bind permitting the policy path also answers "did X block me?" — threat
-- T-08-03, which migration 035 deliberately closed at the table.
--
-- Its live grant posture is recorded here because plan 06's baseline depends
-- on it: `rc_select_public` carries no `TO` clause, so it applies to `anon`,
-- and whether `anon` can execute `no_block` today decides what Part B's B12
-- INFO row will show. Read this row alongside B12.
SELECT 139,
       'A3b no_block grant posture (INFO — Tier 3, relocated in plan 05/06)',
       coalesce((SELECT string_agg(d.proname || '(' || d.idargs || ') anon=' || d.anon_exec
                                   || ' authed=' || d.authed_exec || ' service=' || d.service_exec, ' | ')
                   FROM defs d WHERE d.proname = 'no_block'),
                '(no_block absent from pg_proc)'),
       'INFO — no verdict. This phase does not change no_block. Record the value; plan 06 must reproduce Part B''s B12 outcome exactly after the relocation.'

UNION ALL
-- A4 — the aggregate exposed-definer count, against a known baseline.
-- 38.0.3-LIVE-EXPOSED.txt recorded 53 on 2026-09-08. After 208 and 209 the
-- expectation is 53 minus the four Tier-1 functions = 49. Both readings are
-- named so this single row is correct in the pre-run and the post-run.
SELECT 140,
       'A4 exposed public definers (anon or authenticated)',
       'actual=' || (SELECT count(*) FROM exposed)
         || '  pre-208 baseline=53  post-208/209 expected=49  delta_from_baseline='
         || ((SELECT count(*) FROM exposed) - 53),
       CASE (SELECT count(*) FROM exposed)
         WHEN 53 THEN 'PRE-RUN BASELINE — matches 38.0.3-LIVE-EXPOSED.txt exactly. *** FAIL if this is the POST-RUN. ***'
         WHEN 49 THEN 'PASS (POST-RUN) — dropped by exactly four, the Tier-1 set'
         ELSE '*** FAIL — neither 53 nor 49. Read A5 before anything else: the drift may be a NEW exposure, not this phase. ***'
       END

UNION ALL
-- A5 — HIGHER PRIORITY THAN ANYTHING THIS PHASE SET OUT TO FIX.
-- A public definer reachable by anon or authenticated that was NOT in the
-- 2026-09-08 sweep appeared afterwards. That is a new hole opened by another
-- workstream, and it outranks the four this phase is closing.
SELECT 141,
       'A5 NEW exposures since 2026-09-08 (not in 38.0.3-LIVE-EXPOSED.txt)',
       coalesce((SELECT string_agg(DISTINCT e.proname, ', ' ORDER BY e.proname)
                   FROM exposed e
                  WHERE e.proname NOT IN (SELECT proname FROM live_exposed_20260908)),
                '(none)'),
       CASE WHEN EXISTS (SELECT 1 FROM exposed e
                          WHERE e.proname NOT IN (SELECT proname FROM live_exposed_20260908))
            THEN '*** FAIL — A NEW EXPOSED DEFINER APPEARED SINCE THE SWEEP. Triage this before continuing the phase. ***'
            ELSE 'PASS — no exposure exists that the 2026-09-08 sweep did not record' END

UNION ALL
-- A5b — the reverse direction, INFO. A name in the baseline that is no longer
-- exposed. After 208/209 exactly the four Tier-1 names belong here.
SELECT 142,
       'A5b baseline names no longer exposed (INFO)',
       coalesce((SELECT string_agg(l.proname, ', ' ORDER BY l.proname)
                   FROM live_exposed_20260908 l
                  WHERE l.proname NOT IN (SELECT proname FROM exposed)),
                '(none)'),
       'INFO — after 208 and 209 this should be exactly the four Tier-1 names, and nothing else'

UNION ALL
-- A6 — `search_path=""` on every definer. The INVENTORY established this as
-- universally true. A regression re-opens the schema-shadowing vector
-- migration 200 closed: a definer without an empty search_path resolves
-- unqualified names against the CALLER's search_path, so a caller who can
-- create objects can shadow a table the definer reads.
SELECT 150,
       'A6 search_path="" on every public SECURITY DEFINER',
       'definers=' || (SELECT count(*) FROM defs)
         || '  offenders=' || (SELECT count(*) FROM defs WHERE proconfig <> 'search_path=""')
         || '  ' || coalesce((SELECT string_agg(proname || ' [' || proconfig || ']', ', ' ORDER BY proname)
                                FROM defs WHERE proconfig <> 'search_path=""'), ''),
       CASE WHEN (SELECT count(*) FROM defs WHERE proconfig <> 'search_path=""') = 0
            THEN 'PASS — every definer pins search_path to the empty string'
            ELSE '*** FAIL — a definer resolves unqualified names against the CALLER''s search_path ***' END

-- ══════════════════════════════════════════════════════════════════════════
-- B — THE BIND IS IN THE DEPLOYED DEFINITION, NOT ONLY IN THE FILE.
--
-- Migration 209 is locked by 208 text-lock tests, and text-lock tests prove
-- what the SQL SAYS. This block reads `pg_get_functiondef` off the live
-- catalogue, which is what PostgreSQL actually compiled.
--
-- Every check is anchored to that function's OWN parameter name, from the
-- `tier2` table above. `CREATE OR REPLACE FUNCTION` cannot rename a parameter,
-- so a bind written against the wrong name is a no-op that reads as a fix —
-- and `uid` is a substring of `p_uid`, so the check is word-boundary anchored.
-- ══════════════════════════════════════════════════════════════════════════

UNION ALL
SELECT 200 + row_number() OVER (ORDER BY proname),
       'B1 Tier-2 bind deployed: ' || proname || ' (identity param `' || ident || '`)',
       'definitions=' || n_defs
         || '  binds_' || ident || '=' || coalesce(has_bind::text, 'null')
         || '  service_role_disjunct=' || coalesce(has_service_disjunct::text, 'null')
         || '  pg_trigger_depth=' || coalesce(has_trigger_depth::text, 'null'),
       CASE
         WHEN n_defs = 0 THEN '*** FAIL — FUNCTION IS MISSING FROM pg_proc ***'
         WHEN n_defs > 1 THEN '*** FAIL — OVERLOADED. 209 replaces one signature; another exists and is unbound. ***'
         WHEN NOT has_bind
           THEN '*** FAIL — NOT BOUND. Expected in the PRE-RUN; in the POST-RUN it means 209 did not apply, or applied against the WRONG PARAMETER NAME. ***'
         WHEN NOT has_service_disjunct
           THEN '*** FAIL — bound but the auth.role()=service_role disjunct is absent. lib/trust-safety/reports.ts and lib/green-room/placements-admin.ts run on a connection where auth.uid() is NULL and will break. ***'
         WHEN has_trigger_depth
           THEN '*** FAIL — carries migration 174''s pg_trigger_depth escape. 209 omits it deliberately; its presence means a body other than 209''s is deployed. ***'
         ELSE 'PASS — bound to its own identity parameter, service-role disjunct present, no trigger-depth escape'
       END
FROM t2chk

UNION ALL
-- B2 — the counterpart. Migration 174's six MUST STILL carry the trigger-depth
-- disjunct. Migrations 146 and 160 have trigger-side callers that depend on it.
-- A tidy-up that stripped it from 174 while "aligning" it with 209 would break
-- them silently — no exception, just a helper answering false inside a trigger.
SELECT 220 + row_number() OVER (ORDER BY proname),
       'B2 migration-174 trigger-depth preserved: ' || proname,
       'definitions=' || n_defs || '  pg_trigger_depth=' || coalesce(has_trigger_depth::text, 'null'),
       CASE
         WHEN n_defs = 0 THEN '*** FAIL — FUNCTION IS MISSING ***'
         WHEN has_trigger_depth THEN 'PASS — migration 174''s trigger escape is intact'
         ELSE '*** FAIL — TRIGGER ESCAPE STRIPPED. Migrations 146 and 160 call this from trigger context and will now get the wrong answer with no error. ***'
       END
FROM m174chk

-- ══════════════════════════════════════════════════════════════════════════
-- C — EVENT TRIGGERS. ENV-1, RESEARCH ASSUMPTION A1.
--
-- THE SINGLE HIGHEST-VALUE UNKNOWN LEFT IN THE PHASE.
--
-- Supabase installs event triggers owned by `supabase_admin` that fire on
-- ddl_command_end / sql_drop — principally `pgrst_ddl_watch` and
-- `pgrst_drop_watch` for schema-cache reload, plus extension-access grants
-- (`grant_pg_cron_access`, `grant_pg_net_access`, `grant_pg_graphql_access`).
-- Supabase does NOT publish the full installed list, so 38.0.3-RESEARCH.md
-- marks this ASSUMED and requires this query to close it.
--
-- The stakes: an open Supabase bug report (supabase/supabase#43884) describes
-- functions in custom API schemas receiving EXECUTE for anon/authenticated
-- "even when only GRANT USAGE was granted on the schema", and the reporter's
-- own workaround was an event trigger that revokes after every function
-- creation. If the platform runs a handler that GRANTS, the revokes in
-- migration 208 are NOT DURABLE — they would silently un-apply on the next
-- DDL, and the phase needs a different mechanism entirely.
-- ══════════════════════════════════════════════════════════════════════════

UNION ALL
SELECT 300,
       'C1 event-trigger handlers containing GRANT',
       coalesce((SELECT string_agg(evtname || ' -> ' || handler_schema || '.' || handler
                                   || ' (owner ' || handler_owner || ', ' || evtevent || ')',
                                   ' | ' ORDER BY evtname)
                   FROM evt WHERE handler_src ILIKE '%grant%'),
                '(no handler body contains the string GRANT)'),
       CASE WHEN EXISTS (SELECT 1 FROM evt WHERE handler_src ILIKE '%grant%')
            THEN '*** FAIL — AN EVENT TRIGGER HANDLER CONTAINS A GRANT. STOP THE PHASE. Migrations 208 and 209 are not durable: the platform may re-grant EXECUTE after any DDL. Read the handler body before applying anything. ***'
            ELSE 'PASS — no event-trigger handler body contains a grant; assumption A1 holds on this database' END

UNION ALL
-- C2 — the full list, INFO, unconditionally. The answer goes ON THE RECORD
-- rather than being asserted away by a single PASS row. If C1 ever flips, the
-- reader needs to see what changed and when.
SELECT 301 + row_number() OVER (ORDER BY evtname),
       'C2 event trigger (INFO): ' || evtname,
       evtevent || ' | enabled=' || evtenabled || ' | handler=' || handler_schema || '.' || handler
         || ' | owner=' || handler_owner || ' | body_len=' || length(handler_src)
         || ' | mentions_grant=' || (handler_src ILIKE '%grant%')::text,
       'INFO — recorded so the A1 answer is evidenced, not assumed'
FROM evt

UNION ALL
SELECT 340,
       'C3 event trigger count (anti-vacuity)',
       (SELECT count(*)::text FROM evt) || ' event trigger(s) visible to this session',
       CASE WHEN (SELECT count(*) FROM evt) = 0
            THEN '*** FAIL — ZERO event triggers visible. C1 is then VACUOUS: it passed because it read nothing. Re-run as a role that can see pg_event_trigger. ***'
            ELSE 'PASS — C1 had rows to read' END

-- ══════════════════════════════════════════════════════════════════════════
-- D — pg_policies DIFF. ENV-2, RESEARCH ASSUMPTION A5.
--
-- THE ONE THING THAT COULD STILL COLLAPSE Q1.
--
-- The whole Q1 analysis — and therefore the entire justification for not
-- rewriting a single RLS policy in this phase — assumes that EVERY policy in
-- production originated from a migration file. A policy typed by hand into the
-- Supabase SQL editor would be invisible to a repo-side enumeration, and if it
-- passed anything other than auth.uid() at the identity position, migration
-- 209's bind would CHANGE ITS ANSWER and the "no policy is edited" claim would
-- be false. 38.0.3-RESEARCH.md flags this as assumption A5, "the one thing
-- that could still collapse Q1".
--
-- The expectation side of this join is GENERATED from the wave-1 parser (see
-- the `repo_pol` comment above), not hand-typed.
-- ══════════════════════════════════════════════════════════════════════════

UNION ALL
-- D1 — UNEXPECTED. A production policy naming an in-scope helper that no
-- migration file produced. This is A5 materialising.
SELECT 400 + row_number() OVER (ORDER BY pn.tablename, pn.policyname, pn.helper_name),
       'D1 UNEXPECTED policy: ' || pn.tablename || '.' || pn.policyname
         || ' -> ' || pn.helper_name,
       'qual+with_check = ' || left(pn.expr, 900),
       '*** FAIL — A5 MATERIALISED. This policy exists in NO migration file. Q1 is invalidated for ' || pn.helper_name || '. Resolve before applying migration 209. ***'
FROM prod_named pn
LEFT JOIN repo_pol r
  ON lower(r.tablename)  = lower(pn.tablename)
 AND lower(r.policyname) = lower(pn.policyname)
 AND r.helper_name       = pn.helper_name
WHERE r.helper_name IS NULL

UNION ALL
-- D2 — MISSING. A policy the repo expects that production does not have.
-- Something was dropped out of band, or a migration never applied.
SELECT 430 + row_number() OVER (ORDER BY r.tablename, r.policyname, r.helper_name),
       'D2 MISSING policy: ' || r.tablename || '.' || r.policyname || ' -> ' || r.helper_name,
       'the migration corpus produces this policy; production has no policy of that name on that table naming that helper',
       '*** FAIL — expected policy absent from production. A read this policy gates is either wide open or default-deny. ***'
FROM repo_pol r
LEFT JOIN prod_named pn
  ON lower(pn.tablename)  = lower(r.tablename)
 AND lower(pn.policyname) = lower(r.policyname)
 AND pn.helper_name       = r.helper_name
WHERE pn.helper_name IS NULL

UNION ALL
-- D3 — MATCHED. The positive control. Without it, a join that matched NOTHING
-- would emit zero UNEXPECTED rows, zero MISSING rows, and read as a clean bill
-- of health while proving nothing at all.
SELECT 470,
       'D3 MATCHED (positive control — proves the join does work)',
       'repo tuples=' || (SELECT count(*) FROM repo_pol)
         || '  production (policy,helper) pairs=' || (SELECT count(*) FROM prod_named)
         || '  matched=' || (SELECT count(*) FROM repo_pol r JOIN prod_named pn
                               ON lower(pn.tablename) = lower(r.tablename)
                              AND lower(pn.policyname) = lower(r.policyname)
                              AND pn.helper_name = r.helper_name),
       CASE WHEN (SELECT count(*) FROM repo_pol r JOIN prod_named pn
                    ON lower(pn.tablename) = lower(r.tablename)
                   AND lower(pn.policyname) = lower(r.policyname)
                   AND pn.helper_name = r.helper_name) = 0
            THEN '*** FAIL — ZERO MATCHES. The diff is VACUOUS; D1 and D2 mean nothing. Check that pg_policies is readable to this session. ***'
            WHEN (SELECT count(*) FROM repo_pol) = 44
                 AND (SELECT count(*) FROM repo_pol r JOIN prod_named pn
                        ON lower(pn.tablename) = lower(r.tablename)
                       AND lower(pn.policyname) = lower(r.policyname)
                       AND pn.helper_name = r.helper_name) = 44
            THEN 'PASS — all 44 migration-derived tuples matched a production policy'
            ELSE 'PARTIAL — the join works, but the counts differ. Read D1 and D2 rows.' END

UNION ALL
-- D4 — THE ASSUMPTION-FREE VERSION OF THE Q1 FINDING.
--
-- For every in-scope helper call inside a production policy, the identity
-- argument read out of PRODUCTION TEXT must be auth.uid(). This does not
-- consult the repo at all: the argument list is extracted from the deparsed
-- qual by a balanced-paren scan, split on top-level commas only, and the
-- argument at that helper's documented identity index is compared.
--
-- If a single row here reads FAIL, migration 209's bind CHANGES that policy's
-- answer, and this phase's central claim — "no policy has to be edited" — is
-- false for that policy.
SELECT 480 + row_number() OVER (ORDER BY tablename, policyname, helper_name, argstart),
       'D4 identity argument in PRODUCTION qual: ' || tablename || '.' || policyname
         || ' -> ' || helper_name,
       'identity argument = ' || coalesce(nullif(argtext, ''), '(empty)'),
       CASE WHEN is_auth_uid
            THEN 'PASS — production text passes the caller''s own auth.uid() at the identity position'
            ELSE '*** FAIL — production passes something other than auth.uid() here. Migration 209''s bind WILL CHANGE THIS POLICY''S ANSWER. Do not apply 209 until this is resolved. ***' END
FROM ident_arg

UNION ALL
-- D4b — anti-vacuity for D4. The extraction is a multi-stage character scan;
-- if it silently matched nothing, D4 would emit zero rows and the reader would
-- see no failures. Expect one row per (policy, helper, call) — 48 call sites
-- across 44 policies in the migration corpus, so at least 44.
SELECT 540,
       'D4b identity-argument extraction anti-vacuity',
       'identity arguments extracted=' || (SELECT count(*) FROM ident_arg)
         || '  of which auth.uid()=' || (SELECT count(*) FROM ident_arg WHERE is_auth_uid)
         || '  (migration corpus has 48 call sites in 44 policies)',
       CASE WHEN (SELECT count(*) FROM ident_arg) = 0
            THEN '*** FAIL — the extraction produced NOTHING. D4 is vacuous. ***'
            WHEN (SELECT count(*) FROM ident_arg) < 40
            THEN '*** FAIL — extraction produced far fewer arguments than the corpus contains; the scan is under-reporting. ***'
            ELSE 'PASS — the extraction produced arguments to test' END

-- ══════════════════════════════════════════════════════════════════════════
-- E — FUNCTION-BODY CALLERS. PITFALL 5, RESEARCH ASSUMPTION A7.
--
-- READ THIS BLOCK BEFORE THE DROP IS APPLIED. It is a PRE-RUN GATE.
--
-- If E2 shows ANY body caller of `workspace_roster_relationship_is_live`:
-- DO NOT APPLY MIGRATION 208's DROP. Use the revoke fallback documented
-- verbatim in that migration's header instead. The drop would succeed
-- cleanly — PostgreSQL cannot see a reference inside a string-literal body —
-- and the caller would raise `42883 function does not exist` on its next live
-- invocation. That is migration 198's failure shape exactly: green suite,
-- clean apply, first live call raises.
-- ══════════════════════════════════════════════════════════════════════════

UNION ALL
-- E1 — every (Tier-1 helper, calling function) pair. INFO: the three revoked
-- functions are EXPECTED to have body callers — that is precisely why revoking
-- them is safe (a definer body runs as the function OWNER and needs no EXECUTE
-- grant from the caller). Research counted 11, 2 and 1 respectively.
SELECT 550 + row_number() OVER (ORDER BY helper, caller),
       'E1 body caller (INFO): ' || helper || ' <- ' || caller || '(' || caller_args || ')',
       'reference found in pg_proc.prosrc; note prosrc includes comments, so a mention in a comment counts here',
       'INFO — for the three REVOKED helpers this is expected and is why the revoke is safe (definer bodies run as the OWNER). For workspace_roster_relationship_is_live it is a BLOCKER — see E2.'
FROM bodycaller

UNION ALL
-- E2 — THE GATE.
SELECT 590,
       'E2 GATE: body callers of workspace_roster_relationship_is_live',
       coalesce((SELECT string_agg(caller || '(' || caller_args || ')', ', ' ORDER BY caller)
                   FROM bodycaller WHERE helper = 'workspace_roster_relationship_is_live'),
                '(none)'),
       CASE WHEN EXISTS (SELECT 1 FROM bodycaller WHERE helper = 'workspace_roster_relationship_is_live')
            THEN '*** FAIL — DO NOT APPLY THE DROP. A string-literal function body references this helper. PostgreSQL records no dependency for that, so the drop would succeed and raise 42883 on the next live call. Use the revoke fallback in migration 208''s header. ***'
            ELSE 'PASS — zero body callers; assumption A7 holds and the drop is safe' END

UNION ALL
-- E3 — anti-vacuity for E. If the prosrc scan matched nothing at all, E2 would
-- pass because it read nothing rather than because the helper is dead.
SELECT 591,
       'E3 body-caller scan anti-vacuity',
       'total (helper, caller) pairs found across all four Tier-1 names = '
         || (SELECT count(*) FROM bodycaller),
       CASE WHEN (SELECT count(*) FROM bodycaller) = 0
            THEN '*** FAIL — the prosrc scan found NOTHING for any of the four. Research counted 11 + 2 + 1 body callers. E2 is vacuous. ***'
            ELSE 'PASS — the scan found callers, so E2''s zero is measured rather than empty' END

-- ══════════════════════════════════════════════════════════════════════════
-- F — ENVIRONMENT RECORD. INFO ONLY, NO VERDICTS.
-- ══════════════════════════════════════════════════════════════════════════

UNION ALL
-- F1 — PostgREST exposed schemas. Plans 04-06 (the `no_block` relocation to a
-- non-exposed schema, owner decision D4) depend on this value: relocation is
-- only a control if the destination schema is genuinely not exposed.
SELECT 600,
       'F1 PostgREST exposed schemas (INFO)',
       'pgrst.db_schemas = ' || coalesce(current_setting('pgrst.db_schemas', true), '(NULL — not visible at the database level)'),
       'INFO — OWNER ACTION: also record the value shown in the Supabase dashboard under API settings -> Exposed schemas, and paste it into the verification record. The database-level setting is frequently NULL because PostgREST is configured out of band; the dashboard value is authoritative. Plans 04-06 depend on it.'

UNION ALL
-- F2 — the leftover harness table from 38.0.1 and 38.0.2. A table in `public`
-- with no RLS is a PostgREST-readable table, which is the same class of defect
-- this phase exists to close. This file REPORTS it and does not drop it:
-- dropping is the owner's action, tracked at
-- .planning/todos/pending/2026-09-08-drop-zz-verify-b-results-public-table.md
SELECT 601,
       'F2 leftover public.zz_verify_b_results (INFO)',
       coalesce(
         (SELECT 'EXISTS  rls_enabled=' || c.relrowsecurity
                 || '  rows=' || coalesce(c.reltuples::bigint::text, '?')
                 || '  grants: ' || coalesce(
                      (SELECT string_agg(g.grantee || ':' || g.privilege_type, ', ')
                         FROM information_schema.role_table_grants g
                        WHERE g.table_schema = 'public' AND g.table_name = 'zz_verify_b_results'
                          AND g.grantee IN ('anon','authenticated','service_role','PUBLIC')),
                      '(none to anon/authenticated/service_role/PUBLIC)')
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'zz_verify_b_results'),
         'ABSENT — already dropped, nothing to do'),
       'INFO — OWNER ACTION if it EXISTS: drop it. Left behind by the 38.0.1/38.0.2 harnesses with no RLS and no revoke. This phase''s Part B uses a TEMP table and does not add another.'

UNION ALL
-- F3 — population report for the tables Part B reads.
--
-- THIS IS A REPORT, NOT A PRECONDITION. It is the deliberate inverse of
-- 38.0.1's and 38.0.2's P-block, which ABORTED Part B if the workspace tables
-- were non-empty because those harnesses SEEDED FIXTURES. This phase's Part B
-- seeds nothing and writes nothing, so it has no such guard — and it PREFERS
-- these tables non-empty, because real rows are what make its positive
-- controls mean anything. A zero here does not stop Part B; it tells you in
-- advance which of its assertions will record INFO for want of a subject.
SELECT 610 + row_number() OVER (ORDER BY t),
       'F3 population for Part B (INFO): ' || t,
       n || ' row(s)',
       CASE WHEN n = 0
            THEN 'INFO — EMPTY. Part B will skip the assertions that need a subject from this table and record INFO rows instead of inventing an id. It will still run.'
            ELSE 'INFO — populated; Part B''s positive controls on this table will be meaningful' END
FROM (
  SELECT 'user_profiles'         AS t, count(*) AS n FROM public.user_profiles
  UNION ALL SELECT 'green_room_posts',        count(*) FROM public.green_room_posts
  UNION ALL SELECT 'green_room_comments',     count(*) FROM public.green_room_comments
  UNION ALL SELECT 'split_sheets',            count(*) FROM public.split_sheets
  UNION ALL SELECT 'split_sheet_parties',     count(*) FROM public.split_sheet_parties
  UNION ALL SELECT 'blocks',                  count(*) FROM public.blocks
  UNION ALL SELECT 'release_comments',        count(*) FROM public.release_comments
  -- The workspace tables are here for one reason: carry-forward W1. While D-56
  -- is off they are empty, and that is WHY Part B rows B5/B6 cannot prove the
  -- bind on `workspace_member_role` — its self-call returns NULL for lack of
  -- data, not for lack of authorisation, so there is no positive control.
  -- Once these read non-zero, B5/B6 MUST be re-run.
  UNION ALL SELECT 'workspaces        (W1)',  count(*) FROM public.workspaces
  UNION ALL SELECT 'workspace_members (W1)',  count(*) FROM public.workspace_members
) pop

UNION ALL
-- F4 — the D-56 kill switch. REPORTED, NEVER TOUCHED.
SELECT 640,
       'F4 D-56 workspace access kill switch (INFO)',
       'enabled = ' || coalesce((SELECT enabled::text FROM public.workspace_access_config LIMIT 1), '(no row)'),
       'INFO — this file does not flip it and neither does Part B. If this reads TRUE, carry-forward W1 is live: re-run Part B rows B5/B6 to prove the workspace_member_role bind behaviourally BEFORE beta traffic.'

ORDER BY 1;

-- ============================================================
-- END OF PART A.
--
-- OWNER, IN THIS ORDER:
--   1. Run this file. Save the output. This is the PRE-RUN.
--   2. Clear the three gates: E2 (zero body callers), C1 (no event trigger
--      grants), D1 (no UNEXPECTED policy). Any one of them failing STOPS the
--      phase — none of the three is a "fix it later" item.
--   3. Note that A1, A2, A4 and every B1 row will read FAIL in the pre-run.
--      THAT IS THE EVIDENCE THE DISCLOSURE EXISTED. It cannot be recovered
--      once the revokes land.
--   4. Apply migration 208, then migration 209, in that order, together.
--      Do not split 209 — a partial rollout makes an outer helper return a
--      confident wrong answer silently rather than raise.
--      If the DROP in 208 refuses with 2BP01: STOP, paste the DETAIL line into
--      the 38.0.3-01-SUMMARY, and use the revoke fallback in 208's header.
--   5. Run this file again. Every verdict must read PASS. A4 must read 49.
--   6. Run Part B as ONE paste.
--   7. Fire one curl at the PostgREST RPC route for `workspace_member_role`
--      with the anon key and record the HTTP status (see Part B's header).
--   8. Only then start plans 04-06 (the `no_block` relocation, migration 210).
-- ============================================================
