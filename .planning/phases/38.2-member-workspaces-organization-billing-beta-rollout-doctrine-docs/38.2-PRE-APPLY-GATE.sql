-- Read-only production gate for owner-applied candidates 221, 222 and 223.
-- Run against the linked production database. Every blocking row must be true.
SELECT 10 AS ord, 'all' AS migration, 'Phase 38.1 baseline is registered through 220' AS check_name,
  EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '220') AS ok,
  true AS blocking, 'Migrations 219 and 220 must be applied and verified before Phase 38.2.' AS detail
UNION ALL
SELECT 20, 'all', 'Candidate ledger numbers are unused',
  NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ('221', '222', '223')),
  true, 'Migrations 221, 222 and 223 must be unregistered.'
UNION ALL
SELECT 30, '221', 'Workspace billing targets are free',
  to_regclass('public.workspace_subscriptions') IS NULL
    AND to_regclass('public.workspace_billing_events') IS NULL
    AND to_regprocedure('public.workspace_writes_allowed(uuid)') IS NULL
    AND to_regprocedure('public.set_workspace_billing_state(uuid,uuid,timestamp with time zone,text,text,text,text,timestamp with time zone,timestamp with time zone)') IS NULL,
  true, 'Billing tables and service function signatures must be unused.'
UNION ALL
SELECT 40, '222', 'Workspace usage targets are free',
  to_regclass('public.workspace_usage_events') IS NULL
    AND to_regprocedure('public.record_workspace_usage(uuid,text,bigint,text,text,uuid,uuid,timestamp with time zone)') IS NULL
    AND to_regprocedure('public.workspace_usage_summary(uuid,timestamp with time zone,timestamp with time zone)') IS NULL,
  true, 'Usage table and service function signatures must be unused.'
UNION ALL
SELECT 50, '223', 'Playbook doctrine sources are unused',
  NOT EXISTS (
    SELECT 1 FROM public.playbook_entries
    WHERE source_path IN (
      '.planning/deliberations/member-workspaces/member-workspaces-doctrine.md#member-workspaces-identity-authority-and-custody-doctrine',
      '.planning/deliberations/member-workspaces/member-workspaces-doctrine.md#a-r-and-sales-working-through-member-workspaces',
      '.planning/deliberations/member-workspaces/member-workspaces-doctrine.md#it-and-leadership-workspace-rollout-and-incident-controls'
    )
  ), true, 'No workspace doctrine source may already be adopted.'
UNION ALL
SELECT 60, 'all', 'Required workspace and Playbook structures exist',
  to_regclass('public.workspaces') IS NOT NULL
    AND to_regclass('public.workspace_access_config') IS NOT NULL
    AND to_regclass('public.workspace_cohorts') IS NOT NULL
    AND to_regclass('public.workspace_audit_log') IS NOT NULL
    AND to_regclass('public.playbook_entries') IS NOT NULL
    AND to_regclass('public.playbook_entry_revisions') IS NOT NULL,
  true, 'All workspace controls and rich-document publication structures are required.'
UNION ALL
SELECT 70, '223', 'Required Playbook rooms and subgroups exist',
  (
    SELECT count(*) = 3
    FROM (VALUES
      ('company-wide', 'organizational-doctrine'),
      ('company-wide', 'cross-functional-operations'),
      ('it-team', 'role-doctrine')
    ) required(room_key, subgroup_key)
    JOIN public.playbook_rooms room ON room.key = required.room_key
    JOIN public.playbook_sub_groups subgroup
      ON subgroup.room_id = room.id AND subgroup.key = required.subgroup_key
  ), true, 'Migration 223 publishes only into installed rooms and subgroups.'
ORDER BY ord;
