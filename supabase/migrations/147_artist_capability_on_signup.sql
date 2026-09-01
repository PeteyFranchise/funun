-- ============================================================
-- Funūn — collaborator onboarding access repair
-- Migration 147: grant the artist capability on self-serve artist signup
--                and repair existing artist profiles missing that grant.
--
-- WHY: ArtistNav intentionally hides artist rooms unless an approved
-- capability_grants row exists. Migration 042 backfilled accounts that
-- existed at that moment, but the default artist branch of handle_new_user()
-- never became a continuing writer of that row. A newly invited collaborator
-- could therefore claim their collaborator identity and sign in successfully
-- while Contract Locker, Collaborators, Sound Vault, and the other artist
-- rooms remained absent.
--
-- This uses a second auth.users AFTER INSERT trigger instead of copying the
-- large, security-sensitive handle_new_user() body. PostgreSQL runs triggers
-- for the same event in name order: `zz_grant_artist_capability_on_signup`
-- follows migration 001's `on_auth_user_created`, so the profile and invite
-- gate have already completed. If the gate rejects signup, the auth.users
-- insert rolls back and this trigger never runs.
--
-- The handle metadata requirement identifies the self-serve artist lane
-- established in migration 133. Admin-provisioned buyer, staff, and industry
-- lanes do not submit a handle and are also excluded explicitly.
-- ============================================================

CREATE OR REPLACE FUNCTION public.grant_artist_capability_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NULLIF(TRIM(NEW.raw_user_meta_data->>'handle'), '') IS NULL
     OR NULLIF(TRIM(NEW.raw_user_meta_data->>'provision_intent_id'), '') IS NOT NULL
     OR NULLIF(TRIM(NEW.raw_app_meta_data->>'role'), '') IS NOT NULL
     OR NULLIF(TRIM(NEW.raw_app_meta_data->>'staff_role'), '') IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.capability_grants (
    profile_id,
    capability,
    status,
    source,
    decided_at
  )
  SELECT
    NEW.id,
    'artist',
    'approved',
    'signup',
    now()
  FROM public.user_profiles profile
  WHERE profile.id = NEW.id
    AND profile.member_type = 'artist'
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_artist_capability_on_signup() FROM PUBLIC;

DROP TRIGGER IF EXISTS zz_grant_artist_capability_on_signup ON auth.users;
CREATE TRIGGER zz_grant_artist_capability_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_artist_capability_on_signup();

-- Repair accounts created after migration 042 without overriding a current
-- pending/approved capability decision. A prior denied row is terminal and
-- does not represent the stored artist identity's current access state.
INSERT INTO public.capability_grants (
  profile_id,
  capability,
  status,
  source,
  decided_at
)
SELECT
  profile.id,
  'artist',
  'approved',
  'backfill',
  now()
FROM public.user_profiles profile
WHERE profile.member_type = 'artist'
  AND NOT EXISTS (
    SELECT 1
    FROM public.capability_grants grant_row
    WHERE grant_row.profile_id = profile.id
      AND grant_row.capability = 'artist'
      AND grant_row.status IN ('pending', 'approved')
  )
ON CONFLICT DO NOTHING;
