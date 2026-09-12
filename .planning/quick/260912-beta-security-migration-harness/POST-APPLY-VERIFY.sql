-- Read-only post-apply verification for human-gated migrations 214–217.
-- Every row must report ok=true. This file intentionally performs no writes.

WITH
target_functions(migration, signature) AS (
  VALUES
    ('214', 'public.complete_verified_signup_claim(uuid,text)'),
    ('215', 'public.claim_license_checkout(uuid,uuid,text,integer)'),
    ('215', 'public.finalize_license_checkout(uuid,uuid,text,text,text)'),
    ('215', 'public.release_license_checkout_claim(uuid,uuid)'),
    ('215', 'public.complete_license_checkout(uuid,text,text,text,integer,text,integer,text)'),
    ('216', 'public.claim_esign_mint(text,uuid,uuid,uuid,integer)'),
    ('216', 'public.record_esign_mint_provider(text,uuid,uuid,text,text)'),
    ('216', 'public.release_esign_mint_claim(text,uuid,uuid)'),
    ('216', 'public.complete_esign_mint_claim(text,uuid,uuid,text)'),
    ('217', 'public.mutate_playbook_feature_control(text,text,uuid,text,timestamp with time zone)'),
    ('217', 'public.open_playbook_incident(uuid,uuid,integer,text,integer,text,uuid,timestamp with time zone)'),
    ('217', 'public.change_playbook_incident_status(uuid,uuid,text,text,uuid,text)')
),
resolved_functions AS (
  SELECT f.migration, f.signature, to_regprocedure(f.signature) AS oid
    FROM target_functions f
),
target_columns(table_name, column_name, data_type) AS (
  VALUES
    ('license_requests', 'checkout_claim_token', 'uuid'),
    ('license_requests', 'checkout_claimed_at', 'timestamp with time zone'),
    ('license_requests', 'checkout_economics_fingerprint', 'text'),
    ('license_requests', 'stripe_checkout_economics_fingerprint', 'text'),
    ('license_requests', 'stripe_checkout_url', 'text')
),
checks(ord, migration, check_name, ok, blocking, detail) AS (
  SELECT 10, 'all', 'Migration ledger contains the complete ordered chain',
         (SELECT count(*) FROM supabase_migrations.schema_migrations
           WHERE version IN ('214', '215', '216', '217')) = 4,
         true, 'Expected registered versions: 214, 215, 216, 217.'
  UNION ALL
  SELECT 20, '214', 'Verified-claim ledger exists with RLS',
         COALESCE((
           SELECT c.relrowsecurity FROM pg_catalog.pg_class c
            WHERE c.oid = to_regclass('public.verified_signup_invite_claims')
         ), false),
         true, COALESCE(to_regclass('public.verified_signup_invite_claims')::text, 'missing')
  UNION ALL
  SELECT 30, '214', 'Verified-claim ledger has no browser grants',
         NOT EXISTS (
           SELECT 1 FROM information_schema.role_table_grants g
            WHERE g.table_schema = 'public'
              AND g.table_name = 'verified_signup_invite_claims'
              AND g.grantee IN ('PUBLIC', 'anon', 'authenticated')
         ),
         true, 'PUBLIC, anon, and authenticated must hold no table privilege.'
  UNION ALL
  SELECT 35, '214', 'Verified-claim ledger is append-only to service_role',
         COALESCE((
           SELECT array_agg(g.privilege_type::text ORDER BY g.privilege_type::text)
             FROM information_schema.role_table_grants g
            WHERE g.table_schema = 'public'
              AND g.table_name = 'verified_signup_invite_claims'
              AND g.grantee = 'service_role'
         ), ARRAY[]::text[]) = ARRAY['INSERT', 'SELECT']::text[],
         true, 'service_role must hold INSERT and SELECT only.'
  UNION ALL
  SELECT 40, '215', 'Checkout columns exist with expected types',
         NOT EXISTS (
           SELECT 1 FROM target_columns t
            WHERE NOT EXISTS (
              SELECT 1 FROM information_schema.columns c
               WHERE c.table_schema = 'public'
                 AND c.table_name = t.table_name
                 AND c.column_name = t.column_name
                 AND c.data_type = t.data_type
            )
         ),
         true, 'Five checkout claim/reconciliation columns are required.'
  UNION ALL
  SELECT 50, '215', 'Payment status constraint contains the leased state',
         EXISTS (
           SELECT 1 FROM pg_catalog.pg_constraint c
            WHERE c.conname = 'license_requests_payment_status_check'
              AND c.conrelid = to_regclass('public.license_requests')
              AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%creating_payment%'
         ),
         true, 'license_requests_payment_status_check must include creating_payment.'
  UNION ALL
  SELECT 60, '216', 'E-sign claim ledger exists with RLS',
         COALESCE((
           SELECT c.relrowsecurity FROM pg_catalog.pg_class c
            WHERE c.oid = to_regclass('public.esign_mint_claims')
         ), false),
         true, COALESCE(to_regclass('public.esign_mint_claims')::text, 'missing')
  UNION ALL
  SELECT 70, '216', 'E-sign claim ledger has no browser grants',
         NOT EXISTS (
           SELECT 1 FROM information_schema.role_table_grants g
            WHERE g.table_schema = 'public'
              AND g.table_name = 'esign_mint_claims'
              AND g.grantee IN ('PUBLIC', 'anon', 'authenticated')
         ),
         true, 'PUBLIC, anon, and authenticated must hold no table privilege.'
  UNION ALL
  SELECT 75, '216', 'E-sign claim ledger has only required service privileges',
         COALESCE((
           SELECT array_agg(g.privilege_type::text ORDER BY g.privilege_type::text)
             FROM information_schema.role_table_grants g
            WHERE g.table_schema = 'public'
              AND g.table_name = 'esign_mint_claims'
              AND g.grantee = 'service_role'
         ), ARRAY[]::text[]) = ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[],
         true, 'service_role must not inherit REFERENCES, TRIGGER, or TRUNCATE.'
  UNION ALL
  SELECT 80, '216', 'Both e-sign uniqueness barriers exist',
         EXISTS (
           SELECT 1 FROM pg_catalog.pg_index i
            WHERE i.indexrelid = to_regclass('public.idx_esign_envelopes_one_active_per_sheet')
              AND i.indisunique
         )
           AND EXISTS (
             SELECT 1 FROM pg_catalog.pg_index i
              WHERE i.indexrelid = to_regclass('public.idx_vault_documents_one_blanket_agreement')
                AND i.indisunique
           ),
         true, 'Both indexes must exist and be unique.'
  UNION ALL
  SELECT 90, 'all', 'Every target function exists',
         NOT EXISTS (SELECT 1 FROM resolved_functions f WHERE f.oid IS NULL),
         true,
         COALESCE((
           SELECT string_agg(f.signature, ', ' ORDER BY f.signature)
             FROM resolved_functions f WHERE f.oid IS NULL
         ), 'all present')
  UNION ALL
  SELECT 100, 'all', 'Every target function is a hardened definer',
         NOT EXISTS (
           SELECT 1 FROM resolved_functions f
           LEFT JOIN pg_catalog.pg_proc p ON p.oid = f.oid
            WHERE f.oid IS NULL
               OR NOT p.prosecdef
               OR NOT EXISTS (
                 SELECT 1
                   FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg(value)
                  WHERE cfg.value IN ('search_path=', 'search_path=""')
               )
         ),
         true, 'SECURITY DEFINER and exact empty search_path are required.'
  UNION ALL
  SELECT 110, 'all', 'Browser roles cannot execute target functions',
         NOT EXISTS (
           SELECT 1 FROM resolved_functions f
           LEFT JOIN pg_catalog.pg_proc p ON p.oid = f.oid
           CROSS JOIN LATERAL pg_catalog.aclexplode(
             COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
           ) a
           LEFT JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
            WHERE f.oid IS NULL
               OR (
                 a.privilege_type = 'EXECUTE'
                 AND (a.grantee = 0 OR r.rolname IN ('anon', 'authenticated'))
               )
         ),
         true, 'PUBLIC, anon, and authenticated must not execute these definers.'
  UNION ALL
  SELECT 120, 'all', 'Service role can execute every target function',
         NOT EXISTS (
           SELECT 1 FROM resolved_functions f
            WHERE f.oid IS NULL
               OR NOT has_function_privilege('service_role', f.oid, 'EXECUTE')
         ),
         true, 'Every application-facing definer is service-role-only.'
  UNION ALL
  SELECT 130, '214', 'Invite claim remains verification-bound and token-bound',
         EXISTS (
           SELECT 1 FROM resolved_functions f
            WHERE f.signature = 'public.complete_verified_signup_claim(uuid,text)'
              AND f.oid IS NOT NULL
              AND pg_catalog.pg_get_functiondef(f.oid) LIKE '%email_confirmed_at IS NOT NULL%'
              AND pg_catalog.pg_get_functiondef(f.oid) LIKE '%token_hash%'
         ),
         true, 'Function definition must re-read verified email and persist only a token hash.'
  UNION ALL
  SELECT 140, '215', 'Checkout claim remains lock- and fingerprint-bound',
         EXISTS (
           SELECT 1 FROM resolved_functions f
            WHERE f.signature = 'public.claim_license_checkout(uuid,uuid,text,integer)'
              AND f.oid IS NOT NULL
              AND pg_catalog.pg_get_functiondef(f.oid) LIKE '%FOR NO KEY UPDATE%'
              AND pg_catalog.pg_get_functiondef(f.oid) LIKE '%checkout_economics_fingerprint%'
         ),
         true, 'Checkout admission must serialize and bind economics.'
  UNION ALL
  SELECT 150, '216', 'E-sign claim remains reconciliation-safe',
         EXISTS (
           SELECT 1 FROM resolved_functions f
            WHERE f.signature = 'public.claim_esign_mint(text,uuid,uuid,uuid,integer)'
              AND f.oid IS NOT NULL
              AND pg_catalog.pg_get_functiondef(f.oid) LIKE '%provider_request_id IS NOT NULL%'
              AND pg_catalog.pg_get_functiondef(f.oid) LIKE '%reconcile%'
         ),
         true, 'Provider-created instruments must block automatic remint.'
  UNION ALL
  SELECT 160, '217', 'Playbook mutation remains compare-and-swap guarded',
         EXISTS (
           SELECT 1 FROM resolved_functions f
            WHERE f.signature = 'public.mutate_playbook_feature_control(text,text,uuid,text,timestamp with time zone)'
              AND f.oid IS NOT NULL
              AND pg_catalog.pg_get_functiondef(f.oid) LIKE '%updated_at = p_expected_updated_at%'
         ),
         true, 'Feature mutation must reject a stale expected timestamp.'
)
SELECT ord, migration, check_name, ok, blocking, detail
  FROM checks
 ORDER BY ord;
