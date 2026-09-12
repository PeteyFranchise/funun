-- Read-only structural verification for human-gated migration 218.
-- All rows must report ok=true before ledger repair or application promotion.

WITH expected_columns(column_name) AS (
  VALUES
    ('id'), ('correlation_id'), ('event_code'), ('stage'), ('surface'),
    ('workspace_intent'), ('runtime'), ('created_at')
), checks(ord, migration, check_name, ok, blocking, detail) AS (
  SELECT 10, '218', 'Diagnostic table exists',
         to_regclass('public.auth_diagnostic_events') IS NOT NULL,
         true, COALESCE(to_regclass('public.auth_diagnostic_events')::text, 'absent')
  UNION ALL
  SELECT 20, '218', 'Diagnostic table has exactly the allowlisted columns',
         to_regclass('public.auth_diagnostic_events') IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM expected_columns e
             WHERE NOT EXISTS (
               SELECT 1 FROM information_schema.columns c
               WHERE c.table_schema = 'public'
                 AND c.table_name = 'auth_diagnostic_events'
                 AND c.column_name = e.column_name
             )
           )
           AND 8 = (
             SELECT count(*) FROM information_schema.columns c
             WHERE c.table_schema = 'public' AND c.table_name = 'auth_diagnostic_events'
           ),
         true, 'No identity, email, network, browser, URL, provider-error, credential, or token columns.'
  UNION ALL
  SELECT 30, '218', 'RLS is enabled',
         COALESCE((
           SELECT c.relrowsecurity FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'auth_diagnostic_events'
         ), false),
         true, 'Browser roles receive no policies or table privileges.'
  UNION ALL
  SELECT 40, '218', 'Browser and PUBLIC table privileges are absent',
         NOT EXISTS (
           SELECT 1 FROM information_schema.role_table_grants
           WHERE table_schema = 'public'
             AND table_name = 'auth_diagnostic_events'
             AND grantee IN ('PUBLIC', 'anon', 'authenticated')
         ),
         true, 'No table privilege may be granted to PUBLIC, anon, or authenticated.'
  UNION ALL
  SELECT 50, '218', 'Service table privileges are insert and select only',
         COALESCE((
           SELECT array_agg(privilege_type ORDER BY privilege_type)
           FROM information_schema.role_table_grants
           WHERE table_schema = 'public'
             AND table_name = 'auth_diagnostic_events'
             AND grantee = 'service_role'
         ), ARRAY[]::text[]) = ARRAY['INSERT', 'SELECT']::text[],
         true, 'Retention deletion is isolated behind the service-only function.'
  UNION ALL
  SELECT 60, '218', 'Retention function is hardened',
         EXISTS (
           SELECT 1 FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname = 'prune_auth_diagnostic_events'
             AND p.pronargs = 0
             AND p.prosecdef
             AND p.proconfig = ARRAY['search_path=']::text[]
         ),
         true, 'SECURITY DEFINER with an empty search path is required.'
  UNION ALL
  SELECT 70, '218', 'Retention function is service-only',
         to_regprocedure('public.prune_auth_diagnostic_events()') IS NOT NULL
           AND NOT has_function_privilege('PUBLIC', 'public.prune_auth_diagnostic_events()', 'EXECUTE')
           AND NOT has_function_privilege('anon', 'public.prune_auth_diagnostic_events()', 'EXECUTE')
           AND NOT has_function_privilege('authenticated', 'public.prune_auth_diagnostic_events()', 'EXECUTE')
           AND has_function_privilege('service_role', 'public.prune_auth_diagnostic_events()', 'EXECUTE'),
         true, 'Only service_role may invoke retention cleanup.'
  UNION ALL
  SELECT 80, '218', 'Retention indexes exist',
         to_regclass('public.auth_diagnostic_events_created_at_idx') IS NOT NULL
           AND to_regclass('public.auth_diagnostic_events_code_created_at_idx') IS NOT NULL,
         true, 'Both time-order and event/time indexes are required.'
)
SELECT ord, migration, check_name, ok, blocking, detail
FROM checks
ORDER BY ord;
