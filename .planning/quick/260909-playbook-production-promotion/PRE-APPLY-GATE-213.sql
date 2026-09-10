-- Migration 213 read-only production gate.
-- Every row must be PASS before the migration is applied.

WITH expected_tables(name) AS (
  SELECT unnest(ARRAY[
    'playbook_entry_revisions',
    'playbook_entry_game_plan_links',
    'playbook_review_reminders',
    'playbook_reading_assignments',
    'playbook_reading_acknowledgements',
    'playbook_reading_reminders',
    'playbook_review_rounds',
    'playbook_review_threads',
    'playbook_review_messages',
    'playbook_review_mentions',
    'playbook_review_events',
    'playbook_review_round_events'
  ]::text[])
),
expected_roles(name) AS (
  VALUES ('anon'::text), ('authenticated'::text)
),
table_checks AS (
  SELECT
    1000 + row_number() OVER (ORDER BY expected.name) AS ord,
    'required table exists: public.' || expected.name AS check_name,
    coalesce(to_regclass('public.' || expected.name)::text, 'NULL') AS raw_value,
    CASE
      WHEN to_regclass('public.' || expected.name) IS NOT NULL THEN 'PASS'
      ELSE 'STOP'
    END AS verdict
  FROM expected_tables expected
),
grant_checks AS (
  SELECT
    2000 + row_number() OVER (ORDER BY expected.name, expected_role.name) AS ord,
    'observed residual grants: public.' || expected.name || ' / ' || expected_role.name
      AS check_name,
    coalesce(observed.raw_privileges, 'none') AS raw_value,
    CASE
      WHEN observed.raw_privileges = 'REFERENCES, TRIGGER, TRUNCATE' THEN 'PASS'
      ELSE 'STOP'
    END AS verdict
  FROM expected_tables expected
  CROSS JOIN expected_roles expected_role
  LEFT JOIN LATERAL (
    SELECT string_agg(grants.privilege_type, ', ' ORDER BY grants.privilege_type)
      AS raw_privileges
    FROM information_schema.role_table_grants grants
    WHERE grants.table_schema = 'public'
      AND grants.table_name = expected.name
      AND grants.grantee = expected_role.name
  ) observed ON true
),
special_checks AS (
  SELECT
    3001 AS ord,
    'PUBLIC has no privileges on the twelve tables' AS check_name,
    count(*)::text AS raw_value,
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'STOP' END AS verdict
  FROM information_schema.role_table_grants grants
  WHERE grants.table_schema = 'public'
    AND grants.table_name IN (SELECT name FROM expected_tables)
    AND grants.grantee = 'PUBLIC'

  UNION ALL

  SELECT
    3002,
    'migration ledger version is free: 213',
    coalesce(history.version::text, 'NULL'),
    CASE WHEN history.version IS NULL THEN 'PASS' ELSE 'STOP' END
  FROM (SELECT '213'::text AS expected_version) expected
  LEFT JOIN supabase_migrations.schema_migrations history
    ON history.version::text = expected.expected_version
)
SELECT ord, check_name, raw_value, verdict
FROM (
  SELECT * FROM table_checks
  UNION ALL SELECT * FROM grant_checks
  UNION ALL SELECT * FROM special_checks
) checks
ORDER BY ord;
