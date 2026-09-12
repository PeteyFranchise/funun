-- Read-only production gate for migrations 215–217 after the reviewed
-- migration-214 APPLIED_UNREGISTERED recovery. Every row must report ok=true.

WITH
target_columns(table_name, column_name) AS (
  VALUES
    ('license_requests', 'checkout_claim_token'),
    ('license_requests', 'checkout_claimed_at'),
    ('license_requests', 'checkout_economics_fingerprint'),
    ('license_requests', 'stripe_checkout_economics_fingerprint'),
    ('license_requests', 'stripe_checkout_url')
),
target_functions(signature) AS (
  VALUES
    ('public.claim_license_checkout(uuid,uuid,text,integer)'),
    ('public.finalize_license_checkout(uuid,uuid,text,text,text)'),
    ('public.release_license_checkout_claim(uuid,uuid)'),
    ('public.complete_license_checkout(uuid,text,text,text,integer,text,integer,text)'),
    ('public.claim_esign_mint(text,uuid,uuid,uuid,integer)'),
    ('public.record_esign_mint_provider(text,uuid,uuid,text,text)'),
    ('public.release_esign_mint_claim(text,uuid,uuid)'),
    ('public.complete_esign_mint_claim(text,uuid,uuid,text)'),
    ('public.mutate_playbook_feature_control(text,text,uuid,text,timestamp with time zone)'),
    ('public.open_playbook_incident(uuid,uuid,integer,text,integer,text,uuid,timestamp with time zone)'),
    ('public.change_playbook_incident_status(uuid,uuid,text,text,uuid,text)')
),
checks(ord, migration, check_name, ok, blocking, detail) AS (
  SELECT 10, 'all', 'Recovered migration 214 is registered',
         EXISTS (
           SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '214'
         ),
         true, 'Migration 214 must be registered before continuing.'
  UNION ALL
  SELECT 20, 'all', 'Remaining candidate ledger entries are unused',
         NOT EXISTS (
           SELECT 1 FROM supabase_migrations.schema_migrations
            WHERE version IN ('215', '216', '217', '218')
         ),
         true, 'Migrations 215–218 must still be unregistered.'
  UNION ALL
  SELECT 30, '215', 'Migration 215 target columns are free',
         NOT EXISTS (
           SELECT 1 FROM target_columns t
           JOIN information_schema.columns c
             ON c.table_schema = 'public'
            AND c.table_name = t.table_name
            AND c.column_name = t.column_name
         ),
         true, 'All five checkout claim columns must be absent.'
  UNION ALL
  SELECT 40, 'all', 'Migration 215–217 target functions are free',
         NOT EXISTS (
           SELECT 1 FROM target_functions f WHERE to_regprocedure(f.signature) IS NOT NULL
         ),
         true, 'All target function signatures must be unused.'
  UNION ALL
  SELECT 50, '216', 'Migration 216 claim table and indexes are free',
         to_regclass('public.esign_mint_claims') IS NULL
           AND to_regclass('public.idx_esign_envelopes_one_active_per_sheet') IS NULL
           AND to_regclass('public.idx_vault_documents_one_blanket_agreement') IS NULL,
         true, 'Claim ledger and both uniqueness-index names must be unused.'
  UNION ALL
  SELECT 60, '216', 'No duplicate active e-sign envelope rows',
         NOT EXISTS (
           SELECT 1 FROM public.esign_envelopes
            WHERE status IN ('pending', 'completing')
            GROUP BY split_sheet_id HAVING count(*) > 1
         ),
         true, 'Required before the active-envelope unique index.'
  UNION ALL
  SELECT 70, '216', 'No duplicate active blanket-agreement rows',
         NOT EXISTS (
           SELECT 1 FROM public.vault_documents
            WHERE type = 'blanket_agreement' AND status IN ('pending', 'signed', 'verified')
            GROUP BY user_id HAVING count(*) > 1
         ),
         true, 'Required before the blanket-agreement unique index.'
  UNION ALL
  SELECT 80, '217', 'Playbook control rows have version timestamps',
         NOT EXISTS (
           SELECT 1 FROM public.playbook_feature_controls WHERE updated_at IS NULL
         ),
         true, 'Compare-and-swap requires updated_at on every control.'
)
SELECT ord, migration, check_name, ok, blocking, detail
FROM checks
ORDER BY ord;
