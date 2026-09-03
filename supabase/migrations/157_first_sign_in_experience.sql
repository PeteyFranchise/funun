-- ============================================================
-- Funūn — first-sign-in experience
-- Migration 157: private completion state for new user accounts.
-- ============================================================

ALTER TABLE public.user_profiles
  ADD COLUMN first_sign_in_completed_at TIMESTAMPTZ;

-- Existing accounts have already established their normal landing behavior.
-- Backfill them before new signups begin receiving the welcome experience.
UPDATE public.user_profiles
SET first_sign_in_completed_at = now()
WHERE first_sign_in_completed_at IS NULL;

COMMENT ON COLUMN public.user_profiles.first_sign_in_completed_at IS
  'Private server-owned timestamp. NULL means the new user account should receive its one-time contextual Sound Vault welcome.';

-- The value is deliberately absent from the authenticated/anon column grants.
-- It is read and written only by server code after verifying auth.getUser().

-- Accepting a collaborator invitation is the profile-creation boundary:
-- handle_new_user() creates user_profiles, then claim_collaborators() links
-- every matching roster profile through claimed_by. Keep the invitation
-- lifecycle in sync with that verified identity transition.
CREATE OR REPLACE FUNCTION public.accept_collaborator_invites_on_claim()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.claimed_by IS NULL AND NEW.claimed_by IS NOT NULL THEN
    UPDATE public.collaborator_invites
    SET status = 'accepted',
        accepted_user_id = NEW.claimed_by,
        accepted_at = COALESCE(accepted_at, now())
    WHERE collaborator_id = NEW.id
      AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_collaborator_invites_on_claim() FROM PUBLIC;

CREATE TRIGGER collaborator_invites_accept_on_claim
  AFTER UPDATE OF claimed_by ON public.collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.accept_collaborator_invites_on_claim();

-- Reconcile invitations for profiles claimed before this lifecycle trigger.
UPDATE public.collaborator_invites invite
SET status = 'accepted',
    accepted_user_id = collaborator.claimed_by,
    accepted_at = COALESCE(invite.accepted_at, now())
FROM public.collaborators collaborator
WHERE invite.collaborator_id = collaborator.id
  AND collaborator.claimed_by IS NOT NULL
  AND invite.status = 'pending';

NOTIFY pgrst, 'reload schema';
