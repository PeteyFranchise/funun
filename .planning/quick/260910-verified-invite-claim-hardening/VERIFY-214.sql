-- Read-only post-apply verification for migration 214.
-- Run only after the owner has approved and applied the migration.

SELECT
  to_regclass('public.verified_signup_invite_claims') IS NOT NULL AS claims_table,
  to_regprocedure('public.complete_verified_signup_claim(uuid,text)') IS NOT NULL AS claim_function,
  COALESCE((
    SELECT relrowsecurity
      FROM pg_class
     WHERE oid = to_regclass('public.verified_signup_invite_claims')
  ), false) AS rls_enabled,
  NOT EXISTS (
    SELECT 1
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name = 'verified_signup_invite_claims'
       AND grantee IN ('anon', 'authenticated', 'PUBLIC')
  ) AS no_browser_table_grants,
  NOT has_function_privilege(
    'anon',
    'public.complete_verified_signup_claim(uuid,text)',
    'EXECUTE'
  ) AS anon_cannot_execute,
  NOT has_function_privilege(
    'authenticated',
    'public.complete_verified_signup_claim(uuid,text)',
    'EXECUTE'
  ) AS authenticated_cannot_execute,
  has_function_privilege(
    'service_role',
    'public.complete_verified_signup_claim(uuid,text)',
    'EXECUTE'
  ) AS service_role_can_execute,
  public.complete_verified_signup_claim(
    '00000000-0000-0000-0000-000000000000'::uuid,
    NULL
  ) = false AS nonexistent_user_fails_closed;
