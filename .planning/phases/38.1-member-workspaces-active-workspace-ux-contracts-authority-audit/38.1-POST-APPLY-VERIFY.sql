-- Read-only structural verification after an owner applies 219 and 220.
WITH target_tables(name) AS (
  VALUES ('workspace_rights_proposals'), ('master_ownership_claims')
), target_functions(signature) AS (
  VALUES
    ('decide_workspace_rights_proposal(uuid,uuid,text)'),
    ('create_master_ownership_claim(uuid,uuid,uuid,text)'),
    ('decide_master_ownership_claim(uuid,uuid,text,uuid,text)'),
    ('workspace_master_claim_access(uuid,uuid,text)')
)
SELECT 10 AS ord, 'all' AS migration, 'Both migrations are registered' AS check_name,
  (SELECT count(*) = 2 FROM supabase_migrations.schema_migrations WHERE version IN ('219', '220')) AS ok,
  true AS blocking, 'Expected registered versions 219 and 220.' AS detail
UNION ALL
SELECT 20, 'all', 'Both ledgers exist with RLS',
  (SELECT count(*) = 2
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   JOIN target_tables t ON t.name = c.relname
   WHERE n.nspname = 'public' AND c.relrowsecurity),
  true, 'Both service ledgers must remain RLS-enabled.'
UNION ALL
SELECT 30, 'all', 'Browser and PUBLIC table privileges are absent',
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants g
    JOIN target_tables t ON t.name = g.table_name
    WHERE g.table_schema = 'public' AND g.grantee IN ('PUBLIC', 'anon', 'authenticated')
  ), true, 'No direct browser table privilege may exist.'
UNION ALL
SELECT 40, 'all', 'All target functions are hardened definers',
  (SELECT count(*) = 4
   FROM target_functions t
   JOIN pg_proc p ON p.oid = to_regprocedure('public.' || t.signature)
   WHERE p.prosecdef
     AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']::text[]),
  true, 'Every application function must be SECURITY DEFINER with an empty search path.'
UNION ALL
SELECT 50, 'all', 'Browser roles cannot execute target functions',
  NOT EXISTS (
    SELECT 1
    FROM target_functions t
    JOIN pg_proc p ON p.oid = to_regprocedure('public.' || t.signature)
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    WHERE acl.privilege_type = 'EXECUTE'
      AND (
        acl.grantee = 0
        OR pg_get_userbyid(acl.grantee) IN ('anon', 'authenticated')
      )
  ), true, 'Only service_role may execute the four target functions.'
UNION ALL
SELECT 55, 'all', 'Service role can execute target functions',
  (SELECT count(*) = 4
   FROM target_functions t
   WHERE has_function_privilege('service_role', 'public.' || t.signature, 'EXECUTE')),
  true, 'service_role must execute every application-facing function.'
UNION ALL
SELECT 60, '220', 'Evidence-derived access excludes clean masters',
  position('access_clean_masters' in pg_get_functiondef(to_regprocedure('public.workspace_master_claim_access(uuid,uuid,text)'))) = 0
    AND position('audio_path' in pg_get_functiondef(to_regprocedure('public.workspace_master_claim_access(uuid,uuid,text)'))) = 0
    AND position('file_url' in pg_get_functiondef(to_regprocedure('public.workspace_master_claim_access(uuid,uuid,text)'))) = 0,
  true, 'The D-08 resolver must not authorize or expose a clean master.'
UNION ALL
SELECT 70, '220', 'Unknown recording access fails closed',
  public.workspace_master_claim_access(
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'view_catalogue'
  ) = false,
  true, 'A missing claim must never grant access.'
ORDER BY ord;
