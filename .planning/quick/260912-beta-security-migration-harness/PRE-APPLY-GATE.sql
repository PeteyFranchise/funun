-- Read-only pre-apply gate for human-gated migrations 214–217.
-- Every blocking row must report ok=true before any candidate is applied.
-- This file intentionally contains one SELECT statement and performs no writes.

WITH
required_relations(name) AS (
  VALUES
    ('public.user_profiles'),
    ('public.subscriptions'),
    ('public.account_provision_intents'),
    ('public.artist_invites'),
    ('public.collaborator_invites'),
    ('public.license_requests'),
    ('public.vault_projects'),
    ('public.split_sheets'),
    ('public.esign_envelopes'),
    ('public.vault_documents'),
    ('public.playbook_feature_controls'),
    ('public.playbook_feature_control_events'),
    ('public.playbook_incidents'),
    ('public.playbook_incident_events')
),
required_columns(table_name, column_name) AS (
  VALUES
    ('artist_invites', 'id'), ('artist_invites', 'invite_token'),
    ('artist_invites', 'email'), ('artist_invites', 'status'),
    ('artist_invites', 'token_expires_at'), ('artist_invites', 'accepted_user_id'),
    ('artist_invites', 'accepted_at'), ('artist_invites', 'updated_at'),
    ('collaborator_invites', 'id'), ('collaborator_invites', 'invite_token'),
    ('collaborator_invites', 'invited_email'), ('collaborator_invites', 'status'),
    ('collaborator_invites', 'token_expires_at'), ('collaborator_invites', 'accepted_user_id'),
    ('collaborator_invites', 'accepted_at'),
    ('license_requests', 'id'), ('license_requests', 'payment_status'),
    ('license_requests', 'gross_fee_cents'), ('license_requests', 'commission_pct'),
    ('license_requests', 'vault_project_id'), ('license_requests', 'stripe_checkout_session_id'),
    ('license_requests', 'stripe_payment_intent_id'), ('license_requests', 'paid_at'),
    ('vault_projects', 'id'), ('vault_projects', 'user_id'),
    ('user_profiles', 'id'), ('user_profiles', 'stripe_connect_account_id'),
    ('split_sheets', 'id'), ('split_sheets', 'initiator_user_id'), ('split_sheets', 'status'),
    ('esign_envelopes', 'split_sheet_id'), ('esign_envelopes', 'status'),
    ('vault_documents', 'user_id'), ('vault_documents', 'type'), ('vault_documents', 'status'),
    ('playbook_feature_controls', 'feature_key'), ('playbook_feature_controls', 'enabled'),
    ('playbook_feature_controls', 'emergency_disabled'),
    ('playbook_feature_controls', 'disabled_reason'),
    ('playbook_feature_controls', 'updated_by'), ('playbook_feature_controls', 'updated_at'),
    ('playbook_feature_control_events', 'feature_key'),
    ('playbook_feature_control_events', 'event_type'),
    ('playbook_feature_control_events', 'actor_id'),
    ('playbook_feature_control_events', 'note'),
    ('playbook_incidents', 'id'), ('playbook_incidents', 'room_id'),
    ('playbook_incidents', 'runbook_entry_id'),
    ('playbook_incidents', 'runbook_revision_number'),
    ('playbook_incidents', 'title'), ('playbook_incidents', 'severity'),
    ('playbook_incidents', 'summary'), ('playbook_incidents', 'commander_id'),
    ('playbook_incidents', 'created_by'), ('playbook_incidents', 'postmortem_due_at'),
    ('playbook_incidents', 'status'), ('playbook_incidents', 'resolved_at'),
    ('playbook_incident_events', 'incident_id'),
    ('playbook_incident_events', 'event_type'),
    ('playbook_incident_events', 'actor_id'), ('playbook_incident_events', 'note')
),
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
    ('public.complete_verified_signup_claim(uuid,text)'),
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
  SELECT 10, 'all', 'Required migration baseline is applied through 213',
         EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '213'),
         true, 'Migration 213 must be present before the 214–217 chain.'
  UNION ALL
  SELECT 20, 'all', 'Candidate ledger entries are unused',
         NOT EXISTS (
           SELECT 1 FROM supabase_migrations.schema_migrations
            WHERE version IN ('214', '215', '216', '217')
         ),
         true, 'None of 214–217 may already be registered before this apply sequence.'
  UNION ALL
  SELECT 30, 'all', 'Required relations exist',
         NOT EXISTS (SELECT 1 FROM required_relations r WHERE to_regclass(r.name) IS NULL),
         true,
         COALESCE((
           SELECT string_agg(r.name, ', ' ORDER BY r.name)
             FROM required_relations r WHERE to_regclass(r.name) IS NULL
         ), 'all present')
  UNION ALL
  SELECT 40, 'all', 'Required columns exist',
         NOT EXISTS (
           SELECT 1 FROM required_columns r
            WHERE NOT EXISTS (
              SELECT 1 FROM information_schema.columns c
               WHERE c.table_schema = 'public'
                 AND c.table_name = r.table_name
                 AND c.column_name = r.column_name
            )
         ),
         true,
         COALESCE((
           SELECT string_agg(r.table_name || '.' || r.column_name, ', ' ORDER BY r.table_name, r.column_name)
             FROM required_columns r
            WHERE NOT EXISTS (
              SELECT 1 FROM information_schema.columns c
               WHERE c.table_schema = 'public'
                 AND c.table_name = r.table_name
                 AND c.column_name = r.column_name
            )
         ), 'all present')
  UNION ALL
  SELECT 50, '214', 'Migration 214 target table is free',
         to_regclass('public.verified_signup_invite_claims') IS NULL,
         true, COALESCE(to_regclass('public.verified_signup_invite_claims')::text, 'free')
  UNION ALL
  SELECT 60, '214', 'Migration 214 target function is free',
         to_regprocedure('public.complete_verified_signup_claim(uuid,text)') IS NULL,
         true, COALESCE(to_regprocedure('public.complete_verified_signup_claim(uuid,text)')::text, 'free')
  UNION ALL
  SELECT 70, '214', 'Migration 214 prerequisite functions exist',
         to_regprocedure('public.handle_new_user()') IS NOT NULL
           AND to_regprocedure('public.claim_collaborators(uuid,text)') IS NOT NULL,
         true, 'handle_new_user() and claim_collaborators(uuid,text)'
  UNION ALL
  SELECT 80, '214', 'pgcrypto digest is available',
         to_regprocedure('extensions.digest(text,text)') IS NOT NULL
           OR to_regprocedure('extensions.digest(bytea,text)') IS NOT NULL,
         true, 'extensions.digest is required for token hashing.'
  UNION ALL
  SELECT 90, '215', 'Migration 215 target columns are free',
         NOT EXISTS (
           SELECT 1 FROM target_columns t
           JOIN information_schema.columns c
             ON c.table_schema = 'public'
            AND c.table_name = t.table_name
            AND c.column_name = t.column_name
         ),
         true,
         COALESCE((
           SELECT string_agg(t.table_name || '.' || t.column_name, ', ' ORDER BY t.column_name)
             FROM target_columns t
             JOIN information_schema.columns c
               ON c.table_schema = 'public'
              AND c.table_name = t.table_name
              AND c.column_name = t.column_name
         ), 'free')
  UNION ALL
  SELECT 100, 'all', 'Target functions are free',
         NOT EXISTS (SELECT 1 FROM target_functions f WHERE to_regprocedure(f.signature) IS NOT NULL),
         true,
         COALESCE((
           SELECT string_agg(f.signature, ', ' ORDER BY f.signature)
             FROM target_functions f WHERE to_regprocedure(f.signature) IS NOT NULL
         ), 'free')
  UNION ALL
  SELECT 110, '216', 'Migration 216 claim table and indexes are free',
         to_regclass('public.esign_mint_claims') IS NULL
           AND to_regclass('public.idx_esign_envelopes_one_active_per_sheet') IS NULL
           AND to_regclass('public.idx_vault_documents_one_blanket_agreement') IS NULL,
         true, 'esign_mint_claims and both uniqueness-index names must be unused.'
  UNION ALL
  SELECT 120, '216', 'No duplicate active e-sign envelope rows',
         NOT EXISTS (
           SELECT 1 FROM public.esign_envelopes
            WHERE status IN ('pending', 'completing')
            GROUP BY split_sheet_id HAVING count(*) > 1
         ),
         true, 'Required before the one-active-envelope unique index can be created.'
  UNION ALL
  SELECT 130, '216', 'No duplicate active blanket-agreement rows',
         NOT EXISTS (
           SELECT 1 FROM public.vault_documents
            WHERE type = 'blanket_agreement' AND status IN ('pending', 'signed', 'verified')
            GROUP BY user_id HAVING count(*) > 1
         ),
         true, 'Required before the one-blanket-agreement unique index can be created.'
  UNION ALL
  SELECT 140, '217', 'Playbook control rows use non-null version timestamps',
         NOT EXISTS (SELECT 1 FROM public.playbook_feature_controls WHERE updated_at IS NULL),
         true, 'Compare-and-swap requires updated_at on every feature control.'
)
SELECT ord, migration, check_name, ok, blocking, detail
  FROM checks
 ORDER BY ord;
