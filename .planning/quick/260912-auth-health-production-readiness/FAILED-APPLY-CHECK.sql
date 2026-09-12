-- Read-only residue classifier after a failed migration 218 apply command.
-- PARTIAL_OR_LEDGER_MISMATCH is a hard stop.

WITH state AS (
  SELECT
    (to_regclass('public.auth_diagnostic_events') IS NOT NULL)::int
      + (to_regprocedure('public.prune_auth_diagnostic_events()') IS NOT NULL)::int AS present_count,
    EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '218'
    ) AS ledger_applied
)
SELECT '218' AS migration, present_count, 2 AS expected_count, ledger_applied,
       CASE
         WHEN present_count = 0 AND NOT ledger_applied THEN 'NOT_APPLIED_CLEAN'
         WHEN present_count = 2 AND NOT ledger_applied THEN 'APPLIED_UNREGISTERED'
         WHEN present_count = 2 AND ledger_applied THEN 'APPLIED_CLEAN'
         ELSE 'PARTIAL_OR_LEDGER_MISMATCH'
       END AS state
FROM state;
