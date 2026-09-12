-- Read-only table-grant detail for migration 214 recovery. Function
-- privileges were verified separately; the CLI displays only the last result
-- set in a multi-statement file. This reads no application rows.

SELECT
  g.grantee,
  pg_catalog.string_agg(g.privilege_type::text, ', ' ORDER BY g.privilege_type::text) AS table_privileges
FROM information_schema.role_table_grants g
WHERE g.table_schema = 'public'
  AND g.table_name = 'verified_signup_invite_claims'
  AND g.grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
GROUP BY g.grantee
ORDER BY g.grantee;
