-- ============================================================
-- Phase 38.0.1 — VERIFICATION PART A: STRUCTURAL (read-only)
--
-- Run this in the Supabase SQL editor against PRODUCTION.
-- It is 100% READ-ONLY: no INSERT, UPDATE, DELETE, DDL, or GRANT.
-- It does NOT require the D-56 kill switch to be on.
-- It does NOT require any seeded data or test accounts.
--
-- It proves the migrations produced the objects they were reviewed
-- as producing. It CANNOT prove behaviour under a live grant — that
-- is Part B, which needs the kill switch on and seeded data.
--
-- Each query prints a verdict column. Anything that is not PASS is
-- a finding: stop and report it rather than proceeding.
-- ============================================================

-- ─── A1. The p_uid caller bind (the impersonation fix) ───────────
-- Migration 193's four read functions must each contain the bind.
-- Without it, any authenticated caller can read as any other user.
SELECT
  p.proname,
  CASE WHEN pg_get_functiondef(p.oid) LIKE '%p_uid = ( SELECT auth.uid()%'
         OR pg_get_functiondef(p.oid) LIKE '%p_uid = (SELECT auth.uid()%'
       THEN 'PASS' ELSE '*** FAIL — MISSING CALLER BIND ***' END AS verdict
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'workspace_read_%'
ORDER BY p.proname;

-- ─── A2. Column allowlist (WSR-03/04) ────────────────────────────
-- The declared OUT columns ARE the security contract. Read this
-- list yourself: no audio path, no asset URL, no document payload,
-- no lyric body, no *_url, no storage path of any kind.
SELECT p.proname, pg_get_function_result(p.oid) AS declared_columns
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'workspace_read_%'
ORDER BY p.proname;

-- A2b. Automated negative check on the forbidden names.
SELECT p.proname,
  CASE WHEN pg_get_function_result(p.oid) ~* '(audio_file_url|audio_file_size|lyrics|file_url|url|payload|claim_token|iswc|metadata)'
       THEN '*** FAIL — FORBIDDEN COLUMN EXPOSED ***' ELSE 'PASS' END AS verdict
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'workspace_read_%'
ORDER BY p.proname;

-- ─── A3. Blast radius (R-02) ─────────────────────────────────────
-- After migration 193, vault_projects must be the ONLY table whose
-- policies name a workspace helper. These four must return zero rows.
SELECT tablename, policyname, 'FAIL — workspace branch still present' AS verdict
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('tracks','vault_assets','vault_documents','tool_outputs')
  AND (qual ILIKE '%workspace_project_permission%' OR with_check ILIKE '%workspace_project_permission%');
-- Expect: 0 rows. Any row is a finding.

-- A3b. vault_projects must still HAVE its (narrowed) workspace branch.
SELECT count(*) AS vault_projects_workspace_policies,
  CASE WHEN count(*) > 0 THEN 'PASS' ELSE '*** FAIL — branch missing ***' END AS verdict
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'vault_projects'
  AND (qual ILIKE '%workspace_project_permission%' OR with_check ILIKE '%workspace_project_permission%');

-- ─── A4. One canonical live-membership definition (WSR-17) ───────
-- Both helpers must check expires_at, matching requireWorkspaceAccess.
SELECT p.proname,
  CASE WHEN pg_get_functiondef(p.oid) ILIKE '%expires_at%' THEN 'PASS'
       ELSE '*** FAIL — expires_at not checked ***' END AS verdict
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('workspace_member_role','is_workspace_owner')
ORDER BY p.proname;

-- ─── A5. The six hops (WSR-06, WSR-02) ───────────────────────────
-- workspace_project_permission must contain the kill switch first,
-- the custody binding, and the lineage re-validation.
SELECT
  CASE WHEN d ILIKE '%workspace_access_enabled%' THEN 'PASS' ELSE 'FAIL' END AS kill_switch,
  CASE WHEN d ILIKE '%vault_projects%' AND d ILIKE '%member_user_id%' THEN 'PASS' ELSE 'FAIL' END AS custody_binding,
  CASE WHEN d ILIKE '%workspace_grant_lineage_live%' THEN 'PASS' ELSE 'FAIL' END AS lineage_revalidation
FROM (SELECT pg_get_functiondef(p.oid) AS d
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='workspace_project_permission' LIMIT 1) s;

-- ─── A6. Index backing the custody join (perf, step 9 precursor) ─
SELECT indexname, 'PASS' AS verdict FROM pg_indexes
WHERE schemaname='public' AND tablename='vault_projects' AND indexdef ILIKE '%user_id%';
-- Expect at least one row.

-- ─── A7. Custody immutability (WSR-25) ───────────────────────────
SELECT tgname,
  CASE WHEN tgenabled <> 'D' THEN 'PASS' ELSE '*** FAIL — trigger disabled ***' END AS verdict
FROM pg_trigger
WHERE tgrelid = 'public.vault_projects'::regclass AND NOT tgisinternal
  AND tgname LIKE '%user_id_immutable%';

-- ─── A8. Kill switch state (must be FALSE until Phase 38.0.2) ────
SELECT enabled,
  CASE WHEN enabled IS FALSE THEN 'PASS — correctly OFF'
       ELSE '*** FAIL — MUST BE OFF until 38.0.2 (R-03/R-07) ***' END AS verdict
FROM public.workspace_access_config;

-- ─── A9. Exposure check — are the workspace tables still empty? ──
SELECT 'workspace_grants' AS t, count(*) FROM public.workspace_grants
UNION ALL SELECT 'workspace_attachments', count(*) FROM public.workspace_attachments
UNION ALL SELECT 'workspace_members', count(*) FROM public.workspace_members
UNION ALL SELECT 'workspace_roster_relationships', count(*) FROM public.workspace_roster_relationships
UNION ALL SELECT 'workspace_permission_requests', count(*) FROM public.workspace_permission_requests;
-- Non-zero is not necessarily wrong (beta users may have started),
-- but it changes the risk calculus for Part B. Report the numbers.

-- ─── A10. S1 — audit log is not append-only (carried to 38.0.2) ──
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='workspace_audit_log'
  AND privilege_type IN ('UPDATE','DELETE','TRUNCATE')
ORDER BY grantee, privilege_type;
-- Expected TODAY: service_role holds these. That is finding S1,
-- deliberately deferred to Phase 38.0.2 (WSR-26). Recording it, not fixing it.

-- ─── A11. Anon must reach none of the read functions ─────────────
SELECT p.proname,
  CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
       THEN '*** FAIL — anon can execute ***' ELSE 'PASS' END AS verdict
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND (p.proname LIKE 'workspace_read_%' OR p.proname IN
       ('workspace_project_permission','workspace_grant_lineage_live','transfer_vault_project_custody'))
ORDER BY p.proname;
