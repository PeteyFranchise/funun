-- Read-only grant diagnosis for the Playbook tables applied so far.

SELECT
  grants.table_name,
  grants.grantee,
  string_agg(grants.privilege_type, ', ' ORDER BY grants.privilege_type)
    AS raw_privileges
FROM information_schema.role_table_grants grants
WHERE grants.table_schema = 'public'
  AND grants.table_name = ANY (ARRAY[
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
  ])
  AND grants.grantee IN ('PUBLIC', 'anon', 'authenticated')
GROUP BY grants.table_name, grants.grantee
ORDER BY grants.table_name, grants.grantee;
