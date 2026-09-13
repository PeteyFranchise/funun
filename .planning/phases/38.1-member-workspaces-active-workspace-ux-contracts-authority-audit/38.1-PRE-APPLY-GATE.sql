-- Read-only production gate for owner-applied candidates 219 and 220.
-- Run with the linked production project. Every blocking row must be true.
SELECT 10 AS ord, 'all' AS migration, 'Baseline 218 is registered' AS check_name,
  EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '218') AS ok,
  true AS blocking, 'Migration 218 must precede this chain.' AS detail
UNION ALL
SELECT 20, 'all', 'Candidate ledger numbers are unused',
  NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ('219', '220')),
  true, 'Migrations 219 and 220 must both be unregistered.'
UNION ALL
SELECT 30, '219', 'Rights proposal targets are free',
  to_regclass('public.workspace_rights_proposals') IS NULL
    AND to_regprocedure('public.decide_workspace_rights_proposal(uuid,uuid,text)') IS NULL,
  true, 'The table and decision signature must be unused.'
UNION ALL
SELECT 40, '220', 'Master claim targets are free',
  to_regclass('public.master_ownership_claims') IS NULL
    AND to_regprocedure('public.create_master_ownership_claim(uuid,uuid,uuid,text)') IS NULL
    AND to_regprocedure('public.decide_master_ownership_claim(uuid,uuid,text,uuid,text)') IS NULL
    AND to_regprocedure('public.workspace_master_claim_access(uuid,uuid,text)') IS NULL,
  true, 'The table and all three function signatures must be unused.'
UNION ALL
SELECT 50, 'all', 'Required relations exist',
  to_regclass('public.workspaces') IS NOT NULL
    AND to_regclass('public.workspace_members') IS NOT NULL
    AND to_regclass('public.workspace_roster_relationships') IS NOT NULL
    AND to_regclass('public.workspace_audit_log') IS NOT NULL
    AND to_regclass('public.works') IS NOT NULL
    AND to_regclass('public.work_versions') IS NOT NULL
    AND to_regclass('public.vault_projects') IS NOT NULL
    AND to_regclass('public.vault_documents') IS NOT NULL,
  true, 'All workspace, recording, custody, evidence, and audit dependencies are required.'
ORDER BY ord;
