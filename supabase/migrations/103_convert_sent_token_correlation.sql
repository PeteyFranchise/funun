-- ============================================================
-- Funūn — Phase 27 (artist-invite-only-onboarding): sent-token correlation
-- Migration 103 — artist_waitlist.invite_email_sent_token
--
-- WHY: 27-CODEX-REVIEW.md follow-up review #3 (NEW ISSUE 1) found that
-- migration 102's invite_email_sent_at duplicate-suppression signal in
-- app/api/admin/artist-invites/[id]/convert/route.ts is a boolean-shaped
-- presence check ("has ANY send ever been confirmed for this row") with no
-- correlation to WHICH invite token was actually delivered. Three different
-- routes (admin issue-invite, convert, and the reopen broadcast) all call
-- the SAME shared lib/invites/mintInvite.ts claim for a given email, so the
-- row's active artist_invites token can rotate out from under a convert
-- call without convert's own knowledge (e.g. a prior send's token expired
-- and a later, unrelated call already rotated it, or the winning caller's
-- process died before persisting the sent marker at all).
--
-- Concretely: token A sent (invite_email_sent_at stamped) -> token A
-- expires -> some call rotates to token B -> that rotation's send fails or
-- the process dies before confirming -> a retry's mintOrRotateInvite() call
-- sees token B as already active/non-expired (state 'reused') -> the OLD
-- boolean check (`Boolean(invite_email_sent_at)`) reads "yes, something was
-- confirmed sent before" and incorrectly reports a duplicate/skips the send
-- -- even though token B, the CURRENT active token, was never actually
-- emailed to anyone. Silent, permanent no-send for the recipient's real
-- invite link.
--
-- WHAT: one new nullable column, invite_email_sent_token, stamped ALONGSIDE
-- invite_email_sent_at (same confirmed-sendEmail()-success write in
-- convert/route.ts) with the EXACT invite token that was just emailed.
-- convert/route.ts's duplicate-suppression check is now a direct token
-- comparison (`row.invite_email_sent_token === mint.token`) instead of a
-- presence check — suppress a resend ONLY when the token this call is about
-- to use is the SAME one a previous attempt already confirmed sending. A
-- rotated-but-never-sent token (any mint.state) always falls through to a
-- (re)send, because by definition it cannot equal a stale sent token.
--
-- Append-only: does not touch or rename invite_email_sent_at (migration
-- 102) or converted_to_invite_at (migration 097) — both keep their existing
-- roles. Applies cleanly after migration 102.
--
-- HUMAN-GATED — never `supabase db push` from an agent (matches Phases
-- 16/21/25/27/28's standing convention). Draft + test-only. The owner
-- reviews and pushes this alongside 097-102 at the phase's blocking
-- cutover checkpoint.
-- ============================================================

ALTER TABLE public.artist_waitlist
  ADD COLUMN IF NOT EXISTS invite_email_sent_token TEXT;

COMMENT ON COLUMN public.artist_waitlist.invite_email_sent_token IS
  'Phase 27 (27-CODEX-REVIEW.md follow-up #3 NEW ISSUE 1): the EXACT artist_invites.invite_token that was actually emailed the last time invite_email_sent_at (migration 102) was confirmed-stamped. app/api/admin/artist-invites/[id]/convert/route.ts compares this against the CURRENT mint result''s token — a match means the same link was already confirmed delivered (true duplicate, suppress resend); a mismatch (including NULL, e.g. a lost-response retry, or a token rotated by another route/call since the last confirmed send) means the recipient''s currently-active invite was never actually delivered and must (re)send.';

-- Column addition affects what PostgREST exposes.
NOTIFY pgrst, 'reload schema';
