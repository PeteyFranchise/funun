-- Read-only structural verification after an owner applies 221, 222 and 223.
WITH target_tables(name) AS (
  VALUES ('workspace_subscriptions'), ('workspace_billing_events'), ('workspace_usage_events')
), service_functions(signature) AS (
  VALUES
    ('workspace_writes_allowed(uuid)'),
    ('set_workspace_billing_state(uuid,uuid,timestamp with time zone,text,text,text,text,timestamp with time zone,timestamp with time zone)'),
    ('record_workspace_usage(uuid,text,bigint,text,text,uuid,uuid,timestamp with time zone)'),
    ('workspace_usage_summary(uuid,timestamp with time zone,timestamp with time zone)')
), doctrine_sources(source_path) AS (
  VALUES
    ('.planning/deliberations/member-workspaces/member-workspaces-doctrine.md#member-workspaces-identity-authority-and-custody-doctrine'),
    ('.planning/deliberations/member-workspaces/member-workspaces-doctrine.md#a-r-and-sales-working-through-member-workspaces'),
    ('.planning/deliberations/member-workspaces/member-workspaces-doctrine.md#it-and-leadership-workspace-rollout-and-incident-controls')
)
SELECT 10 AS ord, 'all' AS migration, 'Complete Phase 38.2 chain is registered' AS check_name,
  (SELECT count(*) = 3 FROM supabase_migrations.schema_migrations WHERE version IN ('221', '222', '223')) AS ok,
  true AS blocking, 'Expected registered versions 221, 222 and 223.' AS detail
UNION ALL
SELECT 20, '221-222', 'All operational tables exist with RLS',
  (SELECT count(*) = 3
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   JOIN target_tables target ON target.name = c.relname
   WHERE n.nspname = 'public' AND c.relrowsecurity),
  true, 'Billing and usage ledgers must remain RLS-enabled.'
UNION ALL
SELECT 30, '221-222', 'Browser and PUBLIC table privileges are absent',
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants grants
    JOIN target_tables target ON target.name = grants.table_name
    WHERE grants.table_schema = 'public'
      AND grants.grantee IN ('PUBLIC', 'anon', 'authenticated')
  ), true, 'No browser role may read or mutate workspace billing/usage records.'
UNION ALL
SELECT 40, '221-222', 'Append-only ledgers reject service mutation privileges',
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('workspace_billing_events', 'workspace_usage_events')
      AND grantee = 'service_role'
      AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES')
  ), true, 'Service role receives SELECT and INSERT only on append-only ledgers.'
UNION ALL
SELECT 50, '221-222', 'All application functions are hardened service-only definers',
  (SELECT count(*) = 4
   FROM service_functions target
   JOIN pg_proc procedure ON procedure.oid = to_regprocedure('public.' || target.signature)
   WHERE procedure.prosecdef
     AND COALESCE(procedure.proconfig, '{}'::TEXT[]) @> ARRAY['search_path=""']::TEXT[]
     AND has_function_privilege('service_role', procedure.oid, 'EXECUTE')
     AND NOT has_function_privilege('anon', procedure.oid, 'EXECUTE')
     AND NOT has_function_privilege('authenticated', procedure.oid, 'EXECUTE')),
  true, 'Every app-facing function must be an empty-search-path definer callable only by service_role.'
UNION ALL
SELECT 60, '221', 'Every workspace has one billing identity',
  NOT EXISTS (
    SELECT 1 FROM public.workspaces workspace
    LEFT JOIN public.workspace_subscriptions subscription ON subscription.workspace_id = workspace.id
    GROUP BY workspace.id HAVING count(subscription.id) <> 1
  ), true, 'Migration 221 backfill and provisioning must cover every workspace exactly once.'
UNION ALL
SELECT 70, '221', 'Unknown workspace write eligibility fails closed',
  public.workspace_writes_allowed('00000000-0000-0000-0000-000000000000'::UUID) = false,
  true, 'Missing billing state must never permit a workspace mutation.'
UNION ALL
SELECT 80, '222', 'Usage ledger has no free-form sensitive payload columns',
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspace_usage_events'
      AND column_name IN ('metadata', 'prompt', 'content', 'email', 'file_path', 'rights_data')
  ), true, 'Usage observations must remain a narrow metric record.'
UNION ALL
SELECT 90, '223', 'All three doctrine entries are published from adopted sources',
  (SELECT count(*) = 3
   FROM public.playbook_entries entry
   JOIN doctrine_sources source ON source.source_path = entry.source_path
   WHERE entry.entry_type = 'document'
     AND entry.status = 'published'
     AND entry.source_kind = 'adopted_markdown'
     AND entry.source_hash IS NOT NULL),
  true, 'The approved company-wide, commercial, and IT entries must all be published.'
ORDER BY ord;
