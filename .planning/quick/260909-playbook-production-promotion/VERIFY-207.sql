-- READ-ONLY production verification for migration 207.
-- Expected result before registering 207: every value is true.

WITH expected_tables(table_name) AS (
  VALUES
    ('playbook_feature_controls'),
    ('playbook_beta_cohorts'),
    ('playbook_beta_cohort_members'),
    ('playbook_feature_cohort_grants'),
    ('playbook_feature_control_events'),
    ('playbook_sla_rules'),
    ('playbook_doctrine_dependencies'),
    ('playbook_simulation_scenarios'),
    ('playbook_simulation_assignments'),
    ('playbook_simulation_attempts'),
    ('playbook_certifications'),
    ('playbook_simulation_events'),
    ('playbook_operational_links'),
    ('playbook_operational_link_events')
),
observed_tables AS (
  SELECT
    expected.table_name,
    relation.oid,
    relation.relrowsecurity
  FROM expected_tables expected
  LEFT JOIN pg_catalog.pg_class relation
    ON relation.oid = pg_catalog.to_regclass('public.' || expected.table_name)
),
browser_grants AS (
  SELECT count(*) AS grant_count
  FROM information_schema.role_table_grants grant_row
  JOIN expected_tables expected ON expected.table_name = grant_row.table_name
  WHERE grant_row.table_schema = 'public'
    AND grant_row.grantee IN ('PUBLIC', 'anon', 'authenticated')
),
expected_functions(signature, service_callable) AS (
  VALUES
    ('public.review_playbook_simulation_attempt(uuid,uuid,integer,boolean,text)', true),
    ('public.link_playbook_operational_record(uuid,uuid,text,text,text,text,uuid)', true),
    ('public.prevent_playbook_operational_event_mutation()', false)
),
observed_functions AS (
  SELECT
    expected.signature,
    expected.service_callable,
    function_row.oid,
    function_row.proconfig
  FROM expected_functions expected
  LEFT JOIN pg_catalog.pg_proc function_row
    ON function_row.oid = pg_catalog.to_regprocedure(expected.signature)
),
expected_triggers(trigger_name, table_name) AS (
  VALUES
    ('protect_playbook_feature_events', 'playbook_feature_control_events'),
    ('protect_playbook_simulation_events', 'playbook_simulation_events'),
    ('protect_playbook_operational_link_events', 'playbook_operational_link_events')
),
observed_triggers AS (
  SELECT expected.trigger_name, trigger_row.oid
  FROM expected_triggers expected
  LEFT JOIN pg_catalog.pg_trigger trigger_row
    ON trigger_row.tgname = expected.trigger_name
   AND trigger_row.tgrelid = pg_catalog.to_regclass('public.' || expected.table_name)
   AND NOT trigger_row.tgisinternal
),
control_posture AS (
  SELECT
    count(*) AS control_count,
    count(*) FILTER (WHERE enabled) AS enabled_count,
    count(*) FILTER (WHERE NOT emergency_disabled) AS emergency_cleared_count
  FROM public.playbook_feature_controls
)
SELECT
  (SELECT count(*) = 14 AND count(*) FILTER (WHERE oid IS NOT NULL) = 14 FROM observed_tables) AS all_tables,
  (SELECT bool_and(relrowsecurity) FROM observed_tables) AS rls_enabled,
  (SELECT grant_count = 0 FROM browser_grants) AS no_browser_grants,
  (
    SELECT count(*) = 3
      AND count(*) FILTER (WHERE oid IS NOT NULL) = 3
      AND bool_and(proconfig @> ARRAY['search_path=""']::text[])
      AND bool_and(NOT pg_catalog.has_function_privilege('anon', oid, 'EXECUTE'))
      AND bool_and(NOT pg_catalog.has_function_privilege('authenticated', oid, 'EXECUTE'))
      AND bool_and(NOT service_callable OR pg_catalog.has_function_privilege('service_role', oid, 'EXECUTE'))
    FROM observed_functions
  ) AS all_functions_hardened,
  (SELECT count(*) = 3 AND count(*) FILTER (WHERE oid IS NOT NULL) = 3 FROM observed_triggers) AS all_triggers,
  (
    SELECT control_count = 6 AND enabled_count = 0 AND emergency_cleared_count = 0
    FROM control_posture
  ) AS controls_fail_closed,
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'playbook_sla_rules'
      AND indexname = 'playbook_sla_rules_scope_unique'
      AND indexdef LIKE '%NULLS NOT DISTINCT%'
  ) AS sla_unique_index;
