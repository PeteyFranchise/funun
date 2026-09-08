-- ============================================================
-- Phase 38.0.2 — VERIFICATION PART A: STRUCTURAL
--
-- ONE query, ONE result table. Paste into the Supabase SQL editor
-- and run against PRODUCTION.
--
-- 100% READ-ONLY. There is no INSERT, UPDATE, DELETE, TRUNCATE,
-- ALTER, DROP, CREATE, GRANT or REVOKE anywhere in this file. It
-- does not seed. It does not tear down. It does not touch the D-56
-- kill switch — it only reports its state.
--
-- ─── WHAT THIS FILE CAN AND CANNOT PROVE ──────────────────────
-- IT PROVES SHAPE, NOT BEHAVIOUR. Every row below is a reading of
-- the catalogue: this function exists, this trigger is attached,
-- this policy no longer names that column. None of it is an
-- observation of the database doing anything.
--
-- That distinction is load-bearing here, and it is not theoretical.
-- Migration 190's text-lock suite was green, its function existed,
-- and the route called it correctly — and custody transfer was
-- still broken in production for a day, because migration 139's
-- differently-named `guard_owner_immutable` also fires on
-- `vault_projects` and refused the sanctioned RPC. A structural
-- probe of migration 190 would have reported PASS on every row.
--
-- Behaviour is Part B's job:
--   .planning/phases/38.0.2-workspace-transactional-integrity-hygiene/
--     38.0.2-VERIFY-B-PRODUCTION-SINGLE.sql
--
-- ─── RUN ORDER ────────────────────────────────────────────────
-- Run THIS file first. Read the P-block (population) before
-- running Part B: Part B seeds fixtures into these tables and
-- refuses to run if `workspace_members` is not empty. If ANY of
-- the eleven tables in the P-block is non-zero, STOP and decide
-- deliberately — WSR-19's PII fix and WSR-26's revoke both assume
-- `workspace_audit_log` and `workspace_invitations` are empty, and
-- 38.0.1's check A9 counted neither.
--
-- ─── PRECONDITION ─────────────────────────────────────────────
-- This file assumes migrations 197 AND 198 are applied (they were,
-- on 2026-09-07). A `relation ... does not exist` or
-- `function ... does not exist` error is itself the finding: the
-- migration did not apply. Nothing here is wrapped in to_regclass,
-- deliberately — a silent NULL would be a worse answer than a loud
-- error.
--
-- Read the `verdict` column. Anything containing FAIL is a finding.
-- Rows marked INFO are informational, not pass/fail.
-- ============================================================

WITH
-- The eight RPCs migration 198 defines. Named as a list rather than
-- matched by prefix so a function that goes MISSING is visible as an
-- absent row against a known count, not merely as one fewer row.
rpc198 AS (
  SELECT unnest(ARRAY[
    'workspace_create',
    'workspace_change_member_role_or_status',
    'workspace_nominate_owner',
    'workspace_respond_ownership_nomination',
    'workspace_redeem_invitation',
    'workspace_transition_roster_relationship',
    'workspace_accept_custody_transfer',
    'workspace_revoke_invitation'
  ]) AS proname
),
-- The three readers and the one gate function migration 197 defines.
fns197 AS (
  SELECT unnest(ARRAY[
    'workspace_project_permission',
    'workspace_roster_page',
    'workspace_audit_page',
    'workspace_access_permitted'
  ]) AS proname
),
wpp AS (
  SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'workspace_project_permission'
  LIMIT 1
),
floorfn AS (
  SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'guard_workspace_never_zero_owners'
  LIMIT 1
),
pol AS (
  SELECT policyname, permissive, cmd,
         coalesce(qual, '') AS qual,
         coalesce(with_check, '') AS wc
  FROM pg_policies WHERE schemaname = 'public'
)

