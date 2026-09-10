-- Read-only checkpoint after migration 206.

WITH expected_tables(name) AS (
  SELECT unnest(ARRAY[
    'playbook_media_assets',
    'playbook_learning_paths',
    'playbook_learning_path_steps',
    'playbook_learning_assignments',
    'playbook_learning_step_completions',
    'playbook_knowledge_attempts',
    'playbook_reader_feedback',
    'playbook_reader_feedback_events',
    'playbook_assistant_runs',
    'playbook_workflow_templates',
    'playbook_workflow_template_steps',
    'playbook_workflow_runs',
    'playbook_workflow_run_tasks',
    'playbook_exceptions',
    'playbook_exception_events',
    'playbook_incidents',
    'playbook_incident_tasks',
    'playbook_incident_events',
    'playbook_entry_translations',
    'playbook_glossary_terms',
    'playbook_user_preferences'
  ]::text[])
),
expected_triggers(name) AS (
  VALUES
    ('protect_playbook_feedback_events'::text),
    ('protect_playbook_exception_events'::text),
    ('protect_playbook_incident_events'::text)
)
SELECT
  (SELECT count(*) = 21
     FROM expected_tables
    WHERE to_regclass('public.' || name) IS NOT NULL) AS all_tables,
  (SELECT count(*) = 21
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
  EXISTS (
    SELECT 1
    FROM storage.buckets bucket
    WHERE bucket.id = 'playbook-media'
      AND bucket.public IS FALSE
  ) AS private_media_bucket,
  to_regprocedure('public.prevent_playbook_enablement_event_mutation()') IS NOT NULL
    AS event_function,
  (SELECT count(*) = 3
     FROM expected_triggers expected
     JOIN pg_trigger trigger_row ON trigger_row.tgname = expected.name
    WHERE NOT trigger_row.tgisinternal) AS all_triggers;
