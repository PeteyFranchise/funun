-- Read-only production reconciliation for migrations 199 and 200.
-- One row per check; raw values accompany every verdict.

WITH target_functions AS (
  SELECT
    to_regprocedure(
      'public.workspace_redeem_invitation(uuid,text,text,boolean)'
    ) AS redeem_oid,
    to_regprocedure(
      'public.apply_to_opportunity_atomic(uuid,uuid,uuid,text)'
    ) AS apply_oid
),
function_facts AS (
  SELECT
    t.redeem_oid,
    t.apply_oid,
    redeem.prosrc AS redeem_body,
    apply.prosecdef AS apply_security_definer,
    apply.proconfig AS apply_config,
    apply.proacl AS apply_acl,
    apply.proowner AS apply_owner
  FROM target_functions t
  LEFT JOIN pg_proc redeem ON redeem.oid = t.redeem_oid
  LEFT JOIN pg_proc apply ON apply.oid = t.apply_oid
),
history AS (
  SELECT
    count(*) FILTER (WHERE version = '199') AS v199,
    count(*) FILTER (WHERE version = '200') AS v200,
    count(*) FILTER (WHERE version = '208') AS v208,
    count(*) FILTER (WHERE version = '209') AS v209,
    count(*) FILTER (WHERE version = '210') AS v210
  FROM supabase_migrations.schema_migrations
)
SELECT
  1 AS ord,
  'migration history before repair' AS check_name,
  format(
    '199=%s 200=%s 208=%s 209=%s 210=%s',
    h.v199,
    h.v200,
    h.v208,
    h.v209,
    h.v210
  ) AS raw_value,
  CASE
    WHEN h.v199 = 0 AND h.v200 = 0 AND h.v208 = 0 AND h.v209 = 0 AND h.v210 = 0
      THEN 'PASS - all five manual applications still need history repair'
    ELSE 'STOP - history differs from the migration-list result'
  END AS verdict
FROM history h

UNION ALL

SELECT
  2,
  '199 redeem function exists',
  coalesce(redeem_oid::text, '(absent)'),
  CASE
    WHEN redeem_oid IS NOT NULL THEN 'PASS'
    ELSE 'STOP - migration 199 function is absent'
  END
FROM function_facts

UNION ALL

SELECT
  3,
  '199 variable conflict repair',
  format(
    'directive_position=%s',
    coalesce(strpos(redeem_body, '#variable_conflict use_column')::text, '(null)')
  ),
  CASE
    WHEN strpos(redeem_body, '#variable_conflict use_column') > 0 THEN 'PASS'
    ELSE 'STOP - migration 199 directive is absent'
  END
FROM function_facts

UNION ALL

SELECT
  4,
  '200 apply function attributes',
  format(
    'oid=%s security_definer=%s config=%s',
    coalesce(apply_oid::text, '(absent)'),
    coalesce(apply_security_definer::text, '(null)'),
    coalesce(apply_config::text, '(null)')
  ),
  CASE
    WHEN apply_oid IS NOT NULL
      AND apply_security_definer IS TRUE
      AND apply_config = ARRAY['search_path=""']::text[]
      THEN 'PASS'
    ELSE 'STOP - migration 200 attributes do not match'
  END
FROM function_facts

UNION ALL

SELECT
  5,
  '200 apply function grants',
  format(
    'public=%s anon=%s authenticated=%s service_role=%s',
    coalesce((
      SELECT bool_or(acl.grantee = 0 AND acl.privilege_type = 'EXECUTE')::text
      FROM aclexplode(coalesce(apply_acl, acldefault('f', apply_owner))) acl
    ), '(null)'),
    coalesce(has_function_privilege('anon', apply_oid, 'EXECUTE')::text, '(null)'),
    coalesce(has_function_privilege('authenticated', apply_oid, 'EXECUTE')::text, '(null)'),
    coalesce(has_function_privilege('service_role', apply_oid, 'EXECUTE')::text, '(null)')
  ),
  CASE
    WHEN apply_oid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM aclexplode(coalesce(apply_acl, acldefault('f', apply_owner))) acl
        WHERE acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
      )
      AND has_function_privilege('anon', apply_oid, 'EXECUTE') IS FALSE
      AND has_function_privilege('authenticated', apply_oid, 'EXECUTE') IS FALSE
      AND has_function_privilege('service_role', apply_oid, 'EXECUTE') IS TRUE
      THEN 'PASS'
    ELSE 'STOP - migration 200 grant posture does not match'
  END
FROM function_facts
ORDER BY 1;
