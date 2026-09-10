-- READ-ONLY production probe after the failed first attempt to apply migration 207.
-- Expected result before retrying 207: every value is true.

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
  SELECT table_name, to_regclass(format('public.%I', table_name)) AS relation
  FROM expected_tables
),
expected_functions(signature) AS (
  VALUES
    ('public.review_playbook_simulation_attempt(uuid,uuid,integer,boolean,text)'),
    ('public.link_playbook_operational_record(uuid,uuid,text,text,text,text,uuid)'),
    ('public.prevent_playbook_operational_event_mutation()')
),
observed_functions AS (
  SELECT signature, to_regprocedure(signature) AS function_oid
  FROM expected_functions
)
SELECT
  NOT EXISTS (SELECT 1 FROM observed_tables WHERE relation IS NOT NULL) AS all_207_tables_absent,
  NOT EXISTS (SELECT 1 FROM observed_functions WHERE function_oid IS NOT NULL) AS all_207_functions_absent,
  NOT EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '207'
  ) AS migration_207_unregistered;
