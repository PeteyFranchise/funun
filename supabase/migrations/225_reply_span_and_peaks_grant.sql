-- 225_reply_span_and_peaks_grant.sql
-- Closes two findings from the Phase 39 code review against migration 224.
-- Migration 224 is already applied in production, so neither could be corrected
-- in place. This migration adds creative-review constraints and one grant only;
-- it alters no authorship, credits, splits, rights, approvals, delivery state,
-- or membership.

-- ─── (1) WR-03: a reply never carries a span ─────────────────────────────
-- The rule was stated as a hard design invariant in the client
-- (TimedTrackPlayer sends `endTimestampMs` only when there is no
-- `replyingToId`) but nothing below the client enforced it. The RPC inserted
-- whatever `p_end_timestamp_ms` it was handed regardless of
-- `p_parent_comment_id`; the trigger rewrote a reply's `timestamp_ms` to its
-- parent's without touching `end_timestamp_ms`; and the existing
-- `work_version_comments_end_after_start` CHECK was trivially satisfiable once
-- that rewrite had happened.
--
-- Nothing produces this state today, and the only current span consumer
-- filters to root comments. The risk is forward-looking and concrete: Phase 40
-- exports range comments as DAW markers. A spanned reply -- from a future
-- client bug, a direct RPC call, or API misuse -- would export as a marker for
-- a moment nobody marked.
--
-- A CHECK rather than a trigger guard, deliberately. The trigger would give a
-- friendlier message, but restating an ~80-line function to add one condition
-- invites drift between this file and 224. A CHECK cannot be bypassed by any
-- write path, which is the actual guarantee wanted here. The clean client-facing
-- error is added at the API edge instead, where it belongs.
--
-- Mirrors migration 160's own idiom on this table:
--   CHECK (parent_comment_id IS NULL OR (resolved_at IS NULL AND ...))
--
-- Verified before writing: zero existing rows violate this.

ALTER TABLE public.work_version_comments
  ADD CONSTRAINT work_version_comments_reply_has_no_span
  CHECK (parent_comment_id IS NULL OR end_timestamp_ms IS NULL);

COMMENT ON CONSTRAINT work_version_comments_reply_has_no_span
  ON public.work_version_comments IS
  'A reply is a message in a thread, not a second span. Stated as an invariant in the client since Phase 39; enforced here because Phase 40 exports spans as DAW markers and a spanned reply would export as a marker for a moment nobody marked.';

-- ─── (2) WR-04: the peaks range helper needs its own grant ───────────────
-- `work_version_peaks_in_range()` was revoked from PUBLIC and anon in 224 but
-- never granted to `authenticated`, unlike the two other routines that
-- migration added, which each restate both halves (224:221, 224:369).
--
-- It is called inside the `work_versions_peaks_shape` CHECK on every write to
-- `work_versions.peaks` -- the creation path and the self-healing backfill
-- both. It works today only because Postgres grants EXECUTE to PUBLIC by
-- default at creation and 224 revoked that by name for PUBLIC and anon rather
-- than for `authenticated`. Correct by omission, not by design.
--
-- This is the same trap 197_workspace_structural_integrity.sql:787-791
-- documents at length for tables. The next grant-hardening pass that names
-- `authenticated` explicitly in a REVOKE -- exactly what 182 did to
-- workspace_audit_log before 197 had to correct it -- would silently break
-- every write to the peaks column, and the failure would surface as waveforms
-- quietly refusing to save.

GRANT EXECUTE ON FUNCTION public.work_version_peaks_in_range(SMALLINT[])
  TO authenticated;

NOTIFY pgrst, 'reload schema';
