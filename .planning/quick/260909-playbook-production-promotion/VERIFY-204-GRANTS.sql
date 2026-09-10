-- Read-only diagnosis for the migration 204 checkpoint stop.

SELECT
  grants.table_name,
  grants.grantee,
  string_agg(grants.privilege_type, ', ' ORDER BY grants.privilege_type)
    AS raw_privileges
FROM information_schema.role_table_grants grants
WHERE grants.table_schema = 'public'
  AND grants.table_name = ANY (ARRAY[
    'playbook_review_rounds',
    'playbook_review_threads',
    'playbook_review_messages',
    'playbook_review_mentions',
    'playbook_review_events',
    'playbook_review_round_events'
  ])
  AND grants.grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
GROUP BY grants.table_name, grants.grantee
ORDER BY grants.table_name, grants.grantee;
