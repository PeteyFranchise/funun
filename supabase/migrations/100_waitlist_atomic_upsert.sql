-- ============================================================
-- Funūn — Phase 27 (artist-invite-only-onboarding): waitlist atomic upsert
-- Migration 100 — upsert_artist_waitlist(text, text, text) RPC
--
-- WHY: 27-CODEX-REVIEW.md H2 — POST /api/waitlist previously did a manual
-- SELECT-then-branch (UPDATE existing row / INSERT new row), ignoring most
-- of the individual Supabase errors along the way and always returning
-- `{ok:true}` regardless of whether anything was actually persisted.
-- Migration 097's header comment already noted that PostgREST's
-- supabase-js `.upsert(..., { onConflict })` cannot target a FUNCTIONAL
-- unique index (`idx_artist_waitlist_email_lower ON (LOWER(email))`, not a
-- plain column) — that limitation is specific to the PostgREST client, not
-- to Postgres itself: a single `INSERT ... ON CONFLICT (LOWER(email)) DO
-- UPDATE ...` statement works when issued directly against the database,
-- because Postgres matches the conflict target expression to the existing
-- expression index. This migration moves that single atomic statement
-- into a SECURITY DEFINER RPC (mirrors the service-role-only shape of
-- claim_collaborators()/email_has_account(), migrations 075/097) so the
-- route can call it as ONE atomic write instead of a race-prone
-- check-then-act sequence, and can check ITS single error/result instead
-- of five separate ignored ones.
--
-- WHAT:
--   upsert_artist_waitlist(p_email, p_name, p_note) — inserts a new
--   artist_waitlist row, or on a LOWER(email) conflict, updates the
--   existing row's name/note and clears unsubscribed_at (D-19's
--   rejoin-auto-resubscribes behavior, unchanged). Returns the row's id.
--   EXECUTE revoked from PUBLIC/anon/authenticated, granted only to
--   service_role — never exposed to PostgREST directly, called only from
--   POST /api/waitlist via the service-role client.
--
-- HUMAN-GATED — never `supabase db push` from an agent (matches Phases
-- 16/21/25/27/28's standing convention). Draft + test-only — the owner
-- reviews and pushes at this phase's blocking checkpoint, alongside
-- 097/098/099.
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_artist_waitlist(
  p_email TEXT,
  p_name  TEXT,
  p_note  TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.artist_waitlist (email, name, note)
  VALUES (p_email, NULLIF(p_name, ''), NULLIF(p_note, ''))
  ON CONFLICT (LOWER(email)) DO UPDATE
    SET name             = NULLIF(EXCLUDED.name, ''),
        note             = NULLIF(EXCLUDED.note, ''),
        unsubscribed_at  = NULL,
        updated_at       = now()
  RETURNING artist_waitlist.id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_artist_waitlist(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.upsert_artist_waitlist(text, text, text) TO service_role;

COMMENT ON FUNCTION public.upsert_artist_waitlist(text, text, text) IS
  'Service-role-only atomic upsert for POST /api/waitlist (Phase 27, 27-CODEX-REVIEW.md H2). Single-statement INSERT ... ON CONFLICT (LOWER(email)) DO UPDATE against migration 097''s functional unique index — replaces a race-prone SELECT-then-branch that ignored most write errors. Always clears unsubscribed_at on conflict (D-19 auto-resubscribe). Never exposed to PostgREST directly.';

-- Function privilege changes affect what PostgREST exposes.
NOTIFY pgrst, 'reload schema';
