-- ============================================================
-- Funūn — Phase 27 (artist-invite-only-onboarding): partial-failure durability
-- Migration 102 — artist_waitlist claim-lease + sent-marker columns
--
-- WHY: 27-CODEX-REVIEW.md follow-up review #2 found two remaining MEDIUM
-- durability gaps in the B3/H1/M5 fix commits (fd526b8/def0c0f/b963ca2/
-- 16cb802), specifically about PARTIAL failure — a process dying mid-send,
-- an ambiguous provider timeout, or a caller never seeing an RPC's response
-- even though it committed — not the pure-concurrency races migration 101
-- already closed:
--
--   MEDIUM — broadcast's "atomic claim" (b963ca2) used a SINGLE column,
--   `notified_reopen_at`, as BOTH the in-progress claim marker AND the
--   final delivered marker. That collapse is fine for concurrent races
--   (two overlapping runs), but not for a process that dies between
--   claiming and sending: the claim is stamped, the process never reaches
--   the reset-on-failure code, and the row is stuck permanently "notified"
--   with nothing ever delivered — no lease, no way for a later run to tell
--   "abandoned claim" from "genuinely in flight" and reclaim it.
--
--   MEDIUM — convert's first-time claim (16cb802) used
--   `converted_to_invite_at` as BOTH the "has this row ever been converted"
--   bookkeeping marker AND (via `!ownsFirstConversion && state==='reused'`)
--   the duplicate-suppression signal for whether an email needs (re)sending.
--   If the winning caller's process died (or its RPC response was lost)
--   after mintOrRotateInvite() committed but before the email actually
--   went out, a later retry reads `converted_to_invite_at` as already set,
--   mintOrRotateInvite() correctly returns the SAME still-active invite
--   (`state: 'reused'`), and the OLD duplicate check fired on that combination
--   alone — reporting `duplicate: true` and never sending, even though no
--   email had ever actually been delivered. Silent, permanent no-send.
--
-- WHAT: three new nullable columns on artist_waitlist. No existing column
-- is dropped or renamed — `notified_reopen_at` keeps its role as the FINAL
-- broadcast-delivered marker (the eligibility query
-- `.is('notified_reopen_at', null)` is unchanged), and `converted_to_invite_at`
-- keeps its role as the "has this row ever completed a first-time
-- conversion" bookkeeping marker. Both are now backed by a distinct,
-- separately-tracked signal for "is a send currently/was a send ever
-- actually confirmed", closing the gap between "we claimed this" and "we
-- delivered this":
--
--   1. claim_token   UUID        — broadcast's PER-ATTEMPT lease identity.
--      Generated fresh (crypto.randomUUID(), app/api/admin/artist-invites/
--      broadcast/route.ts) each time a row is claimed. Cleared back to NULL
--      the moment the attempt ends (release on failure, or clear-on-finalize
--      after a confirmed delivered_at stamp) — never left set for a
--      completed row, so it doubles as an at-a-glance "is anything currently
--      claimed" signal.
--   2. claimed_at    TIMESTAMPTZ — the lease timestamp paired with
--      claim_token. The broadcast route's claim UPDATE is now conditioned on
--      `notified_reopen_at IS NULL AND (claimed_at IS NULL OR claimed_at <
--      now() - lease)` — a dead process's claim (claimed_at stamped, never
--      cleared because the process never reached the release/finalize code)
--      is reclaimable by a LATER run once the lease window elapses, instead
--      of being stuck forever. The lease window itself is enforced in
--      application code (app/api/admin/artist-invites/broadcast/route.ts's
--      CLAIM_LEASE_MS), not in SQL — this column only needs to exist and be
--      indexable.
--   3. invite_email_sent_at TIMESTAMPTZ — convert's confirmed-sent marker,
--      DISTINCT from converted_to_invite_at. app/api/admin/artist-invites/
--      [id]/convert/route.ts now keys its duplicate-suppression check on
--      THIS column (only skip a resend when a previous attempt actually
--      reached a confirmed sendEmail() success), not on
--      converted_to_invite_at/state alone — a retry after a lost mint
--      response (converted_to_invite_at already set, invite reused, but no
--      confirmed send yet) now correctly falls through to (re)send using
--      the reused invite instead of silently reporting a duplicate.
--
-- Stable per-recipient Resend `Idempotency-Key`s (broadcast:
-- `artist-reopen-{waitlist_id}-{YYYY-MM-DD}`; convert:
-- `artist-convert-{waitlist_id}-{invite_token}`) are the OTHER half of this
-- fix — a provider-level backstop against an ambiguous timeout + apparent
-- failure that actually landed, so a claim-release-then-retry (or a
-- sequential convert retry) can't double-send even in the narrow window
-- where this migration's own claim/lease logic and a concurrent retry
-- briefly overlap. That half lives entirely in application code
-- (lib/email/index.ts's new `idempotencyKey` passthrough to the Resend SDK)
-- and needs no schema change.
--
-- No index is added for claim_token/claimed_at: artist_waitlist is a small,
-- staff-driven table (bounded by realistic waitlist size, not user-facing
-- request volume), and the claim UPDATE already filters primarily on the
-- primary key (`id`) per row in a bounded application-level loop — a
-- sequential scan over claimed_at for the lease-reclaim OR-clause is not a
-- performance concern at this table's scale.
--
-- HUMAN-GATED — never `supabase db push` from an agent (matches Phases
-- 16/21/25/27/28's standing convention). Draft + test-only — applies
-- cleanly after migration 101. The owner reviews and pushes this alongside
-- 097-101 at the phase's blocking cutover checkpoint.
-- ============================================================

ALTER TABLE public.artist_waitlist
  ADD COLUMN IF NOT EXISTS claim_token           UUID,
  ADD COLUMN IF NOT EXISTS claimed_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_email_sent_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.artist_waitlist.claim_token IS
  'Phase 27 (27-CODEX-REVIEW.md follow-up #2 MEDIUM): per-attempt lease identity for the reopen broadcast (app/api/admin/artist-invites/broadcast/route.ts). NULL when no send attempt currently owns this row. Paired with claimed_at; cleared on release (failure) or finalize (confirmed delivery). Distinct from notified_reopen_at, which is the FINAL confirmed-delivered marker.';

COMMENT ON COLUMN public.artist_waitlist.claimed_at IS
  'Phase 27 (27-CODEX-REVIEW.md follow-up #2 MEDIUM): lease timestamp paired with claim_token. The broadcast route reclaims a row whose claim is older than its application-level lease window even if the original claiming process died before releasing it (mid-send process death recovery) — the lease comparison itself is enforced in app code, not a DB constraint.';

COMMENT ON COLUMN public.artist_waitlist.invite_email_sent_at IS
  'Phase 27 (27-CODEX-REVIEW.md follow-up #2 MEDIUM): confirmed-sent marker for the waitlist convert route (app/api/admin/artist-invites/[id]/convert/route.ts), DISTINCT from converted_to_invite_at (which only records "has this row ever completed a first-time conversion" bookkeeping). Duplicate-suppression is keyed on THIS column so a retry after a lost mint/RPC response (converted_to_invite_at already set, no confirmed send) still (re)sends instead of silently reporting a duplicate.';

-- Column additions affect what PostgREST exposes.
NOTIFY pgrst, 'reload schema';