-- ══ P — POPULATION. THE 38.0.1 A9 GAP, CLOSED. ═══════════════════════════
-- 38.0.1's check A9 counted FIVE tables: grants, attachments, members,
-- roster_relationships, permission_requests. Its narrative said "every
-- workspace table is still empty", which is a broader claim than the check
-- made. It did NOT count `workspace_audit_log` or `workspace_invitations`,
-- and BOTH of this phase's assumptions rest on them:
--
--   * WSR-19 (no restricted PII in the broadly readable `changes` JSON)
--     assumes no pre-existing audit row already carries an invitation email.
--     If the table is non-empty, the PII fix needs a remediation pass over
--     existing rows, not only a forward-looking write rule.
--   * WSR-26 (the audit lockdown) becomes IRREVERSIBLE over existing rows:
--     after migration 197 applies, nothing short of disabling the triggers
--     can delete an audit row.
--
-- THIS BLOCK GATES PART B. Part B seeds into every one of these tables and
-- deletes its fixtures by workspace id at the end. A non-zero count here
-- means live data exists and the harness must not be run.
SELECT 1 AS ord, 'P population (gates Part B)' AS check_name, t AS detail,
       CASE WHEN n = 0 THEN 'PASS — empty'
            ELSE '*** NOT EMPTY — ' || n || ' row(s); DO NOT RUN PART B ***' END AS verdict
FROM (
  SELECT 'workspace_grants'               AS t, count(*) AS n FROM public.workspace_grants
  UNION ALL SELECT 'workspace_attachments',          count(*) FROM public.workspace_attachments
  UNION ALL SELECT 'workspace_members',              count(*) FROM public.workspace_members
  UNION ALL SELECT 'workspace_roster_relationships', count(*) FROM public.workspace_roster_relationships
  UNION ALL SELECT 'workspace_permission_requests',  count(*) FROM public.workspace_permission_requests
  -- The two A9 did not count:
  UNION ALL SELECT 'workspace_audit_log  (A9 GAP)',  count(*) FROM public.workspace_audit_log
  UNION ALL SELECT 'workspace_invitations (A9 GAP)', count(*) FROM public.workspace_invitations
  -- The two migration 197 introduces:
  UNION ALL SELECT 'workspace_ownership_transfers',  count(*) FROM public.workspace_ownership_transfers
  UNION ALL SELECT 'workspace_cohorts',              count(*) FROM public.workspace_cohorts
  -- Two more Part B writes into, counted for the same reason:
  UNION ALL SELECT 'workspace_roster_blocks',        count(*) FROM public.workspace_roster_blocks
  UNION ALL SELECT 'workspace_custody_transfers',    count(*) FROM public.workspace_custody_transfers
  UNION ALL SELECT 'workspaces',                     count(*) FROM public.workspaces
) pop

