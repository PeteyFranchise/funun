-- Funūn Playbook migrations 201, 202, 204, 205, 206, 207
-- OWNER-RUN READ-ONLY PRE-APPLY GATE.
-- Run this single statement in the production Supabase SQL Editor before any
-- Playbook migration. Apply nothing unless every verdict is PASS.

WITH
expected_relations(migration_number, object_kind, object_name) AS (
  VALUES
    (201, 'table', 'playbook_entry_revisions'),
    (201, 'table', 'playbook_entry_game_plan_links'),
    (201, 'table', 'playbook_review_reminders'),
    (202, 'table', 'playbook_reading_assignments'),
    (202, 'table', 'playbook_reading_acknowledgements'),
    (202, 'table', 'playbook_reading_reminders'),
    (204, 'table', 'playbook_review_rounds'),
    (204, 'table', 'playbook_review_threads'),
    (204, 'table', 'playbook_review_messages'),
    (204, 'table', 'playbook_review_mentions'),
    (204, 'table', 'playbook_review_events'),
    (204, 'table', 'playbook_review_round_events'),
    (205, 'table', 'playbook_change_broadcasts'),
    (205, 'table', 'playbook_change_broadcast_reads'),
    (206, 'table', 'playbook_media_assets'),
    (206, 'table', 'playbook_learning_paths'),
    (206, 'table', 'playbook_learning_path_steps'),
    (206, 'table', 'playbook_learning_assignments'),
    (206, 'table', 'playbook_learning_step_completions'),
    (206, 'table', 'playbook_knowledge_attempts'),
    (206, 'table', 'playbook_reader_feedback'),
    (206, 'table', 'playbook_reader_feedback_events'),
    (206, 'table', 'playbook_assistant_runs'),
    (206, 'table', 'playbook_workflow_templates'),
    (206, 'table', 'playbook_workflow_template_steps'),
    (206, 'table', 'playbook_workflow_runs'),
    (206, 'table', 'playbook_workflow_run_tasks'),
    (206, 'table', 'playbook_exceptions'),
    (206, 'table', 'playbook_exception_events'),
    (206, 'table', 'playbook_incidents'),
    (206, 'table', 'playbook_incident_tasks'),
    (206, 'table', 'playbook_incident_events'),
    (206, 'table', 'playbook_entry_translations'),
    (206, 'table', 'playbook_glossary_terms'),
    (206, 'table', 'playbook_user_preferences'),
    (207, 'table', 'playbook_feature_controls'),
    (207, 'table', 'playbook_beta_cohorts'),
    (207, 'table', 'playbook_beta_cohort_members'),
    (207, 'table', 'playbook_feature_cohort_grants'),
    (207, 'table', 'playbook_feature_control_events'),
    (207, 'table', 'playbook_sla_rules'),
    (207, 'table', 'playbook_doctrine_dependencies'),
    (207, 'table', 'playbook_simulation_scenarios'),
    (207, 'table', 'playbook_simulation_assignments'),
    (207, 'table', 'playbook_simulation_attempts'),
    (207, 'table', 'playbook_certifications'),
    (207, 'table', 'playbook_simulation_events'),
    (207, 'table', 'playbook_operational_links'),
    (207, 'table', 'playbook_operational_link_events'),
    (201, 'index', 'idx_playbook_entries_room_slug'),
    (201, 'index', 'idx_playbook_entries_adopted_source'),
    (201, 'index', 'idx_playbook_entries_room_sort'),
    (201, 'index', 'idx_playbook_entries_pending_drafts'),
    (201, 'index', 'idx_playbook_entries_review_due'),
    (201, 'index', 'idx_playbook_game_plan_links_template'),
    (202, 'index', 'idx_playbook_reading_assignment_active_user'),
    (202, 'index', 'idx_playbook_reading_assignment_active_role'),
    (202, 'index', 'idx_playbook_reading_assignments_entry'),
    (202, 'index', 'idx_playbook_reading_ack_user'),
    (204, 'index', 'idx_playbook_review_rounds_queue'),
    (204, 'index', 'idx_playbook_review_rounds_entry'),
    (204, 'index', 'idx_playbook_review_threads_entry_open'),
    (204, 'index', 'idx_playbook_review_threads_author'),
    (204, 'index', 'idx_playbook_review_messages_thread'),
    (204, 'index', 'idx_playbook_review_mentions_user'),
    (204, 'index', 'idx_playbook_review_events_thread'),
    (204, 'index', 'idx_playbook_review_round_events_round'),
    (205, 'index', 'idx_playbook_change_broadcasts_feed'),
    (205, 'index', 'idx_playbook_change_broadcasts_room'),
    (205, 'index', 'idx_playbook_change_broadcasts_role'),
    (205, 'index', 'idx_playbook_change_broadcasts_user'),
    (205, 'index', 'idx_playbook_change_broadcast_all_team_unique'),
    (205, 'index', 'idx_playbook_change_broadcast_role_unique'),
    (205, 'index', 'idx_playbook_change_broadcast_user_unique'),
    (205, 'index', 'idx_playbook_change_broadcast_reads_user'),
    (206, 'index', 'idx_playbook_learning_assignments_user'),
    (206, 'index', 'idx_playbook_learning_assignments_role'),
    (206, 'index', 'idx_playbook_feedback_queue'),
    (206, 'index', 'idx_playbook_workflow_runs_owner'),
    (206, 'index', 'idx_playbook_exceptions_queue'),
    (206, 'index', 'idx_playbook_incidents_active'),
    (206, 'index', 'idx_playbook_assistant_usage'),
    (207, 'index', 'idx_playbook_cohort_members_active'),
    (207, 'index', 'idx_playbook_feature_grants_active'),
    (207, 'index', 'idx_playbook_sla_active'),
    (207, 'index', 'playbook_sla_rules_scope_unique'),
    (207, 'index', 'idx_playbook_dependency_source'),
    (207, 'index', 'idx_playbook_dependency_target'),
    (207, 'index', 'idx_playbook_sim_assignment_user'),
    (207, 'index', 'idx_playbook_sim_assignment_role'),
    (207, 'index', 'idx_playbook_sim_attempt_review'),
    (207, 'index', 'idx_playbook_certification_user'),
    (207, 'index', 'idx_playbook_operational_entity')
),
expected_functions(migration_number, function_identity, service_callable) AS (
  VALUES
    (201, 'public.enqueue_due_playbook_review_reminders(integer)', true),
    (201, 'public.set_playbook_entry_metadata(uuid,uuid,timestamp with time zone,integer,jsonb,uuid,boolean)', true),
    (201, 'public.prepare_playbook_entry_publication()', false),
    (201, 'public.capture_playbook_entry_revision()', false),
    (202, 'public.enqueue_playbook_reading_reminders(integer)', true),
    (204, 'public.prevent_playbook_review_history_mutation()', false),
    (204, 'public.protect_playbook_review_round_identity()', false),
    (204, 'public.protect_playbook_review_thread_identity()', false),
    (204, 'public.create_playbook_review_thread(uuid,uuid,uuid,text,integer,integer,text,integer,text,text,text,uuid[])', true),
    (204, 'public.reply_to_playbook_review_thread(uuid,uuid,text,uuid[])', true),
    (204, 'public.transition_playbook_review_thread(uuid,uuid,text,text)', true),
    (204, 'public.resubmit_playbook_review_round(uuid,uuid,uuid,integer)', true),
    (204, 'public.complete_playbook_review_round(uuid,uuid,integer,text)', true),
    (204, 'public.record_playbook_review_decision_summary(uuid,uuid,integer,text)', true),
    (204, 'public.complete_playbook_review_round_on_approval()', false),
    (205, 'public.prevent_playbook_change_broadcast_mutation()', false),
    (205, 'public.publish_playbook_change_broadcast(uuid,uuid,integer,text,text,text,text,text,text,text,uuid,timestamp with time zone,boolean,timestamp with time zone,uuid,uuid[])', true),
    (206, 'public.prevent_playbook_enablement_event_mutation()', false),
    (207, 'public.review_playbook_simulation_attempt(uuid,uuid,integer,boolean,text)', true),
    (207, 'public.link_playbook_operational_record(uuid,uuid,text,text,text,text,uuid)', true),
    (207, 'public.prevent_playbook_operational_event_mutation()', false)
),
expected_triggers(migration_number, trigger_name, table_name, replacement_allowed) AS (
  VALUES
    (201, 'prepare_playbook_entry_publication', 'playbook_entries', true),
    (201, 'capture_playbook_entry_revision', 'playbook_entries', true),
    (202, 'playbook_reading_assignments_updated_at', 'playbook_reading_assignments', false),
    (204, 'protect_playbook_review_messages', 'playbook_review_messages', false),
    (204, 'protect_playbook_review_mentions', 'playbook_review_mentions', false),
    (204, 'protect_playbook_review_events', 'playbook_review_events', false),
    (204, 'protect_playbook_review_round_events', 'playbook_review_round_events', false),
    (204, 'protect_playbook_review_round_identity', 'playbook_review_rounds', false),
    (204, 'protect_playbook_review_thread_identity', 'playbook_review_threads', false),
    (204, 'complete_playbook_review_round_after_approval', 'playbook_entries', false),
    (205, 'protect_playbook_change_broadcast_history', 'playbook_change_broadcasts', false),
    (206, 'protect_playbook_feedback_events', 'playbook_reader_feedback_events', false),
    (206, 'protect_playbook_exception_events', 'playbook_exception_events', false),
    (206, 'protect_playbook_incident_events', 'playbook_incident_events', false),
    (207, 'protect_playbook_feature_events', 'playbook_feature_control_events', false),
    (207, 'protect_playbook_simulation_events', 'playbook_simulation_events', false),
    (207, 'protect_playbook_operational_link_events', 'playbook_operational_link_events', false)
),
expected_columns(column_name) AS (
  VALUES
    ('slug'), ('sort_order'), ('published_at'), ('revision_number'),
    ('draft_author_id'), ('draft_updated_at'), ('draft_version'), ('source_kind'),
    ('source_path'), ('source_hash'), ('draft_source_hash'), ('adopted_at'),
    ('owner_id'), ('review_due_at'), ('review_interval_days'),
    ('last_reviewed_at'), ('last_reviewed_by')
),
expected_migration_numbers(version) AS (
  VALUES ('201'), ('202'), ('203'), ('204'), ('205'), ('206'), ('207')
),
expected_new_constraints(table_name, constraint_name) AS (
  VALUES
    ('playbook_entries', 'playbook_entries_source_kind_check'),
    ('playbook_entries', 'playbook_entries_revision_positive_check'),
    ('playbook_entries', 'playbook_entries_draft_version_nonnegative_check'),
    ('playbook_entries', 'playbook_entries_review_interval_check'),
    ('playbook_sub_groups', 'playbook_sub_groups_id_room_unique'),
    ('playbook_entries', 'playbook_entries_subgroup_same_room_fk')
),
prerequisite_relations(object_identity) AS (
  VALUES
    ('public.playbook_rooms'),
    ('public.playbook_room_role_grants'),
    ('public.playbook_sub_groups'),
    ('public.playbook_entries'),
    ('public.member_game_plan_templates'),
    ('public.notifications'),
    ('public.funun_staff'),
    ('auth.users'),
    ('storage.buckets')
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
relation_checks AS (
  SELECT
    1000 + row_number() OVER (ORDER BY migration_number, object_kind, object_name) AS ord,
    'M' || migration_number || ' ' || object_kind || ' is free: public.' || object_name AS check_name,
    COALESCE(pg_catalog.to_regclass('public.' || object_name)::text, 'NULL') AS raw_value,
    CASE WHEN pg_catalog.to_regclass('public.' || object_name) IS NULL THEN 'PASS' ELSE 'STOP' END AS verdict
  FROM expected_relations
),
table_namespace_residue_checks AS (
  SELECT
    1800 + row_number() OVER (ORDER BY expected_relations.object_name) AS ord,
    'no relation residue for new table namespace: public.' || expected_relations.object_name AS check_name,
    COALESCE(pg_catalog.string_agg(relation.relkind::text || ':' || relation.relname, ', ' ORDER BY relation.relname), 'none') AS raw_value,
    CASE WHEN pg_catalog.count(relation.oid) = 0 THEN 'PASS' ELSE 'STOP' END AS verdict
  FROM expected_relations
  LEFT JOIN pg_catalog.pg_namespace namespace ON namespace.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class relation
    ON relation.relnamespace = namespace.oid
   AND (relation.relname = expected_relations.object_name OR relation.relname LIKE expected_relations.object_name || '\_%' ESCAPE '\')
  WHERE expected_relations.object_kind = 'table'
  GROUP BY expected_relations.object_name
),
table_type_checks AS (
  SELECT
    1900 + row_number() OVER (ORDER BY expected_relations.object_name) AS ord,
    'composite type name is free: public.' || expected_relations.object_name AS check_name,
    COALESCE(type_row.oid::text, 'NULL') AS raw_value,
    CASE WHEN type_row.oid IS NULL THEN 'PASS' ELSE 'STOP' END AS verdict
  FROM expected_relations
  LEFT JOIN pg_catalog.pg_namespace namespace ON namespace.nspname = 'public'
  LEFT JOIN pg_catalog.pg_type type_row
    ON type_row.typnamespace = namespace.oid
   AND type_row.typname = expected_relations.object_name
  WHERE expected_relations.object_kind = 'table'
),
function_checks AS (
  SELECT
    2000 + row_number() OVER (ORDER BY migration_number, function_identity) AS ord,
    'M' || migration_number || ' function is free: ' || function_identity AS check_name,
    COALESCE(pg_catalog.to_regprocedure(function_identity)::text, 'NULL') AS raw_value,
    CASE WHEN pg_catalog.to_regprocedure(function_identity) IS NULL THEN 'PASS' ELSE 'STOP' END AS verdict
  FROM expected_functions
),
trigger_checks AS (
  SELECT
    3000 + row_number() OVER (ORDER BY migration_number, table_name, trigger_name) AS ord,
    'M' || migration_number || ' trigger name: public.' || table_name || '.' || trigger_name AS check_name,
    CASE WHEN existing.oid IS NULL THEN 'NULL' ELSE existing.oid::text END AS raw_value,
    CASE WHEN existing.oid IS NULL OR expected_triggers.replacement_allowed THEN 'PASS' ELSE 'STOP' END AS verdict
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
    'M201 column is free: public.playbook_entries.' || expected_columns.column_name AS check_name,
    COALESCE(existing.data_type, 'NULL') AS raw_value,
    CASE WHEN existing.column_name IS NULL THEN 'PASS' ELSE 'STOP' END AS verdict
  FROM expected_columns
  LEFT JOIN information_schema.columns existing
    ON existing.table_schema = 'public'
   AND existing.table_name = 'playbook_entries'
   AND existing.column_name = expected_columns.column_name
),
constraint_checks AS (
  SELECT
    5000 + row_number() OVER (ORDER BY expected_new_constraints.table_name, expected_new_constraints.constraint_name) AS ord,
    'M201 constraint is free: public.' || expected_new_constraints.table_name || '.' || expected_new_constraints.constraint_name AS check_name,
    COALESCE(existing.oid::text, 'NULL') AS raw_value,
    CASE WHEN existing.oid IS NULL THEN 'PASS' ELSE 'STOP' END AS verdict
  FROM expected_new_constraints
  LEFT JOIN LATERAL (
    SELECT constraint_row.oid
    FROM pg_catalog.pg_constraint constraint_row
    JOIN pg_catalog.pg_class relation ON relation.oid = constraint_row.conrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = expected_new_constraints.table_name
      AND constraint_row.conname = expected_new_constraints.constraint_name
  ) existing ON true
),
prerequisite_checks AS (
  SELECT
    6000 + row_number() OVER (ORDER BY object_identity) AS ord,
    'prerequisite relation exists: ' || object_identity AS check_name,
    COALESCE(pg_catalog.to_regclass(object_identity)::text, 'NULL') AS raw_value,
    CASE WHEN pg_catalog.to_regclass(object_identity) IS NOT NULL THEN 'PASS' ELSE 'STOP' END AS verdict
  FROM prerequisite_relations
  UNION ALL
  SELECT
    6099,
    'prerequisite function exists: public.update_updated_at()',
    COALESCE(pg_catalog.to_regprocedure('public.update_updated_at()')::text, 'NULL'),
    CASE WHEN pg_catalog.to_regprocedure('public.update_updated_at()') IS NOT NULL THEN 'PASS' ELSE 'STOP' END
),
route_checks AS (
  SELECT
    7000 + row_number() OVER (ORDER BY route_path) AS ord,
    'deployed route maps only to promoted tables: ' || route_path AS check_name,
    pg_catalog.string_agg(
      route_expectations.table_name || '=' || COALESCE(pg_catalog.to_regclass('public.' || route_expectations.table_name)::text, 'NULL'),
      ', ' ORDER BY route_expectations.table_name
    ) AS raw_value,
    CASE WHEN pg_catalog.bool_and(
      expected_relations.object_name IS NOT NULL
      AND expected_relations.object_kind = 'table'
      AND pg_catalog.to_regclass('public.' || route_expectations.table_name) IS NULL
    ) THEN 'PASS' ELSE 'STOP' END AS verdict
  FROM route_expectations
  LEFT JOIN expected_relations
    ON expected_relations.object_kind = 'table'
   AND expected_relations.object_name = route_expectations.table_name
  GROUP BY route_path
),
special_checks AS (
  SELECT
    8001 AS ord,
    'M206 storage bucket id is free: playbook-media' AS check_name,
    COALESCE((SELECT bucket.id FROM storage.buckets bucket WHERE bucket.id = 'playbook-media'), 'NULL') AS raw_value,
    CASE WHEN NOT EXISTS (SELECT 1 FROM storage.buckets bucket WHERE bucket.id = 'playbook-media') THEN 'PASS' ELSE 'STOP' END AS verdict
  UNION ALL
  SELECT
    8002,
    'retired migration number 203 has no public objects with playbook prefix marker',
    pg_catalog.count(*)::text,
    CASE WHEN pg_catalog.count(*) = 0 THEN 'PASS' ELSE 'STOP' END
  FROM pg_catalog.pg_class relation
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public' AND relation.relname LIKE '203\_%' ESCAPE '\'
),
migration_history_checks AS (
  SELECT
    9000 + row_number() OVER (ORDER BY expected_migration_numbers.version) AS ord,
    'migration ledger version is free: ' || expected_migration_numbers.version AS check_name,
    COALESCE(history.version, 'NULL') AS raw_value,
    CASE WHEN history.version IS NULL THEN 'PASS' ELSE 'STOP' END AS verdict
  FROM expected_migration_numbers
  LEFT JOIN supabase_migrations.schema_migrations history
    ON history.version::text = expected_migration_numbers.version
)
SELECT ord, check_name, raw_value, verdict
FROM (
  SELECT * FROM relation_checks
  UNION ALL SELECT * FROM table_namespace_residue_checks
  UNION ALL SELECT * FROM table_type_checks
  UNION ALL SELECT * FROM function_checks
  UNION ALL SELECT * FROM trigger_checks
  UNION ALL SELECT * FROM column_checks
  UNION ALL SELECT * FROM constraint_checks
  UNION ALL SELECT * FROM prerequisite_checks
  UNION ALL SELECT * FROM route_checks
  UNION ALL SELECT * FROM special_checks
  UNION ALL SELECT * FROM migration_history_checks
) checks
ORDER BY ord;
