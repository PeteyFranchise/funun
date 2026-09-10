-- Read-only checkpoint after migration 204.

WITH expected_tables(name) AS (
  SELECT unnest(ARRAY[
    'playbook_review_rounds',
    'playbook_review_threads',
    'playbook_review_messages',
    'playbook_review_mentions',
    'playbook_review_events',
    'playbook_review_round_events'
  ]::text[])
),
expected_functions(identity) AS (
  SELECT unnest(ARRAY[
    'public.prevent_playbook_review_history_mutation()',
    'public.protect_playbook_review_round_identity()',
    'public.protect_playbook_review_thread_identity()',
    'public.create_playbook_review_thread(uuid,uuid,uuid,text,integer,integer,text,integer,text,text,text,uuid[])',
    'public.reply_to_playbook_review_thread(uuid,uuid,text,uuid[])',
    'public.transition_playbook_review_thread(uuid,uuid,text,text)',
    'public.resubmit_playbook_review_round(uuid,uuid,uuid,integer)',
    'public.complete_playbook_review_round(uuid,uuid,integer,text)',
    'public.record_playbook_review_decision_summary(uuid,uuid,integer,text)',
    'public.complete_playbook_review_round_on_approval()'
  ]::text[])
),
expected_triggers(name) AS (
  SELECT unnest(ARRAY[
    'protect_playbook_review_messages',
    'protect_playbook_review_mentions',
    'protect_playbook_review_events',
    'protect_playbook_review_round_events',
    'protect_playbook_review_round_identity',
    'protect_playbook_review_thread_identity',
    'complete_playbook_review_round_after_approval'
  ]::text[])
)
SELECT
  (SELECT count(*) = 6
     FROM expected_tables
    WHERE to_regclass('public.' || name) IS NOT NULL) AS all_tables,
  (SELECT count(*) = 6
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
  (SELECT count(*) = 10
     FROM expected_functions
    WHERE to_regprocedure(identity) IS NOT NULL) AS all_functions,
  (SELECT count(*) = 7
     FROM expected_triggers expected
     JOIN pg_trigger trigger_row ON trigger_row.tgname = expected.name
    WHERE NOT trigger_row.tgisinternal) AS all_triggers;
