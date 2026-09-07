-- ============================================================
-- Phase 38.0.1 — VERIFICATION PART A: STRUCTURAL
--
-- ONE query, ONE result table. Paste into the Supabase SQL editor
-- and run against PRODUCTION.
--
-- 100% READ-ONLY: no INSERT/UPDATE/DELETE/DDL/GRANT anywhere.
-- Does NOT need the D-56 kill switch on.
-- Does NOT need seeded data or test accounts.
--
-- Proves the migrations produced the objects they were reviewed as
-- producing. It cannot prove behaviour under a live grant — that is
-- Part B, which needs the kill switch on and seeded data.
--
-- Read the `verdict` column. Anything containing FAIL is a finding.
-- Rows marked INFO are informational, not pass/fail.
-- ============================================================

WITH read_fns AS (
  SELECT p.oid, p.proname,
         pg_get_functiondef(p.oid) AS def,
         pg_get_function_result(p.oid) AS res
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'workspace_read_%'
),
wpp AS (
  SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'workspace_project_permission'
  LIMIT 1
)

-- A1 — the p_uid caller bind (the read-impersonation fix)
SELECT 1 AS ord, 'A1 p_uid caller bind' AS check_name, proname AS detail,
       CASE WHEN def ILIKE '%p_uid = (select auth.uid()%'
            THEN 'PASS' ELSE '*** FAIL — MISSING CALLER BIND ***' END AS verdict
FROM read_fns

UNION ALL
-- A2 — declared column allowlist: forbidden names must not appear
SELECT 2, 'A2 allowlist (forbidden names)', proname,
       CASE WHEN res ~* '(audio_file_url|audio_file_size|lyrics|file_url|payload|claim_token|iswc|signed_by)'
            THEN '*** FAIL — FORBIDDEN COLUMN EXPOSED ***' ELSE 'PASS' END
FROM read_fns

UNION ALL
-- A2b — the declared columns themselves, for you to read
SELECT 3, 'A2b declared columns (read these)', proname, res FROM read_fns

UNION ALL
-- A3 — blast radius: the four child tables must name no workspace helper
SELECT 4, 'A3 blast radius (4 child tables)', 'tracks, vault_assets, vault_documents, tool_outputs',
       CASE WHEN count(*) = 0 THEN 'PASS — no workspace branch remains'
            ELSE '*** FAIL — ' || count(*) || ' policies still name a workspace helper ***' END
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('tracks','vault_assets','vault_documents','tool_outputs')
  AND (coalesce(qual,'') ILIKE '%workspace_project_permission%'
    OR coalesce(with_check,'') ILIKE '%workspace_project_permission%')

UNION ALL
-- A3b — vault_projects must still HAVE its narrowed workspace branch
SELECT 5, 'A3b vault_projects branch kept', count(*) || ' policies',
       CASE WHEN count(*) > 0 THEN 'PASS' ELSE '*** FAIL — branch missing ***' END
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'vault_projects'
  AND (coalesce(qual,'') ILIKE '%workspace_project_permission%'
    OR coalesce(with_check,'') ILIKE '%workspace_project_permission%')

UNION ALL
-- A4 — one canonical live-membership definition (expires_at)
SELECT 6, 'A4 expires_at in membership helper', p.proname,
       CASE WHEN pg_get_functiondef(p.oid) ILIKE '%expires_at%'
            THEN 'PASS' ELSE '*** FAIL — expires_at not checked ***' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('workspace_member_role','is_workspace_owner')

UNION ALL
-- A5 — the six hops inside workspace_project_permission
SELECT 7, 'A5 hops', 'kill switch conjunct',
       CASE WHEN (SELECT def FROM wpp) ILIKE '%workspace_access_enabled%' THEN 'PASS' ELSE '*** FAIL ***' END
UNION ALL
SELECT 8, 'A5 hops', 'custody binding (vault_projects + member_user_id)',
       CASE WHEN (SELECT def FROM wpp) ILIKE '%vault_projects%'
             AND (SELECT def FROM wpp) ILIKE '%member_user_id%' THEN 'PASS' ELSE '*** FAIL ***' END
UNION ALL
SELECT 9, 'A5 hops', 'lineage re-validation',
       CASE WHEN (SELECT def FROM wpp) ILIKE '%workspace_grant_lineage_live%' THEN 'PASS' ELSE '*** FAIL ***' END

UNION ALL
-- A6 — index backing the custody join
SELECT 10, 'A6 custody join index', coalesce(string_agg(indexname, ', '), '(none)'),
       CASE WHEN count(*) > 0 THEN 'PASS' ELSE '*** FAIL — join unindexed ***' END
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'vault_projects' AND indexdef ILIKE '%user_id%'

UNION ALL
-- A7 — custody immutability trigger present and enabled
SELECT 11, 'A7 custody immutability trigger', coalesce(string_agg(tgname, ', '), '(none)'),
       CASE WHEN count(*) FILTER (WHERE tgenabled <> 'D') > 0
            THEN 'PASS' ELSE '*** FAIL — missing or disabled ***' END
FROM pg_trigger
WHERE tgrelid = 'public.vault_projects'::regclass AND NOT tgisinternal
  AND tgname ILIKE '%user_id_immutable%'

UNION ALL
-- A8 — kill switch must be OFF until Phase 38.0.2 (R-03/R-07)
SELECT 12, 'A8 D-56 kill switch', 'enabled = ' || coalesce(enabled::text, 'NULL'),
       CASE WHEN enabled IS FALSE THEN 'PASS — correctly OFF'
            ELSE '*** FAIL — MUST BE OFF until 38.0.2 ***' END
FROM public.workspace_access_config

UNION ALL
-- A9 — current population (INFO: changes the risk calculus for Part B)
SELECT 13, 'A9 population (INFO)', t, n::text FROM (
  SELECT 'workspace_grants' AS t, count(*) AS n FROM public.workspace_grants
  UNION ALL SELECT 'workspace_attachments', count(*) FROM public.workspace_attachments
  UNION ALL SELECT 'workspace_members', count(*) FROM public.workspace_members
  UNION ALL SELECT 'workspace_roster_relationships', count(*) FROM public.workspace_roster_relationships
  UNION ALL SELECT 'workspace_permission_requests', count(*) FROM public.workspace_permission_requests
) pop

UNION ALL
-- A10 — S1: audit log is not append-only (expected; deferred to 38.0.2)
SELECT 14, 'A10 audit-log write grants (INFO, S1)',
       coalesce(string_agg(grantee || ':' || privilege_type, ', '), '(none)'),
       'INFO — expected today, deferred to 38.0.2 as WSR-26'
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'workspace_audit_log'
  AND privilege_type IN ('UPDATE','DELETE','TRUNCATE')

UNION ALL
-- A11 — anon must reach none of these functions
SELECT 15, 'A11 anon EXECUTE', p.proname,
       CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
            THEN '*** FAIL — anon can execute ***' ELSE 'PASS' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname LIKE 'workspace_read_%'
    OR p.proname IN ('workspace_project_permission','workspace_grant_lineage_live','transfer_vault_project_custody'))

ORDER BY ord, detail;
