-- ============================================================
-- Funūn — Phase 31 Slice 1 (AE Client Workspace + Selects)
-- Migration 113: selects.changes_requested_reason
--
-- WHY: 31-13's public POST /api/selects/[token]/respond route lets an
-- unauthenticated client (no login required for the core flow, R12) submit
-- an optional free-text reason alongside "Request changes" — migration 111
-- has no column to hold it. This is a single, additive, nullable column;
-- no RLS/grant behavior changes for any EXISTING column.
--
-- The respond route treats this write as BEST-EFFORT (wrapped separately
-- from the primary status-transition UPDATE) so the core approve/
-- request-changes flow keeps working even before this migration is pushed
-- — see app/api/selects/[token]/respond/route.ts.
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (matches migration 111/112's standing convention). Draft-only; the owner
-- reviews and pushes via `supabase db push`. Do NOT edit migrations
-- 001-112 (already landed).
-- ============================================================

ALTER TABLE public.selects ADD COLUMN IF NOT EXISTS changes_requested_reason TEXT;

COMMENT ON COLUMN public.selects.changes_requested_reason IS
  '31-13: the client''s optional free-text reason submitted with "Request changes" (POST /api/selects/[token]/respond, no login required). Buyer-authored, written at the same sent -> changes_requested transition. Nullable — Approve never sets this, and a later re-send (changes_requested -> sent) does not clear it (kept as the AE''s most recent context until the next request-changes overwrites it).';

-- Extend the existing buyer-readable column allowlist (migration 111i) so a
-- logged-in Client Partner viewing their own org's Selects can also read
-- back the reason they (or a teammate) submitted. Re-declares the FULL
-- allowlist (GRANT SELECT on a table replaces the prior column list, it
-- does not merge) — every column below is unchanged from 111 except the
-- new one appended at the end.
REVOKE SELECT ON public.selects FROM authenticated, anon;
GRANT SELECT (
  id, buyer_org_id, brief_id, name, cover_note, share_token, status,
  download_enabled, download_max_seconds, created_at, updated_at, sent_at,
  changes_requested_reason
) ON public.selects TO authenticated;

NOTIFY pgrst, 'reload schema';
