-- Read-only definition-level recovery verification for a directly applied,
-- unregistered migration 214. Every row must report ok=true before the owner
-- may register 214 in the migration ledger.

WITH objects AS (
  SELECT
    to_regprocedure('public.handle_new_user()') AS handle_oid,
    to_regprocedure('public.complete_verified_signup_claim(uuid,text)') AS claim_oid
), definitions AS (
  SELECT
    pg_catalog.pg_get_functiondef(handle_oid) AS handle_definition,
    pg_catalog.pg_get_functiondef(claim_oid) AS claim_definition
  FROM objects
), checks(ord, check_name, ok, detail) AS (
  SELECT 10, 'Migration 214 remains unregistered',
         NOT EXISTS (
           SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '214'
         ),
         'The recovery verifier applies only to APPLIED_UNREGISTERED state.'
  UNION ALL
  SELECT 20, 'Verified-claim ledger has exact columns and RLS',
         to_regclass('public.verified_signup_invite_claims') IS NOT NULL
           AND COALESCE((
             SELECT c.relrowsecurity FROM pg_catalog.pg_class c
             WHERE c.oid = to_regclass('public.verified_signup_invite_claims')
           ), false)
           AND 6 = (
             SELECT count(*) FROM information_schema.columns c
             WHERE c.table_schema = 'public'
               AND c.table_name = 'verified_signup_invite_claims'
               AND c.column_name IN ('id', 'user_id', 'source', 'invite_id', 'token_hash', 'claimed_at')
           )
           AND 6 = (
             SELECT count(*) FROM information_schema.columns c
             WHERE c.table_schema = 'public' AND c.table_name = 'verified_signup_invite_claims'
           ),
         'Expected six-column, RLS-enabled service ledger.'
  UNION ALL
  SELECT 30, 'Verified-claim ledger privileges are least-privilege',
         NOT EXISTS (
           SELECT 1 FROM information_schema.role_table_grants g
           WHERE g.table_schema = 'public'
             AND g.table_name = 'verified_signup_invite_claims'
             AND g.grantee IN ('PUBLIC', 'anon', 'authenticated')
         )
           AND COALESCE((
             SELECT array_agg(g.privilege_type::text ORDER BY g.privilege_type::text)
             FROM information_schema.role_table_grants g
             WHERE g.table_schema = 'public'
               AND g.table_name = 'verified_signup_invite_claims'
               AND g.grantee = 'service_role'
           ), ARRAY[]::text[]) = ARRAY['INSERT', 'SELECT']::text[],
         'Browser roles hold nothing; service_role holds INSERT and SELECT only.'
  UNION ALL
  SELECT 40, 'Signup trigger function is hardened and non-claiming',
         EXISTS (
           SELECT 1 FROM objects o
           JOIN pg_catalog.pg_proc p ON p.oid = o.handle_oid
           WHERE p.prosecdef
             AND EXISTS (
               SELECT 1
                 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg(value)
                WHERE cfg.value IN ('search_path=', 'search_path=""')
             )
         )
           AND NOT EXISTS (
             SELECT 1
               FROM objects o
               JOIN pg_catalog.pg_proc p ON p.oid = o.handle_oid
               CROSS JOIN LATERAL pg_catalog.aclexplode(
                 COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
               ) AS acl
              WHERE acl.grantee = 0
                AND acl.privilege_type = 'EXECUTE'
           )
           AND NOT has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
           AND NOT has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE')
           AND NOT has_function_privilege('service_role', 'public.handle_new_user()', 'EXECUTE')
           AND (SELECT handle_definition LIKE '%signup_invite_token%' FROM definitions)
           AND (SELECT handle_definition LIKE '%invalid_invite%' FROM definitions)
           AND NOT (SELECT handle_definition LIKE '%PERFORM public.claim_collaborators%' FROM definitions)
           AND NOT (SELECT handle_definition LIKE '%UPDATE public.artist_invites%' FROM definitions)
           AND NOT (SELECT handle_definition LIKE '%UPDATE public.collaborator_invites%' FROM definitions),
         'Trigger validates an exact invite but performs no acceptance or collaborator claim.'
  UNION ALL
  SELECT 50, 'Auth users trigger still invokes handle_new_user',
         EXISTS (
           SELECT 1 FROM pg_catalog.pg_trigger t
           WHERE t.tgrelid = 'auth.users'::regclass
             AND t.tgfoid = to_regprocedure('public.handle_new_user()')
             AND NOT t.tgisinternal
             AND t.tgenabled <> 'D'
         ),
         'The enabled auth.users trigger must still target public.handle_new_user().'
  UNION ALL
  SELECT 60, 'Verified claim function is hardened and service-only',
         EXISTS (
           SELECT 1 FROM objects o
           JOIN pg_catalog.pg_proc p ON p.oid = o.claim_oid
           WHERE p.prosecdef
             AND EXISTS (
               SELECT 1
                 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg(value)
                WHERE cfg.value IN ('search_path=', 'search_path=""')
             )
         )
           AND NOT EXISTS (
             SELECT 1
               FROM objects o
               JOIN pg_catalog.pg_proc p ON p.oid = o.claim_oid
               CROSS JOIN LATERAL pg_catalog.aclexplode(
                 COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
               ) AS acl
              WHERE acl.grantee = 0
                AND acl.privilege_type = 'EXECUTE'
           )
           AND NOT has_function_privilege('anon', 'public.complete_verified_signup_claim(uuid,text)', 'EXECUTE')
           AND NOT has_function_privilege('authenticated', 'public.complete_verified_signup_claim(uuid,text)', 'EXECUTE')
           AND has_function_privilege('service_role', 'public.complete_verified_signup_claim(uuid,text)', 'EXECUTE'),
         'Only service_role may execute the hardened definer.'
  UNION ALL
  SELECT 70, 'Verified claim remains token-, email-, and lock-bound',
         (SELECT claim_definition LIKE '%email_confirmed_at IS NOT NULL%' FROM definitions)
           AND (SELECT claim_definition LIKE '%token_hash%' FROM definitions)
           AND (SELECT claim_definition LIKE '%FOR UPDATE%' FROM definitions)
           AND (SELECT claim_definition LIKE '%signup_invite_token%' FROM definitions)
           AND (SELECT claim_definition LIKE '%claim_collaborators%' FROM definitions),
         'The claim re-reads verified auth state, locks the invite, hashes the token, and claims collaborators.'
)
SELECT ord, check_name, ok, detail
FROM checks
ORDER BY ord;
