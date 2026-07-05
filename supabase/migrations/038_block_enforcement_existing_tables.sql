-- ============================================================
-- Funūn — Wave 4: The Green Room
-- Migration 038: wire no_block() into follows/wall_posts/endorsements/
-- dm_threads/dm_messages INSERT policies (D-15)
-- Run via: supabase db push
-- ============================================================

-- Zero-behavior-change today: `blocks` (migration 035) is empty until
-- Phase 13 ships the block feature UI, so no_block(a, b) currently
-- always returns true and every policy below behaves exactly as it did
-- in migration 012. Once Phase 13 populates `blocks`, these same
-- policies immediately start rejecting a blocked party's INSERT at the
-- RLS layer — Phases 10/11/13 inherit enforcement for free instead of
-- each shipping their own retrofit migration (D-15).
--
-- Policies amended in this migration (additive AND no_block(...) clause
-- appended to each existing WITH CHECK — the original ownership
-- condition is preserved verbatim; this is NOT a full policy rewrite):
--   follows.follows_insert_own
--   wall_posts.wall_insert_author
--   endorsements.endo_insert_author
--   dm_threads.dmt_insert_participant
--   dm_messages.dmm_insert_sender  (inherits enforcement from its
--     thread's other participant, since dm_messages has no direct
--     "other party" column of its own — this goes one step beyond the
--     plan's minimum D-15 scope so a block placed AFTER a thread
--     already exists still blocks new messages sent into that thread,
--     not just gating at thread-creation time)

-- ─── follows ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "follows_insert_own" ON follows;
CREATE POLICY "follows_insert_own" ON follows FOR INSERT TO authenticated
  WITH CHECK (follower_id = auth.uid() AND no_block(auth.uid(), followee_id));

-- ─── wall_posts ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "wall_insert_author" ON wall_posts;
CREATE POLICY "wall_insert_author" ON wall_posts FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND no_block(auth.uid(), profile_id));

-- ─── endorsements ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "endo_insert_author" ON endorsements;
CREATE POLICY "endo_insert_author" ON endorsements FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND no_block(auth.uid(), profile_id));

-- ─── dm_threads ──────────────────────────────────────────────────────
-- a_id/b_id are canonically ordered (a_id < b_id), not caller/other —
-- the "other party" is whichever of the two is not the caller.
DROP POLICY IF EXISTS "dmt_insert_participant" ON dm_threads;
CREATE POLICY "dmt_insert_participant" ON dm_threads FOR INSERT TO authenticated
  WITH CHECK (
    (a_id = auth.uid() OR b_id = auth.uid())
    AND no_block(auth.uid(), CASE WHEN a_id = auth.uid() THEN b_id ELSE a_id END)
  );

-- ─── dm_messages ─────────────────────────────────────────────────────
-- No direct recipient column on dm_messages itself; the other
-- participant is resolved via the parent dm_threads row so a block
-- placed after thread creation still rejects new messages in that
-- thread (not just at thread-creation time).
DROP POLICY IF EXISTS "dmm_insert_sender" ON dm_messages;
CREATE POLICY "dmm_insert_sender" ON dm_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND EXISTS (
    SELECT 1 FROM dm_threads t
    WHERE t.id = thread_id
      AND (t.a_id = auth.uid() OR t.b_id = auth.uid())
      AND no_block(auth.uid(), CASE WHEN t.a_id = auth.uid() THEN t.b_id ELSE t.a_id END)
  ));
