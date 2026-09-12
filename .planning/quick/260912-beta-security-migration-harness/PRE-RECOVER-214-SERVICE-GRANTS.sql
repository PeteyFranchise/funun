-- Read-only gate for the narrow migration-214 service-role ACL recovery.
-- Every row must report ok=true before RECOVER-214-SERVICE-GRANTS.sql runs.

WITH checks(ord, check_name, ok, detail) AS (
  SELECT 10, 'Migration 214 remains unregistered',
         NOT EXISTS (
           SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '214'
         ),
         'Recovery applies only to the reviewed APPLIED_UNREGISTERED state.'
  UNION ALL
  SELECT 20, 'Verified-claim ledger exists with RLS',
         to_regclass('public.verified_signup_invite_claims') IS NOT NULL
           AND COALESCE((
             SELECT c.relrowsecurity
               FROM pg_catalog.pg_class c
              WHERE c.oid = to_regclass('public.verified_signup_invite_claims')
           ), false),
         'The recovery target must exist and remain RLS-enabled.'
  UNION ALL
  SELECT 30, 'Browser roles have no ledger privileges',
         NOT EXISTS (
           SELECT 1
             FROM information_schema.role_table_grants g
            WHERE g.table_schema = 'public'
              AND g.table_name = 'verified_signup_invite_claims'
              AND g.grantee IN ('PUBLIC', 'anon', 'authenticated')
         ),
         'No browser privilege may exist before the recovery.'
  UNION ALL
  SELECT 40, 'Service role has the observed over-broad default grant',
         COALESCE((
           SELECT array_agg(g.privilege_type::text ORDER BY g.privilege_type::text)
             FROM information_schema.role_table_grants g
            WHERE g.table_schema = 'public'
              AND g.table_name = 'verified_signup_invite_claims'
              AND g.grantee = 'service_role'
         ), ARRAY[]::text[]) = ARRAY[
           'DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'
         ]::text[],
         'Expected exact production finding before narrowing to INSERT and SELECT.'
)
SELECT ord, check_name, ok, detail
FROM checks
ORDER BY ord;
