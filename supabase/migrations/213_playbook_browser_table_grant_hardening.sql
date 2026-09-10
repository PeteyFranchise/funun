-- ============================================================
-- Migration 213: remove residual browser-role privileges from
--                Playbook tables created by 201, 202, and 204.
-- ============================================================
--
-- HUMAN-GATED: run PRE-APPLY-GATE-213.sql and require every row to PASS.
--
-- Supabase grants every table privilege directly to anon and authenticated by
-- default. Migrations 201, 202, and 204 revoked only SELECT, INSERT, UPDATE,
-- and DELETE, leaving REFERENCES, TRIGGER, and TRUNCATE. RLS does not govern
-- TRUNCATE. The application never requires direct browser access to these
-- internal Team Member tables; service-role API routes are the only callers.
--
-- Migrations 205, 206, and 207 were still unapplied when this was found and
-- revoke every table privilege at creation time. This migration repairs only
-- the twelve tables already committed in production.
-- ============================================================

BEGIN;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'playbook_entry_revisions',
    'playbook_entry_game_plan_links',
    'playbook_review_reminders',
    'playbook_reading_assignments',
    'playbook_reading_acknowledgements',
    'playbook_reading_reminders',
    'playbook_review_rounds',
    'playbook_review_threads',
    'playbook_review_messages',
    'playbook_review_mentions',
    'playbook_review_events',
    'playbook_review_round_events'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN
      RAISE EXCEPTION 'required Playbook table is absent: public.%', table_name;
    END IF;

    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      table_name
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants grants
    WHERE grants.table_schema = 'public'
      AND grants.table_name = ANY (ARRAY[
        'playbook_entry_revisions',
        'playbook_entry_game_plan_links',
        'playbook_review_reminders',
        'playbook_reading_assignments',
        'playbook_reading_acknowledgements',
        'playbook_reading_reminders',
        'playbook_review_rounds',
        'playbook_review_threads',
        'playbook_review_messages',
        'playbook_review_mentions',
        'playbook_review_events',
        'playbook_review_round_events'
      ])
      AND grants.grantee IN ('PUBLIC', 'anon', 'authenticated')
  ) THEN
    RAISE EXCEPTION 'browser-role Playbook table grants remain after revoke';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
