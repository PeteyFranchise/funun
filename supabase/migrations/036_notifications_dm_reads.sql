-- ============================================================
-- Funūn — Wave 4: The Green Room
-- Migration 036: notifications actor-snapshot columns + realtime +
-- dm_thread_reads
-- Run via: supabase db push
-- ============================================================

-- ─── notifications: actor-snapshot columns ───────────────────────────
-- Phase 10 (NOTIF-01/02/03) renders the bell without a join: each
-- notification row carries a denormalized snapshot of the actor's
-- identity at notification time (name + avatar), so it survives the
-- actor later renaming or changing their avatar. Purely additive — this
-- migration does NOT touch any GRANT/REVOKE on notifications. A broad
-- table-level SELECT revoke here would silently break Realtime delivery
-- (RESEARCH Pitfall 6); the existing "Users see own notifications" RLS
-- policy (migration 009, USING auth.uid() = user_id) already restricts
-- delivery per subscriber and is left untouched.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS actor_id         UUID REFERENCES auth.users ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actor_name       TEXT,
  ADD COLUMN IF NOT EXISTS actor_avatar_url TEXT;

-- ─── notifications: add to supabase_realtime publication ─────────────
-- Idempotent guard mirrored from migration 014's dm_messages pattern —
-- re-running this migration must not error if notifications is already
-- published.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

-- ─── dm_thread_reads ───────────────────────────────────────────────────
-- Powers Phase 11 (PRESENCE-03) DM unread badges: the floating DM widget
-- upserts its own (thread_id, user_id) marker whenever a member reads a
-- thread; unread count is computed by comparing last_read_at against
-- dm_messages.created_at. dm_threads.id (migration 012) is the FK target.
CREATE TABLE IF NOT EXISTS dm_thread_reads (
  thread_id    UUID NOT NULL REFERENCES dm_threads ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

ALTER TABLE dm_thread_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dm_thread_reads_select_own" ON dm_thread_reads;
DROP POLICY IF EXISTS "dm_thread_reads_upsert_own" ON dm_thread_reads;
DROP POLICY IF EXISTS "dm_thread_reads_update_own" ON dm_thread_reads;

-- A member can only read their own read-markers.
CREATE POLICY "dm_thread_reads_select_own" ON dm_thread_reads FOR SELECT
  USING (user_id = auth.uid());

-- A member upserts their own read-marker when they open a thread. INSERT
-- and UPDATE are both scoped to the caller's own row (T-08-08).
CREATE POLICY "dm_thread_reads_upsert_own" ON dm_thread_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "dm_thread_reads_update_own" ON dm_thread_reads FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
