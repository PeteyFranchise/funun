-- ============================================================
-- Funūn — Wave 4: The Green Room
-- Migration 055: dm_threads participant-scoped UPDATE policy
-- ============================================================
-- Gap closure for Phase 11 Plan 03. Migration 054 added
-- dm_threads.status, and Plan 03's accept/decline/block routes issue
-- session-client `.update({status:...})` calls to transition a thread
-- out of 'pending'. But dm_threads has only SELECT + INSERT RLS policies
-- (migrations 012, 038) — no UPDATE policy. Under RLS, a missing UPDATE
-- policy denies ALL updates, so every accept/decline/block silently
-- affects zero rows against the live database and the routes return 404.
--
-- This migration adds the missing UPDATE policy, scoped to thread
-- participants — mirroring dmt_select_participant's USING clause. The
-- application-layer recipient guards (requester_id != auth.uid()) and the
-- `.eq('status','pending')` transition gate remain the finer-grained
-- controls; this policy is the coarse participant-membership gate the
-- session-client updates require to touch any row at all.
--
-- The send route's own status writes (grandfather-flip + pending-stamp)
-- use the SERVICE client, which bypasses RLS, so they are unaffected and
-- unchanged by this migration.
-- Idempotent (DROP POLICY IF EXISTS + CREATE POLICY).
-- Run via: supabase db push
-- ============================================================

-- ─── dm_threads UPDATE (participant-scoped) ──────────────────────────
-- USING gates which existing rows the caller may update (row visibility
-- for UPDATE); WITH CHECK gates the post-update row so a participant
-- cannot reassign the thread to other users. Both mirror the canonical
-- a_id/b_id participant test from dmt_select_participant (migration 012).
--
-- No no_block() clause here (unlike dmt_insert_participant): a block is a
-- terminal recipient action on an EXISTING pending thread — the block
-- route itself flips status to 'declined' via this same policy, so gating
-- the transition on no_block() would paradoxically prevent a blocked
-- recipient from clearing the request out of their own Requests section.
DROP POLICY IF EXISTS "dmt_update_participant" ON dm_threads;
CREATE POLICY "dmt_update_participant" ON dm_threads FOR UPDATE TO authenticated
  USING (a_id = auth.uid() OR b_id = auth.uid())
  WITH CHECK (a_id = auth.uid() OR b_id = auth.uid());
