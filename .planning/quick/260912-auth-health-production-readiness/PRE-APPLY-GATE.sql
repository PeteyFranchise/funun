-- Read-only pre-apply gate for human-gated migration 218.
-- Every row must report ok=true before an owner applies the candidate.

WITH checks(ord, migration, check_name, ok, blocking, detail) AS (
  SELECT 10, '218', 'Required migration baseline is applied through 217',
         EXISTS (
           SELECT 1 FROM supabase_migrations.schema_migrations
           WHERE version = '217'
         ),
         true, 'Migration 217 must be registered before migration 218.'
  UNION ALL
  SELECT 20, '218', 'Migration ledger entry is unused',
         NOT EXISTS (
           SELECT 1 FROM supabase_migrations.schema_migrations
           WHERE version = '218'
         ),
         true, 'Migration 218 must not already be registered.'
  UNION ALL
  SELECT 30, '218', 'Target table name is free',
         to_regclass('public.auth_diagnostic_events') IS NULL,
         true, COALESCE(to_regclass('public.auth_diagnostic_events')::text, 'free')
  UNION ALL
  SELECT 40, '218', 'Retention function signature is free',
         to_regprocedure('public.prune_auth_diagnostic_events()') IS NULL,
         true, COALESCE(to_regprocedure('public.prune_auth_diagnostic_events()')::text, 'free')
)
SELECT ord, migration, check_name, ok, blocking, detail
FROM checks
ORDER BY ord;
