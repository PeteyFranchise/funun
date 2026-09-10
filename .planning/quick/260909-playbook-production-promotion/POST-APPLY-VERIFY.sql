-- Funūn Playbook migrations 201, 202, 204, 205, 206, 207
-- OWNER-RUN READ-ONLY POST-APPLY VERIFICATION.
-- Run this single statement after migration 207 commits. Every row must PASS.

WITH
expected_tables(object_name) AS (
  SELECT pg_catalog.unnest(ARRAY[
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
    'playbook_review_round_events',
    'playbook_change_broadcasts',
    'playbook_change_broadcast_reads',
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
    'playbook_user_preferences',
    'playbook_feature_controls',
    'playbook_beta_cohorts',
    'playbook_beta_cohort_members',
    'playbook_feature_cohort_grants',
    'playbook_feature_control_events',
    'playbook_sla_rules',
    'playbook_doctrine_dependencies',
    'playbook_simulation_scenarios',
    'playbook_simulation_assignments',
    'playbook_simulation_attempts',
    'playbook_certifications',
    'playbook_simulation_events',
    'playbook_operational_links',
    'playbook_operational_link_events'
  ]::text[])
),
expected_functions(function_identity, service_callable) AS (
  VALUES
    ('public.enqueue_due_playbook_review_reminders(integer)', true),
    ('public.set_playbook_entry_metadata(uuid,uuid,timestamp with time zone,integer,jsonb,uuid,boolean)', true),
    ('public.prepare_playbook_entry_publication()', false),
    ('public.capture_playbook_entry_revision()', false),
    ('public.enqueue_playbook_reading_reminders(integer)', true),
    ('public.prevent_playbook_review_history_mutation()', false),
    ('public.protect_playbook_review_round_identity()', false),
    ('public.protect_playbook_review_thread_identity()', false),
    ('public.create_playbook_review_thread(uuid,uuid,uuid,text,integer,integer,text,integer,text,text,text,uuid[])', true),
    ('public.reply_to_playbook_review_thread(uuid,uuid,text,uuid[])', true),
    ('public.transition_playbook_review_thread(uuid,uuid,text,text)', true),
    ('public.resubmit_playbook_review_round(uuid,uuid,uuid,integer)', true),
    ('public.complete_playbook_review_round(uuid,uuid,integer,text)', true),
    ('public.record_playbook_review_decision_summary(uuid,uuid,integer,text)', true),
    ('public.complete_playbook_review_round_on_approval()', false),
    ('public.prevent_playbook_change_broadcast_mutation()', false),
    ('public.publish_playbook_change_broadcast(uuid,uuid,integer,text,text,text,text,text,text,text,uuid,timestamp with time zone,boolean,timestamp with time zone,uuid,uuid[])', true),
    ('public.prevent_playbook_enablement_event_mutation()', false),
    ('public.review_playbook_simulation_attempt(uuid,uuid,integer,boolean,text)', true),
    ('public.link_playbook_operational_record(uuid,uuid,text,text,text,text,uuid)', true),
    ('public.prevent_playbook_operational_event_mutation()', false)
),
expected_triggers(trigger_name, table_name) AS (
  VALUES
    ('prepare_playbook_entry_publication', 'playbook_entries'),
    ('capture_playbook_entry_revision', 'playbook_entries'),
    ('playbook_reading_assignments_updated_at', 'playbook_reading_assignments'),
    ('protect_playbook_review_messages', 'playbook_review_messages'),
    ('protect_playbook_review_mentions', 'playbook_review_mentions'),
    ('protect_playbook_review_events', 'playbook_review_events'),
    ('protect_playbook_review_round_events', 'playbook_review_round_events'),
    ('protect_playbook_review_round_identity', 'playbook_review_rounds'),
    ('protect_playbook_review_thread_identity', 'playbook_review_threads'),
    ('complete_playbook_review_round_after_approval', 'playbook_entries'),
    ('protect_playbook_change_broadcast_history', 'playbook_change_broadcasts'),
    ('protect_playbook_feedback_events', 'playbook_reader_feedback_events'),
    ('protect_playbook_exception_events', 'playbook_exception_events'),
    ('protect_playbook_incident_events', 'playbook_incident_events'),
    ('protect_playbook_feature_events', 'playbook_feature_control_events'),
    ('protect_playbook_simulation_events', 'playbook_simulation_events'),
    ('protect_playbook_operational_link_events', 'playbook_operational_link_events')
),
expected_columns(column_name) AS (
  SELECT pg_catalog.unnest(ARRAY[
    'slug', 'sort_order', 'published_at', 'revision_number', 'draft_author_id',
    'draft_updated_at', 'draft_version', 'source_kind', 'source_path',
    'source_hash', 'draft_source_hash', 'adopted_at', 'owner_id',
    'review_due_at', 'review_interval_days', 'last_reviewed_at', 'last_reviewed_by'
  ]::text[])
),
route_expectations(route_path, table_name) AS (
  VALUES
    ('app/api/admin/playbook/entries/[id]/reviews/route.ts', 'playbook_review_rounds'),
    ('app/api/admin/playbook/entries/[id]/reviews/route.ts', 'playbook_review_threads'),
    ('app/api/admin/playbook/entries/[id]/reviews/route.ts', 'playbook_review_messages'),
    ('app/api/admin/playbook/entries/[id]/reviews/route.ts', 'playbook_review_mentions'),
    ('app/api/admin/playbook/entries/[id]/reviews/route.ts', 'playbook_review_round_events'),
    ('app/api/admin/playbook/entries/[id]/reviews/resubmit/route.ts', 'playbook_review_rounds'),
    ('app/api/admin/playbook/entries/[id]/reviews/resubmit/route.ts', 'playbook_review_threads'),
    ('app/api/admin/playbook/reviews/[threadId]/route.ts', 'playbook_review_threads'),
    ('app/api/admin/playbook/reviews/[threadId]/messages/route.ts', 'playbook_review_threads'),
    ('app/api/admin/playbook/reviews/[threadId]/messages/route.ts', 'playbook_review_messages'),
    ('app/api/admin/playbook/reviews/[threadId]/messages/route.ts', 'playbook_review_mentions'),
    ('app/api/admin/playbook/updates/[id]/read/route.ts', 'playbook_change_broadcasts'),
    ('app/api/admin/playbook/updates/[id]/read/route.ts', 'playbook_change_broadcast_reads'),
    ('app/(admin)/admin/playbook/[room]/page.tsx', 'playbook_review_mentions'),
    ('app/(admin)/admin/playbook/[room]/page.tsx', 'playbook_review_messages'),
    ('app/(admin)/admin/playbook/[room]/page.tsx', 'playbook_review_threads'),
    ('app/(admin)/admin/playbook/[room]/page.tsx', 'playbook_entry_game_plan_links'),
    ('app/(admin)/admin/playbook/my/page.tsx', 'playbook_reading_assignments'),
    ('app/(admin)/admin/playbook/my/page.tsx', 'playbook_reading_acknowledgements'),
    ('app/(admin)/admin/playbook/my/page.tsx', 'playbook_review_rounds'),
    ('app/(admin)/admin/playbook/my/page.tsx', 'playbook_review_threads'),
    ('app/(admin)/admin/playbook/governance/page.tsx', 'playbook_entry_game_plan_links'),
    ('app/(admin)/admin/playbook/governance/page.tsx', 'playbook_reading_assignments'),
    ('app/(admin)/admin/playbook/governance/page.tsx', 'playbook_reading_acknowledgements'),
    ('app/(admin)/admin/playbook/governance/page.tsx', 'playbook_review_rounds'),
    ('app/(admin)/admin/playbook/governance/page.tsx', 'playbook_review_threads')
),
table_checks AS (
  SELECT
    1000 + row_number() OVER (ORDER BY expected_tables.object_name) AS ord,
    'table security: public.' || expected_tables.object_name AS check_name,
    pg_catalog.concat(
      'identity=', COALESCE(relation.oid::regclass::text, 'NULL'),
      '; relkind=', COALESCE(relation.relkind::text, 'NULL'),
      '; rls=', COALESCE(relation.relrowsecurity::text, 'NULL'),
      '; force_rls=', COALESCE(relation.relforcerowsecurity::text, 'NULL'),
      '; browser_grants=', COALESCE(grants.raw_grants, 'none')
    ) AS raw_value,
    CASE
      WHEN relation.oid IS NOT NULL
       AND relation.relkind = 'r'
       AND relation.relrowsecurity
       AND grants.raw_grants IS NULL
      THEN 'PASS' ELSE 'STOP'
    END AS verdict
  FROM expected_tables
  LEFT JOIN pg_catalog.pg_class relation
    ON relation.oid = pg_catalog.to_regclass('public.' || expected_tables.object_name)
  LEFT JOIN LATERAL (
    SELECT pg_catalog.string_agg(privilege.grantee || ':' || privilege.privilege_type, ',' ORDER BY privilege.grantee, privilege.privilege_type) AS raw_grants
    FROM information_schema.role_table_grants privilege
    WHERE privilege.table_schema = 'public'
      AND privilege.table_name = expected_tables.object_name
      AND privilege.grantee IN ('PUBLIC', 'anon', 'authenticated')
  ) grants ON true
),
function_checks AS (
  SELECT
    2000 + row_number() OVER (ORDER BY expected_functions.function_identity) AS ord,
    'function security: ' || expected_functions.function_identity AS check_name,
    pg_catalog.concat(
      'identity=', COALESCE(function_row.oid::regprocedure::text, 'NULL'),
      '; config=', COALESCE(pg_catalog.array_to_string(function_row.proconfig, ','), 'NULL'),
      '; anon_exec=', COALESCE(pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE')::text, 'NULL'),
      '; authenticated_exec=', COALESCE(pg_catalog.has_function_privilege('authenticated', function_row.oid, 'EXECUTE')::text, 'NULL'),
      '; service_exec=', COALESCE(pg_catalog.has_function_privilege('service_role', function_row.oid, 'EXECUTE')::text, 'NULL')
    ) AS raw_value,
    CASE
      WHEN function_row.oid IS NOT NULL
       AND function_row.proconfig @> ARRAY['search_path=""']::text[]
       AND NOT pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE')
       AND NOT pg_catalog.has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
       AND (NOT expected_functions.service_callable OR pg_catalog.has_function_privilege('service_role', function_row.oid, 'EXECUTE'))
      THEN 'PASS' ELSE 'STOP'
    END AS verdict
  FROM expected_functions
  LEFT JOIN pg_catalog.pg_proc function_row
    ON function_row.oid = pg_catalog.to_regprocedure(expected_functions.function_identity)
),
trigger_checks AS (
  SELECT
    3000 + row_number() OVER (ORDER BY expected_triggers.table_name, expected_triggers.trigger_name) AS ord,
    'trigger installed: public.' || expected_triggers.table_name || '.' || expected_triggers.trigger_name AS check_name,
    COALESCE(existing.oid::text, 'NULL') AS raw_value,
    CASE WHEN existing.oid IS NOT NULL THEN 'PASS' ELSE 'STOP' END AS verdict
  FROM expected_triggers
  LEFT JOIN LATERAL (
    SELECT trigger_row.oid
    FROM pg_catalog.pg_trigger trigger_row
    JOIN pg_catalog.pg_class relation ON relation.oid = trigger_row.tgrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = expected_triggers.table_name
      AND trigger_row.tgname = expected_triggers.trigger_name
      AND NOT trigger_row.tgisinternal
  ) existing ON true
),
column_checks AS (
  SELECT
    4000 + row_number() OVER (ORDER BY expected_columns.column_name) AS ord,
    'M201 column installed: public.playbook_entries.' || expected_columns.column_name AS check_name,
    COALESCE(existing.data_type, 'NULL') AS raw_value,
    CASE WHEN existing.column_name IS NOT NULL THEN 'PASS' ELSE 'STOP' END AS verdict
  FROM expected_columns
  LEFT JOIN information_schema.columns existing
    ON existing.table_schema = 'public'
   AND existing.table_name = 'playbook_entries'
   AND existing.column_name = expected_columns.column_name
),
route_checks AS (
  SELECT
    5000 + row_number() OVER (ORDER BY route_path) AS ord,
    'deployed route dependencies installed: ' || route_path AS check_name,
    pg_catalog.string_agg(
      route_expectations.table_name || '=' || COALESCE(pg_catalog.to_regclass('public.' || route_expectations.table_name)::text, 'NULL'),
      ', ' ORDER BY route_expectations.table_name
    ) AS raw_value,
    CASE WHEN pg_catalog.bool_and(pg_catalog.to_regclass('public.' || route_expectations.table_name) IS NOT NULL)
      THEN 'PASS' ELSE 'STOP' END AS verdict
  FROM route_expectations
  GROUP BY route_path
),
special_checks AS (
  SELECT
    6001 AS ord,
    'M206 private media bucket installed with expected posture' AS check_name,
    pg_catalog.concat(
      'id=', COALESCE(bucket.id, 'NULL'),
      '; public=', COALESCE(bucket.public::text, 'NULL'),
      '; size=', COALESCE(bucket.file_size_limit::text, 'NULL'),
      '; mime=', COALESCE(pg_catalog.array_to_string(bucket.allowed_mime_types, ','), 'NULL')
    ) AS raw_value,
    CASE WHEN bucket.id = 'playbook-media'
       AND NOT bucket.public
       AND bucket.file_size_limit = 524288000
       AND bucket.allowed_mime_types @> ARRAY['video/mp4', 'video/webm']::text[]
       AND bucket.allowed_mime_types <@ ARRAY['video/mp4', 'video/webm']::text[]
      THEN 'PASS' ELSE 'STOP' END AS verdict
  FROM (SELECT 1) seed
  LEFT JOIN storage.buckets bucket ON bucket.id = 'playbook-media'
  UNION ALL
  SELECT
    6002,
    'M207 feature controls remain default-off and emergency-disabled',
    pg_catalog.concat(
      'rows=', pg_catalog.count(*),
      '; enabled=', pg_catalog.count(*) FILTER (WHERE control.enabled),
      '; emergency_cleared=', pg_catalog.count(*) FILTER (WHERE NOT control.emergency_disabled)
    ),
    CASE WHEN pg_catalog.count(*) = 6
       AND pg_catalog.count(*) FILTER (WHERE control.enabled) = 0
       AND pg_catalog.count(*) FILTER (WHERE NOT control.emergency_disabled) = 0
      THEN 'PASS' ELSE 'STOP' END
  FROM public.playbook_feature_controls control
)
SELECT ord, check_name, raw_value, verdict
FROM (
  SELECT * FROM table_checks
  UNION ALL SELECT * FROM function_checks
  UNION ALL SELECT * FROM trigger_checks
  UNION ALL SELECT * FROM column_checks
  UNION ALL SELECT * FROM route_checks
  UNION ALL SELECT * FROM special_checks
) checks
ORDER BY ord;
