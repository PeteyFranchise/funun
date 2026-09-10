-- Read-only checkpoint after migration 205.

WITH expected_tables(name) AS (
  VALUES
    ('playbook_change_broadcasts'::text),
    ('playbook_change_broadcast_reads'::text)
),
expected_functions(identity) AS (
  VALUES
    ('public.prevent_playbook_change_broadcast_mutation()'::text),
    ('public.publish_playbook_change_broadcast(uuid,uuid,integer,text,text,text,text,text,text,text,uuid,timestamp with time zone,boolean,timestamp with time zone,uuid,uuid[])'::text)
)
SELECT
  (SELECT count(*) = 2
     FROM expected_tables
    WHERE to_regclass('public.' || name) IS NOT NULL) AS all_tables,
  (SELECT count(*) = 2
     FROM expected_tables expected
     JOIN pg_class relation
       ON relation.oid = to_regclass('public.' || expected.name)
    WHERE relation.relrowsecurity) AS rls_enabled,
  NOT EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants grants
    JOIN expected_tables expected ON expected.name = grants.table_name
    WHERE grants.table_schema = 'public'
      AND grants.grantee IN ('PUBLIC', 'anon', 'authenticated')
  ) AS no_browser_grants,
  (SELECT count(*) = 2
     FROM expected_functions
    WHERE to_regprocedure(identity) IS NOT NULL) AS all_functions,
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'protect_playbook_change_broadcast_history'
      AND tgrelid = 'public.playbook_change_broadcasts'::regclass
      AND NOT tgisinternal
  ) AS history_trigger;