UNION ALL
-- ══ A1 — WSR-26 / S1. THE PERMANENT AUDIT-PRIVILEGE PROBE. ═══════════════
-- 38.0.1 check A10 found, on production, that `service_role` held TRUNCATE,
-- DELETE and UPDATE on `workspace_audit_log`. Migration 182 line 251 had
-- issued `REVOKE ... FROM PUBLIC` and claimed that made the table
-- append-only "for every role". It removed nothing from service_role:
-- Supabase's bootstrap `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO
-- postgres, anon, authenticated, service_role` is a DIRECT grant, and a
-- REVOKE from PUBLIC never touches a direct grant.
--
-- THIS PROBE IS PERMANENT, not a one-off. It stays in this phase's
-- verification so that a future Supabase platform change, a new
-- ALTER DEFAULT PRIVILEGES, or an incautious migration that re-grants is
-- DETECTED rather than assumed away.
--
-- SCOPED TO THE APPLICATION ROLES, AND HERE IS WHY — this differs from the
-- plan text, which said "expected: zero rows" unscoped. Migration 197 layer
-- 1 revokes from PUBLIC, anon, authenticated and service_role. It does NOT
-- revoke from `postgres`, and could not usefully: postgres owns the table.
-- An unscoped probe would therefore report postgres's own grants forever and
-- read as a permanent FAIL. What binds postgres is LAYER 2 — the two
-- triggers, checked at A2 below — never the privileges. Row A1b prints the
-- unscoped list as INFO so nothing is hidden by the scoping.
SELECT 2, 'A1 WSR-26 audit write grants (application roles)',
       coalesce(string_agg(grantee || ':' || privilege_type, ', '), '(none)'),
       CASE WHEN count(*) = 0 THEN 'PASS — no UPDATE/DELETE/TRUNCATE to anon, authenticated, service_role or PUBLIC'
            ELSE '*** FAIL — AUDIT LOG IS NOT APPEND-ONLY TO AN APPLICATION ROLE ***' END
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'workspace_audit_log'
  AND privilege_type IN ('UPDATE','DELETE','TRUNCATE')
  AND grantee IN ('anon','authenticated','service_role','PUBLIC')

UNION ALL
SELECT 3, 'A1b audit write grants, UNSCOPED (INFO)',
       coalesce(string_agg(grantee || ':' || privilege_type, ', '), '(none)'),
       'INFO — postgres owns the table; layer 2 (the triggers at A2) is what binds it, never a REVOKE'
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'workspace_audit_log'
  AND privilege_type IN ('UPDATE','DELETE','TRUNCATE')

UNION ALL
-- ══ A2 — WSR-26 LAYER 2. THE TWO APPEND-ONLY TRIGGERS. ═══════════════════
-- The row trigger and the statement trigger are NOT duplicates, and swapping
-- their levels silently reopens the hole: a row-level trigger DOES NOT FIRE
-- FOR TRUNCATE (there are no rows to fire per), so TRUNCATE needs its own
-- FOR EACH STATEMENT trigger or it walks straight past the other one.
-- TRUNCATE was also the one privilege check A10 found on service_role that
-- migration 182's REVOKE never even named.
--
-- tgtype bit meanings (see src/include/catalog/pg_trigger.h):
--   1 = ROW  2 = BEFORE  4 = INSERT  8 = DELETE  16 = UPDATE  32 = TRUNCATE
SELECT 4, 'A2 WSR-26 append-only triggers', t.tgname || ' (tgtype=' || t.tgtype || ')',
       CASE
         WHEN t.tgname = 'guard_workspace_audit_log_no_row_change'
              AND (t.tgtype::int & 1) = 1        -- FOR EACH ROW
              AND (t.tgtype::int & 2) = 2        -- BEFORE
              AND (t.tgtype::int & 8) = 8        -- DELETE
              AND (t.tgtype::int & 16) = 16      -- UPDATE
              AND t.tgenabled <> 'D'
           THEN 'PASS — BEFORE UPDATE OR DELETE, row-level, enabled'
         WHEN t.tgname = 'guard_workspace_audit_log_no_truncate'
              AND (t.tgtype::int & 1) = 0        -- FOR EACH STATEMENT
              AND (t.tgtype::int & 2) = 2        -- BEFORE
              AND (t.tgtype::int & 32) = 32      -- TRUNCATE
              AND t.tgenabled <> 'D'
           THEN 'PASS — BEFORE TRUNCATE, statement-level, enabled'
         ELSE '*** FAIL — wrong level, wrong events, or disabled ***'
       END
FROM pg_trigger t
WHERE t.tgrelid = 'public.workspace_audit_log'::regclass AND NOT t.tgisinternal
  AND t.tgname IN ('guard_workspace_audit_log_no_row_change',
                   'guard_workspace_audit_log_no_truncate')

UNION ALL
SELECT 5, 'A2b WSR-26 both triggers present', count(*)::text || ' of 2',
       CASE WHEN count(*) = 2 THEN 'PASS' ELSE '*** FAIL — a trigger is missing ***' END
FROM pg_trigger
WHERE tgrelid = 'public.workspace_audit_log'::regclass AND NOT tgisinternal
  AND tgname IN ('guard_workspace_audit_log_no_row_change',
                 'guard_workspace_audit_log_no_truncate')

UNION ALL
-- ══ A3 — WSR-19. THE RESTRICTED-PII WRITE GUARD. ═════════════════════════
-- BEFORE INSERT, row-level, and its body must use the RECURSIVE jsonpath
-- accessor. `changes ?| ARRAY[...]` inspects TOP-LEVEL KEYS ONLY, and this
-- codebase already writes nested before/after diffs that walk straight past
-- it. Checking for `$.**` here is checking that the recursion is real.
SELECT 6, 'A3 WSR-19 PII write guard', t.tgname,
       CASE WHEN (t.tgtype::int & 1) = 1 AND (t.tgtype::int & 2) = 2
             AND (t.tgtype::int & 4) = 4 AND t.tgenabled <> 'D'
            THEN 'PASS — BEFORE INSERT, row-level, enabled'
            ELSE '*** FAIL ***' END
FROM pg_trigger t
WHERE t.tgrelid = 'public.workspace_audit_log'::regclass AND NOT t.tgisinternal
  AND t.tgname = 'guard_workspace_audit_log_no_restricted_pii'

UNION ALL
SELECT 7, 'A3b WSR-19 guard is RECURSIVE, not top-level', 'jsonb_path_exists with $.** accessor',
       CASE WHEN pg_get_functiondef(p.oid) LIKE '%$.**%'
             AND pg_get_functiondef(p.oid) ILIKE '%jsonb_path_exists%'
            THEN 'PASS — nested keys are caught'
            ELSE '*** FAIL — a top-level-only test would miss {"before":{"email":...}} ***' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'guard_workspace_audit_log_no_restricted_pii'

UNION ALL
-- ══ A4 — WSR-13. THE FOUR DEFERRED CONSTRAINT TRIGGERS. ══════════════════
-- Each must be DEFERRABLE INITIALLY DEFERRED: the check has to run at
-- COMMIT, after both the mutation and the audit row exist, REGARDLESS of the
-- order they appear in the RPC body. An immediate trigger would force every
-- RPC to write its audit row before its mutation — fragile, and unstated
-- anywhere a future author would read it.
SELECT 8, 'A4 WSR-13 deferred audit assertions', c.relname || '.' || t.tgname,
       CASE WHEN t.tgdeferrable AND t.tginitdeferred AND t.tgenabled <> 'D'
            THEN 'PASS — DEFERRABLE INITIALLY DEFERRED, enabled'
            ELSE '*** FAIL — not deferred, or disabled ***' END
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal
  AND t.tgname IN ('assert_workspace_member_change_audited',
                   'assert_workspace_roster_relationship_change_audited',
                   'assert_workspace_invitation_change_audited',
                   'assert_workspace_custody_transfer_change_audited')

UNION ALL
SELECT 9, 'A4b WSR-13 all four present', count(*)::text || ' of 4',
       CASE WHEN count(*) = 4 THEN 'PASS' ELSE '*** FAIL — a consequential surface is unguarded ***' END
FROM pg_trigger t
WHERE NOT t.tgisinternal
  AND t.tgname IN ('assert_workspace_member_change_audited',
                   'assert_workspace_roster_relationship_change_audited',
                   'assert_workspace_invitation_change_audited',
                   'assert_workspace_custody_transfer_change_audited')

UNION ALL
-- ══ A4c — 198 §(i) LANDED, AND 197's UNCONDITIONAL FORM DID NOT SURVIVE. ═
-- Migration 197 creates the custody assertion UNCONDITIONALLY. Migration 198
-- section (i) DROPs and re-creates it under the same name with a
-- `WHEN (NEW.workspace_id IS NOT NULL)` clause, and 198 applies second, so
-- 198's scoped version is what the database carries.
--
-- WHY IT HAD TO BE RE-SCOPED. `workspace_audit_log.workspace_id` is NOT NULL
-- (migration 182) while `workspace_custody_transfers.workspace_id` is
-- NULLABLE (migration 185, deliberately). For a transfer with no workspace
-- NO audit row can be written at all, so the unconditional form demands a
-- row the schema makes impossible — every direct Member-to-Member custody
-- accept, decline and withdraw would abort at COMMIT.
--
-- IF THIS ROW REPORTS FAIL, 198 DID NOT LAND, or landed before 197. Part B's
-- custody-without-a-workspace assertion is the behavioural half of this.
SELECT 10, 'A4c 198 s(i) re-scope of the custody assertion',
       CASE WHEN pg_get_triggerdef(t.oid) ILIKE '%WHEN%workspace_id IS NOT NULL%'
            THEN 'WHEN (new.workspace_id IS NOT NULL) present'
            ELSE 'NO WHEN CLAUSE — this is 197''s unconditional form' END,
       CASE WHEN pg_get_triggerdef(t.oid) ILIKE '%WHEN%workspace_id IS NOT NULL%'
            THEN 'PASS — 198 applied after 197'
            ELSE '*** FAIL — every non-workspace custody resolution will abort at COMMIT ***' END
FROM pg_trigger t
WHERE t.tgrelid = 'public.workspace_custody_transfers'::regclass AND NOT t.tgisinternal
  AND t.tgname = 'assert_workspace_custody_transfer_change_audited'

UNION ALL
-- ══ A5 — WSR-07. THE OWNER-ROLE GUARD. ═══════════════════════════════════
-- BEFORE INSERT OR UPDATE, row-level, on workspace_members. The INSERT
-- branch is not optional: it is what makes a client-side owner INSERT
-- impossible, and it is also why WSR-23's atomic-create RPC is a
-- PREREQUISITE — without a postgres-owned definer creator, this trigger
-- makes workspace creation impossible.
--
-- The trigger NAME differs from the function name deliberately:
-- 'guard_workspace_member_owner_role_change' sorts before
-- 'guard_workspace_never_zero_owners' ('m' < 'n'), and same-event BEFORE ROW
-- triggers fire in name order, so an unauthorized caller sees the AUTHORITY
-- refusal rather than the floor refusal.
SELECT 11, 'A5 WSR-07 owner-role guard', t.tgname,
       CASE WHEN (t.tgtype::int & 1) = 1 AND (t.tgtype::int & 2) = 2
             AND (t.tgtype::int & 4) = 4 AND (t.tgtype::int & 16) = 16
             AND t.tgenabled <> 'D'
            THEN 'PASS — BEFORE INSERT OR UPDATE, row-level, enabled'
            ELSE '*** FAIL ***' END
FROM pg_trigger t
WHERE t.tgrelid = 'public.workspace_members'::regclass AND NOT t.tgisinternal
  AND t.tgname = 'guard_workspace_member_owner_role_change'

UNION ALL
SELECT 12, 'A5b WSR-07 trigger fires before the floor guard',
       coalesce((SELECT string_agg(tgname, ' -> ' ORDER BY tgname)
                 FROM pg_trigger
                 WHERE tgrelid = 'public.workspace_members'::regclass
                   AND NOT tgisinternal), '(none)'),
       CASE WHEN 'guard_workspace_member_owner_role_change' <
                 'guard_workspace_never_zero_owners'
            THEN 'INFO — authority refusal is reported before the floor refusal (name order)'
            ELSE 'INFO' END

UNION ALL
-- ══ A6 — R-28 / WSR-11. THE OWNER FLOOR NOW HONOURS expires_at. ══════════
-- Before migration 197 the floor counted an owner whose seat had EXPIRED as
-- live, while migration 192's workspace_member_role() treated the same seat
-- as no membership at all — two definitions of live membership, one of them
-- wrong. That is the WSR-17 class of drift, in the one place that decides
-- whether a workspace can be left with no reachable owner.
SELECT 13, 'A6 R-28 owner floor honours expires_at', 'guard_workspace_never_zero_owners',
       CASE WHEN (SELECT def FROM floorfn) ILIKE '%expires_at%'
            THEN 'PASS — expires_at appears in the floor body'
            ELSE '*** FAIL — an expired owner still satisfies the floor ***' END

UNION ALL
-- ══ A7 — WSR-29 / R-20. THE ROLE FLOOR ON PROJECT ACCESS. ════════════════
-- One extra conjunct on hop 2's workspace_members join. That is the single
-- chokepoint: the four workspace_read_* functions all call this helper, so
-- the floor propagates to every child-table read without touching them.
--
-- Reported as TWO facts because they fail differently: the four permitted
-- roles must be NAMED, and `guest` must NOT appear. A definition that named
-- guest in a different clause would still be a finding.
SELECT 14, 'A7 WSR-29 role floor names the four permitted roles',
       'owner / admin / member / contractor',
       CASE WHEN (SELECT def FROM wpp) ILIKE '%''owner''%'
             AND (SELECT def FROM wpp) ILIKE '%''admin''%'
             AND (SELECT def FROM wpp) ILIKE '%''member''%'
             AND (SELECT def FROM wpp) ILIKE '%''contractor''%'
             AND (SELECT def FROM wpp) ILIKE '%m.role IN %'
            THEN 'PASS' ELSE '*** FAIL — hop 2 has no role conjunct ***' END

UNION ALL
SELECT 15, 'A7b WSR-29 guest is not named anywhere in the helper', 'workspace_project_permission',
       CASE WHEN (SELECT def FROM wpp) ILIKE '%guest%'
            THEN '*** FAIL — guest appears in the definition ***'
            ELSE 'PASS — guest is excluded by omission' END

UNION ALL
SELECT 16, 'A7c WSR-29 the rest of the chain is intact', 'kill switch / custody bind / lineage',
       CASE WHEN (SELECT def FROM wpp) ILIKE '%workspace_access_enabled%'
             AND (SELECT def FROM wpp) ILIKE '%vault_projects%'
             AND (SELECT def FROM wpp) ILIKE '%member_user_id%'
             AND (SELECT def FROM wpp) ILIKE '%workspace_grant_lineage_live%'
            THEN 'PASS — v3 kept everything v2 had'
            ELSE '*** FAIL — a hop was lost in the rewrite ***' END

UNION ALL
-- ══ A8 — WSR-18 / R-12 / R-23. THE ROSTER SELECT POLICY, NARROWED. ═══════
-- The workspace-facing branches are GONE from the raw table entirely. Plan
-- 09 first proposed hiding `blocked` rows from the owner/admin branches; the
-- owner escalated it, because if `blocked` rows vanish while `refused` rows
-- stay visible, ABSENCE BECOMES THE SIGNAL — an owner who proposed and now
-- sees nothing learns the same fact. The whole workspace-side read moves to
-- workspace_roster_page, which can redact a COLUMN; a policy cannot.
SELECT 17, 'A8 WSR-18 roster policy has no unqualified member-role branch',
       'workspace_roster_relationships_select',
       CASE WHEN p.qual ILIKE '%is_workspace_owner%'
            THEN '*** FAIL — the owner branch survives; R-23 is reopened ***'
            WHEN p.qual ILIKE '%''admin''%'
            THEN '*** FAIL — the admin branch survives; R-23 is reopened ***'
            WHEN p.qual ILIKE '%member_user_id%'
             AND p.qual ILIKE '%accepted%'
             AND p.qual ILIKE '%ended%'
            THEN 'PASS — named Member, plus settled accepted/ended rows only'
            ELSE '*** FAIL — unrecognised qualifier; read it by hand ***' END
FROM pol p WHERE p.policyname = 'workspace_roster_relationships_select'

UNION ALL
SELECT 18, 'A8b R-23 the collapsing reader exists', 'workspace_roster_page',
       CASE WHEN pg_get_functiondef(pr.oid) ILIKE '%''blocked''%'
             AND pg_get_functiondef(pr.oid) ILIKE '%''refused''%'
            THEN 'PASS — blocked collapses to refused in the workspace-facing read'
            ELSE '*** FAIL — no collapse; the workspace can distinguish a block from a decline ***' END
FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
WHERE n.nspname = 'public' AND pr.proname = 'workspace_roster_page'

UNION ALL
-- ══ A9 — WSR-23 / R-15. THE created_by FALLBACK IS GONE. ═════════════════
-- The fallback made a workspace visible to whoever created it, live seat or
-- not. WSR-23's atomic-create RPC is what makes it unnecessary: creation now
-- seats the owner in the same transaction, so there is no window in which a
-- creator has no membership row.
SELECT 19, 'A9 WSR-23 no created_by visibility fallback', 'workspaces_select_member',
       CASE WHEN p.qual ILIKE '%created_by%'
            THEN '*** FAIL — the creator fallback survives ***'
            WHEN p.qual ILIKE '%workspace_member_role%'
            THEN 'PASS — live membership only'
            ELSE '*** FAIL — unrecognised qualifier; read it by hand ***' END
FROM pol p WHERE p.policyname = 'workspaces_select_member'

UNION ALL
-- ══ A10 — WSR-19 / R-27. THE AUDIT SELECT POLICY, NARROWED. ══════════════
-- D-50's intent (a workspace can audit itself) is preserved; only the
-- mechanism changes. Ordinary members reach the trail through the REDACTED
-- definer reader instead of the raw table.
SELECT 20, 'A10 WSR-19 audit policy narrowed to actor/subject/owner/admin',
       'workspace_audit_log_select',
       CASE WHEN p.qual ILIKE '%actor_user_id%'
             AND p.qual ILIKE '%subject_member_id%'
             AND p.qual ILIKE '%owner%'
             AND p.qual ILIKE '%admin%'
            THEN 'PASS'
            ELSE '*** FAIL — an unqualified member-role branch may survive; read the qualifier ***' END
FROM pol p WHERE p.policyname = 'workspace_audit_log_select'

UNION ALL
-- ══ A10b — WSR-26 LAYER 3. THE TWO RESTRICTIVE POLICIES. ═════════════════
-- NAME CORRECTION, RECORDED RATHER THAN SILENTLY FIXED. The plan for this
-- file asked for a single policy named `workspace_audit_log_no_mutation`.
-- No such policy exists and none should: migration 197 deliberately ships
-- TWO command-scoped policies instead, because a single
-- `AS RESTRICTIVE FOR ALL ... USING (false)` covers SELECT as well, and a
-- restrictive policy is AND-ed with the permissive ones — it would have made
-- the table UNREADABLE to `authenticated`, silently destroying D-50's
-- both-sides read. It would also have passed testing, because the definer
-- reader runs as postgres. This probe names the two that exist.
--
-- LAYER 3 IS NOT THE ENFORCEMENT. It constrains `authenticated` and `anon`
-- and nobody else; service_role carries BYPASSRLS, so no policy binds it.
-- Forward-insurance only.
SELECT 21, 'A10b WSR-26 restrictive policies', p.policyname || ' (' || p.cmd || ', ' || p.permissive || ')',
       CASE WHEN upper(p.permissive) = 'RESTRICTIVE' THEN 'PASS'
            ELSE '*** FAIL — not restrictive ***' END
FROM pol p
WHERE p.policyname IN ('workspace_audit_log_no_update', 'workspace_audit_log_no_delete')

UNION ALL
SELECT 22, 'A10c WSR-26 both restrictive policies present', count(*)::text || ' of 2',
       CASE WHEN count(*) = 2 THEN 'PASS' ELSE '*** FAIL ***' END
FROM pol p
WHERE p.policyname IN ('workspace_audit_log_no_update', 'workspace_audit_log_no_delete')

UNION ALL
-- ══ A11 — THE RPC FAMILY: EXISTENCE, DEFINER, EMPTY search_path. ═════════
-- Migration 123's posture, not migration 046's. Postgres flattens
-- `SET search_path = ''` into proconfig as `search_path=""` — the empty
-- string, QUOTED, because search_path is a list-typed GUC — and older
-- servers may render it bare as `search_path=`. Both mean the same thing.
-- Accept either; anything else — a missing entry, or `search_path=public` —
-- means the function resolves unqualified names against a mutable path
-- inside a SECURITY DEFINER body. (Corrected 2026-09-08: the first version
-- of this check compared against `search_path=` alone and reported all 12
-- correctly-hardened functions as FAIL. The schema was right; the assertion
-- was wrong. Verified against the migration source and against the
-- known-good control `transfer_vault_project_custody` from migration 190.)
SELECT 23, 'A11 RPC family (198): definer + empty search_path',
       p.proname || ' [' || coalesce(array_to_string(p.proconfig, ','), '(no proconfig)') || ']',
       CASE WHEN NOT p.prosecdef THEN '*** FAIL — not SECURITY DEFINER ***'
            WHEN NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) cfg
                              WHERE cfg IN ('search_path=', 'search_path=""'))
              THEN '*** FAIL — search_path is not empty ***'
            ELSE 'PASS' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN rpc198 r ON r.proname = p.proname
WHERE n.nspname = 'public'

UNION ALL
SELECT 24, 'A11b RPC family (198): all eight present', count(DISTINCT p.proname)::text || ' of 8',
       CASE WHEN count(DISTINCT p.proname) = 8 THEN 'PASS'
            ELSE '*** FAIL — migration 198 did not fully apply ***' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN rpc198 r ON r.proname = p.proname
WHERE n.nspname = 'public'

UNION ALL
SELECT 25, 'A11c readers + gate (197): definer + empty search_path',
       p.proname || ' [' || coalesce(array_to_string(p.proconfig, ','), '(no proconfig)') || ']',
       CASE WHEN NOT p.prosecdef THEN '*** FAIL — not SECURITY DEFINER ***'
            WHEN NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) cfg
                              WHERE cfg IN ('search_path=', 'search_path=""'))
              THEN '*** FAIL — search_path is not empty ***'
            ELSE 'PASS' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN fns197 f ON f.proname = p.proname
WHERE n.nspname = 'public'

UNION ALL
SELECT 26, 'A11d readers + gate (197): all four present', count(DISTINCT p.proname)::text || ' of 4',
       CASE WHEN count(DISTINCT p.proname) = 4 THEN 'PASS'
            ELSE '*** FAIL — migration 197 did not fully apply ***' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN fns197 f ON f.proname = p.proname
WHERE n.nspname = 'public'

UNION ALL
-- ══ A12 — THE WRITE FAMILY IS UNREACHABLE FROM A SESSION CLIENT. ═════════
-- 38.0.1's check A11, applied to migration 198's eight. Every one of these
-- performs a consequential write with the actor's identity supplied as a
-- PARAMETER (R-21 Option A). A session client holding EXECUTE could name
-- any actor it liked, and every authority check inside would be decorative.
SELECT 27, 'A12 198 family: anon/authenticated EXECUTE', p.proname,
       CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
            THEN '*** FAIL — anon can execute a consequential write RPC ***'
            WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
            THEN '*** FAIL — authenticated can name any p_actor_id it likes ***'
            ELSE 'PASS — service_role only' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN rpc198 r ON r.proname = p.proname
WHERE n.nspname = 'public'

UNION ALL
-- ══ A12b — THE THREE GRANT POSTURES IN 197 DIFFER ON PURPOSE. ════════════
--   workspace_audit_page        -> authenticated. A client read.
--   workspace_roster_page       -> authenticated. A client read.
--   workspace_project_permission-> authenticated. Called from policies.
--   workspace_access_permitted  -> service_role ONLY, and NOT authenticated:
--        the membership of a bounded pilot is itself information a
--        non-cohort account should not have, and a definer function granted
--        to `authenticated` would hand every logged-in account a probe for
--        exactly that.
-- Do not "harmonise" the four. The difference is the design.
SELECT 28, 'A12b 197 grant postures (INFO, except the gate)', p.proname
       || ' — anon:' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
       || ' authenticated:' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text,
       CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
            THEN '*** FAIL — anon must reach none of these ***'
            WHEN p.proname = 'workspace_access_permitted'
                 AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
            THEN '*** FAIL — the cohort gate is a probe for pilot membership ***'
            ELSE 'PASS' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN fns197 f ON f.proname = p.proname
WHERE n.nspname = 'public'

UNION ALL
-- ══ A13 — WSR-16. THE COHORT TABLE IS DENY-BY-CONSTRUCTION. ══════════════
-- RLS enabled with ZERO policies plus REVOKE ALL: the table denies all
-- authenticated/anon access by construction. Adding a policy here later is a
-- decision, not a formality.
SELECT 29, 'A13 WSR-16 workspace_cohorts lockdown',
       'rls=' || c.relrowsecurity::text || ' policies=' ||
       (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='workspace_cohorts')::text,
       CASE WHEN c.relrowsecurity
             AND (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='workspace_cohorts') = 0
             AND NOT has_table_privilege('authenticated', c.oid, 'SELECT')
             AND NOT has_table_privilege('anon', c.oid, 'SELECT')
            THEN 'PASS — RLS on, no policy, no client SELECT'
            ELSE '*** FAIL — the pilot roster is reachable or policy-governed ***' END
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'workspace_cohorts'

UNION ALL
-- ══ A14 — THE D-56 KILL SWITCH. THE PHASE'S BINDING CONDITION. ═══════════
-- OFF since 2026-09-06 as CONTAINMENT, not caution: WSR-07 and WSR-08 needed
-- no grants to exploit — an admin could promote themselves to owner and
-- remove the real owner. It must remain OFF until this phase is signed off,
-- and turning it on is a separate, deliberate act that is NOT part of any
-- plan in this phase.
--
-- Part B turns it ON inside its own atomic block for about a second and
-- restores it OFF in the same transaction, with a result row proving it. If
-- this row reads ON outside a Part B run, something left it on — treat that
-- as an incident.
SELECT 30, 'A14 D-56 kill switch', 'enabled = ' || coalesce(enabled::text, 'NULL'),
       CASE WHEN enabled IS FALSE THEN 'PASS — correctly OFF'
            ELSE '*** FAIL — MUST BE OFF until 38.0.2 is signed off ***' END
FROM public.workspace_access_config

UNION ALL
-- ══ A15 — THE ONE OPEN RESEARCH QUESTION A QUERY CAN SETTLE. ═════════════
-- RESEARCH §17 item 3. This decides only how strongly migration 197's stated
-- limitation should be worded — "append-only to every APPLICATION role, not
-- immutable". It changes NO recommendation:
--
--   * If postgres is rolsuper, it can disable the triggers or set
--     session_replication_role = 'replica' and mutate freely. The limitation
--     is real and 197 already states it.
--   * If service_role carries rolbypassrls (it does, on Supabase), then
--     layer 3's restrictive policies bind it not at all, which is exactly
--     why layers 1 and 2 exist and why the policy half of S1 must never be
--     counted as the enforcement.
--
-- Recorded as INFO. There is no PASS/FAIL to have here — this is a fact
-- about the platform, not about this phase's work.
SELECT 31, 'A15 role attributes (INFO, RESEARCH s17.3)',
       rolname || ' — rolsuper=' || rolsuper::text || ' rolbypassrls=' || rolbypassrls::text,
       'INFO — settles only the WORDING of 197''s stated limitation, no recommendation changes'
FROM pg_roles WHERE rolname IN ('postgres', 'service_role', 'authenticated', 'anon')

ORDER BY ord, detail;
