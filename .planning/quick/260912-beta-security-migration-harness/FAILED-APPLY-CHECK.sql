-- Read-only residue check after any failed 214–217 apply command.
-- A failed candidate must be either wholly absent/unregistered. A fully
-- created but not-yet-registered candidate is distinguished so an owner can
-- verify it before repairing the migration ledger. Earlier successfully
-- applied candidates may be wholly present/registered.
-- Any state='PARTIAL_OR_LEDGER_MISMATCH' is a hard stop.

WITH object_counts(migration, present_count, expected_count) AS (
  SELECT '214',
         (to_regclass('public.verified_signup_invite_claims') IS NOT NULL)::int
           + (to_regprocedure('public.complete_verified_signup_claim(uuid,text)') IS NOT NULL)::int,
         2
  UNION ALL
  SELECT '215',
         (SELECT count(*)::int FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'license_requests'
             AND column_name IN (
               'checkout_claim_token', 'checkout_claimed_at', 'checkout_economics_fingerprint',
               'stripe_checkout_economics_fingerprint', 'stripe_checkout_url'
             ))
           + (to_regprocedure('public.claim_license_checkout(uuid,uuid,text,integer)') IS NOT NULL)::int
           + (to_regprocedure('public.finalize_license_checkout(uuid,uuid,text,text,text)') IS NOT NULL)::int
           + (to_regprocedure('public.release_license_checkout_claim(uuid,uuid)') IS NOT NULL)::int
           + (to_regprocedure('public.complete_license_checkout(uuid,text,text,text,integer,text,integer,text)') IS NOT NULL)::int,
         9
  UNION ALL
  SELECT '216',
         (to_regclass('public.esign_mint_claims') IS NOT NULL)::int
           + (to_regclass('public.idx_esign_envelopes_one_active_per_sheet') IS NOT NULL)::int
           + (to_regclass('public.idx_vault_documents_one_blanket_agreement') IS NOT NULL)::int
           + (to_regprocedure('public.claim_esign_mint(text,uuid,uuid,uuid,integer)') IS NOT NULL)::int
           + (to_regprocedure('public.record_esign_mint_provider(text,uuid,uuid,text,text)') IS NOT NULL)::int
           + (to_regprocedure('public.release_esign_mint_claim(text,uuid,uuid)') IS NOT NULL)::int
           + (to_regprocedure('public.complete_esign_mint_claim(text,uuid,uuid,text)') IS NOT NULL)::int,
         7
  UNION ALL
  SELECT '217',
         (to_regprocedure('public.mutate_playbook_feature_control(text,text,uuid,text,timestamp with time zone)') IS NOT NULL)::int
           + (to_regprocedure('public.open_playbook_incident(uuid,uuid,integer,text,integer,text,uuid,timestamp with time zone)') IS NOT NULL)::int
           + (to_regprocedure('public.change_playbook_incident_status(uuid,uuid,text,text,uuid,text)') IS NOT NULL)::int,
         3
), states AS (
  SELECT o.*,
         EXISTS (
           SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.version = o.migration
         ) AS ledger_applied
    FROM object_counts o
)
SELECT migration, present_count, expected_count, ledger_applied,
       CASE
         WHEN present_count = 0 AND NOT ledger_applied THEN 'NOT_APPLIED_CLEAN'
         WHEN present_count = expected_count AND NOT ledger_applied THEN 'APPLIED_UNREGISTERED'
         WHEN present_count = expected_count AND ledger_applied THEN 'APPLIED_CLEAN'
         ELSE 'PARTIAL_OR_LEDGER_MISMATCH'
       END AS state
  FROM states
 ORDER BY migration;
