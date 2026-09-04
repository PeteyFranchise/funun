-- ============================================================
-- Funūn — One Identity, Many Roles foundation
-- Migration 177: service-only existing-account lookup for attaching a
--                Member identity to a Client Partner organization.
--
-- HUMAN-GATED. Do not apply from an agent. The project owner runs
-- `supabase db push` after reviewing this file.
-- ============================================================

CREATE OR REPLACE FUNCTION public.find_auth_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT account.id
  FROM auth.users account
  WHERE pg_catalog.lower(account.email) = pg_catalog.lower(pg_catalog.btrim(p_email))
  LIMIT 1
$$;

-- This lookup crosses into auth.users and is therefore never a client RPC.
-- Only trusted service-role invitation code may use it after proving the
-- caller can manage the target Client Partner organization.
REVOKE ALL ON FUNCTION public.find_auth_user_id_by_email(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_auth_user_id_by_email(TEXT)
  TO service_role;

COMMENT ON FUNCTION public.find_auth_user_id_by_email(TEXT) IS
  'Service-only identity reconciliation for authorized Client Partner invitations. Returns an auth user id by normalized email so an existing Member can gain buyer_members access without a duplicate login or deletion of personal profile data.';

NOTIFY pgrst, 'reload schema';
