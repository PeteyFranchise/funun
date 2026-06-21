-- ============================================================
-- 014 — Realtime for direct messages
-- Adds dm_messages to the supabase_realtime publication so the DM widget
-- can subscribe to INSERTs (postgres_changes) instead of polling. RLS on
-- dm_messages already restricts SELECT to thread participants, so Realtime
-- only delivers a row to users allowed to read it.
-- Idempotent. Run via: supabase db push (or the management query API).
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dm_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dm_messages;
  END IF;
END $$;
