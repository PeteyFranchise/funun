-- ============================================================
-- Funūn — Rights Setup Companion
-- Migration 158: private, server-owned reminder state.
-- ============================================================

ALTER TABLE public.user_profiles
  ADD COLUMN rights_setup_remind_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_profiles.rights_setup_remind_at IS
  'Private server-owned timestamp. When due, Funūn may gently remind this artist to revisit incomplete profile-level rights setup. Never gates creative access or readiness.';

-- Deliberately no authenticated or anon column grant. The timestamp is
-- written only by an authenticated, user-scoped server route and read only
-- by server components after verifying the signed-in user.

NOTIFY pgrst, 'reload schema';
