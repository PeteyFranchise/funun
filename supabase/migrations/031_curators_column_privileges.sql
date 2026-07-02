-- ============================================================
-- Funūn — Wave 3: Playlist Curator Pitching
-- Migration 031: column-level privilege lockdown for `curators` and
-- `pitch_history` (CR-02 / CR-03, 06-REVIEW.md)
-- Run via: supabase db push
-- ============================================================

-- Migration 030's RLS policies restrict *which rows* a client can read/
-- write, not *which columns*. Supabase's default schema bootstrapping
-- grants `authenticated`/`anon` full column-level SELECT/UPDATE on any
-- RLS-enabled table with a matching policy, and this project never
-- revokes/re-grants column-level privileges anywhere (migration 030 is
-- no exception — confirmed via `grep -rn "REVOKE\|GRANT " supabase/
-- migrations/`). That means the careful column allowlisting done in the
-- Next.js API routes (DIRECTORY_COLUMNS, CURATOR_SELF_EDITABLE_FIELDS)
-- was bypassable entirely by any authenticated caller hitting the
-- Supabase REST endpoint directly with their own session.
--
-- This migration is additive-only (031, not an edit of 030 — 030 is
-- already applied to the live database) and revokes the blanket
-- column-level grants, re-granting only the columns each role
-- legitimately needs. service_role is completely unaffected — it
-- bypasses RLS and column grants entirely, so every server-side write in
-- this app (all admin routes, the pitch-send route, the claim/accept/
-- decline/webhook routes) continues to work unchanged. Only direct
-- PostgREST access using an `authenticated`/`anon` JWT is now
-- column-restricted, matching (and now actually enforcing) the app-layer
-- allowlists.

-- ─── curators (CR-02) ────────────────────────────────────────────────
-- SELECT: exclude email, claim_token, claim_token_expires_at (claim-token
-- harvesting is a full account-takeover path — an attacker who reads an
-- unclaimed curator's claim_token can claim that profile before the real
-- curator does) and baseline_genre_focus/submission_notes (already kept
-- out of DIRECTORY_COLUMNS at the app layer, T-06-08). This matches the
-- exact column set app/api/curators/route.ts, app/(artist)/curators/
-- page.tsx, and app/(artist)/launchpad/[projectId]/page.tsx already
-- select via DIRECTORY_COLUMNS.
REVOKE SELECT ON curators FROM authenticated, anon;
GRANT SELECT (id, name, playlist_name, playlist_url, platform, genre_focus,
              reach_signal, reach_fetched_at, drift_flagged, do_not_pitch,
              email_valid, claimed_by, created_at, updated_at)
  ON curators TO authenticated, anon;

-- UPDATE: only the fields a claimed curator may self-edit
-- (CURATOR_SELF_EDITABLE_FIELDS, T-06-06), plus drift_flagged — the one
-- non-allowlisted column app/api/curators/[id]/route.ts legitimately
-- writes server-side-computed (never client-supplied) alongside
-- genre_focus in the SAME UPDATE statement, so it must also be grantable
-- or that route's own update would fail column-privilege checks.
-- email_valid/flagged_inactive/reach_signal/claimed_by/email remain
-- ungrantable to `authenticated` — those stay admin/system-only, written
-- exclusively via the service-role client (RLS/grants bypassed there).
REVOKE UPDATE ON curators FROM authenticated;
GRANT UPDATE (genre_focus, platform, playlist_url, playlist_name,
              submission_notes, drift_flagged)
  ON curators TO authenticated;
