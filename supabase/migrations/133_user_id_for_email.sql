-- ============================================================
-- Funūn — Quick task 260825-m2k (invite-existing-member-connect)
-- Migration 133: user_id_for_email(text) — service-role-only
--                 email → auth.users.id lookup
--
-- WHY: 260825-m2k fixes a real dead end — inviting a collaborator whose
-- email already has a Funūn account today mints a signup token and sends
-- a "join Funūn" email, which the recipient can't act on (they already
-- have an account). The fix is to route that case through a collaborator
-- connection request instead (lib/social/connect-request.ts), but doing
-- that requires knowing WHICH auth.users.id the email belongs to, not
-- just whether one exists — `email_has_account` (migration 097) only
-- returns a boolean.
--
-- This is the id-returning sibling of email_has_account, not a
-- replacement: email_has_account stays exactly as it is because it backs
-- the PUBLIC, unauthenticated /api/signup/check-invite route, and that
-- route only ever needs a yes/no answer. Handing an unauthenticated
-- caller a raw user id would be a strictly larger disclosure than that
-- route needs. This function is reachable only from an authenticated
-- collaborator-invite path that has already proven the caller owns the
-- collaborator row bearing this email (lib/collaborators/invite.ts).
--
-- Supabase's admin SDK has no getUserByEmail() (open feature request,
-- supabase/auth#880) — same documented workaround email_has_account
-- already uses, applied here to return the id instead of a boolean.
--
-- Locked down byte-for-byte the way migration 097 locked down
-- email_has_account: SECURITY DEFINER, SET search_path = public,
-- EXECUTE revoked from PUBLIC/anon/authenticated, granted only to
-- service_role. Never exposed to PostgREST directly.
--
-- HUMAN-GATED — never `supabase db push` from an agent (matches Phases
-- 16/21/25/27/28/32/112/128/129/130/131/132's standing convention). Draft
-- + text-tested only (__tests__/migration-133.test.ts); the owner reviews
-- and pushes via `supabase db push` against prod (project
-- wgfjakfiyeewzfuxkgyo). Do NOT edit migrations 001-132 (already landed).
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_id_for_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE LOWER(email) = LOWER(p_email) LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.user_id_for_email(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.user_id_for_email(text) TO service_role;

COMMENT ON FUNCTION public.user_id_for_email(text) IS
  'Service-role-only email→auth.users.id lookup (260825-m2k), the id-returning sibling of email_has_account (migration 097). Supabase''s admin SDK has no getUserByEmail() (supabase/auth#880) — this is that workaround, returning an id instead of a boolean. EXECUTE revoked from PUBLIC/anon/authenticated, granted only to service_role. Exists so an authenticated collaborator-invite caller can be routed to a connection request instead of a wasted signup invite when the email already has an account. Never exposed to PostgREST.';

-- Table/function privilege changes affect what PostgREST exposes.
NOTIFY pgrst, 'reload schema';
