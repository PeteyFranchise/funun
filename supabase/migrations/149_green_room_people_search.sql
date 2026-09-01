-- ============================================================
-- Funūn — Green Room people-search repair
-- Migration 149: align the legacy public flag with current privacy settings
--                and add privacy-safe exact-email discovery.
--
-- `profile_visibility` is the setting users can see and control. Its only
-- valid values are public and connections_only, but the older `is_public`
-- column still defaulted to false and silently excluded every new profile
-- from People Search and public-profile routing. Make the visible setting
-- authoritative by restoring the legacy gate for every current profile and
-- defaulting future profiles on.
-- ============================================================

ALTER TABLE public.user_profiles
  ALTER COLUMN is_public SET DEFAULT true;

UPDATE public.user_profiles
SET is_public = true
WHERE is_public IS DISTINCT FROM true
  AND profile_visibility IN ('public', 'connections_only');

-- Exact-email discovery is authenticated and returns only a profile id.
-- Email never enters user_profiles.search_vector, DISCOVER_PUBLIC_COLUMNS,
-- or an API result. The function independently enforces the same privacy
-- boundaries as People Search so a direct RPC call cannot bypass them:
--   - no self result;
--   - legacy/current public gates;
--   - public, or connections-only with an accepted connection;
--   - no block in either direction.
CREATE OR REPLACE FUNCTION public.discover_profile_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT profile.id
  FROM auth.users account
  JOIN public.user_profiles profile ON profile.id = account.id
  WHERE p_email IS NOT NULL
    AND char_length(trim(p_email)) BETWEEN 3 AND 254
    AND account.deleted_at IS NULL
    AND lower(account.email) = lower(trim(p_email))
    AND profile.id <> auth.uid()
    AND profile.is_public = true
    AND public.no_block(auth.uid(), profile.id)
    AND (
      profile.profile_visibility = 'public'
      OR (
        profile.profile_visibility = 'connections_only'
        AND EXISTS (
          SELECT 1
          FROM public.connections connection
          WHERE connection.status = 'accepted'
            AND (
              (connection.requester_id = auth.uid() AND connection.addressee_id = profile.id)
              OR (connection.addressee_id = auth.uid() AND connection.requester_id = profile.id)
            )
        )
      )
    )
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.discover_profile_id_by_email(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discover_profile_id_by_email(TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.discover_profile_id_by_email(TEXT) IS
  'Green Room exact-email discovery. Returns only an otherwise-visible, unblocked profile id to an authenticated viewer; never returns or indexes the email itself.';

NOTIFY pgrst, 'reload schema';
