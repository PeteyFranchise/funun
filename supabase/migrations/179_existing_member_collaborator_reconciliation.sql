-- ============================================================
-- Funūn — existing Member collaborator reconciliation
-- Migration 179: link roster rows created after a Member's one-time signup
--                claim, and repair already-stale invitation cards.
--
-- HUMAN-GATED. Do not apply from an agent. The project owner runs
-- `supabase db push` after reviewing this file.
-- ============================================================

-- The signup claim only sees collaborator rows that exist at signup time.
-- This trigger closes the opposite ordering: a verified Member Account
-- already exists, then another Member adds that email to a roster later.
-- Identity is derived exclusively from the stored collaborator email plus
-- auth.users and the canonical user_profiles Member boundary. No client can
-- supply or choose claimed_by through this function.
CREATE OR REPLACE FUNCTION public.link_existing_member_collaborator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.claimed_by IS NULL
     AND NEW.email IS NOT NULL
     AND pg_catalog.btrim(NEW.email) <> '' THEN
    SELECT account.id
      INTO NEW.claimed_by
      FROM auth.users account
      JOIN public.user_profiles member_profile ON member_profile.id = account.id
     WHERE account.email_confirmed_at IS NOT NULL
       AND pg_catalog.lower(pg_catalog.btrim(account.email)) =
           pg_catalog.lower(pg_catalog.btrim(NEW.email))
     ORDER BY account.created_at ASC
     LIMIT 1;

    -- Migration 066's independent claimed=>confirmed trigger may have
    -- already run earlier in the same BEFORE-trigger sequence, so enforce
    -- the invariant here as well when this function establishes the claim.
    IF NEW.claimed_by IS NOT NULL THEN
      NEW.status := 'confirmed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.link_existing_member_collaborator()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS collaborators_link_existing_member ON public.collaborators;
CREATE TRIGGER collaborators_link_existing_member
  BEFORE INSERT OR UPDATE OF email ON public.collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.link_existing_member_collaborator();

-- Repair rows that were created after the matching Member account. Updating
-- claimed_by intentionally activates the existing lifecycle triggers that:
--   * mark the collaborator confirmed,
--   * accept its pending collaborator invitation, and
--   * attach verified project/work membership where applicable.
UPDATE public.collaborators collaborator
   SET claimed_by = account.id
  FROM auth.users account
  JOIN public.user_profiles member_profile ON member_profile.id = account.id
 WHERE collaborator.claimed_by IS NULL
   AND account.email_confirmed_at IS NOT NULL
   AND collaborator.email IS NOT NULL
   AND pg_catalog.btrim(collaborator.email) <> ''
   AND pg_catalog.lower(pg_catalog.btrim(account.email)) =
       pg_catalog.lower(pg_catalog.btrim(collaborator.email));

COMMENT ON FUNCTION public.link_existing_member_collaborator() IS
  'Trigger-only reconciliation for the existing-account-first collaborator lifecycle. Links a roster row to a confirmed Member Account by normalized stored email; never accepts a client-supplied identity id.';

NOTIFY pgrst, 'reload schema';
