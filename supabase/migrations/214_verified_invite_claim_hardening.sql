-- ============================================================
-- Funūn — Beta security gate: verified, token-bound invite claims
-- Migration 214
--
-- HUMAN-GATED. Do not apply automatically. Production Auth confirmation
-- must be enabled in the coordinated release window described in the task
-- plan before external Beta onboarding resumes.
--
-- Invariants:
--   1. Email alone never admits a self-serve Member Account.
--   2. Signup must present the exact pending invitation capability for the
--      exact auth email.
--   3. The auth.users INSERT trigger creates only base account rows; it never
--      accepts an invitation or claims collaborator identity.
--   4. Post-confirmation redemption re-reads auth.users.email_confirmed_at,
--      consumes one exact invite under row lock, and links collaborators in
--      the same transaction.
--   5. Browser roles cannot call the redemption function or read its ledger.
-- ============================================================

BEGIN;

CREATE TABLE public.verified_signup_invite_claims (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  source      TEXT NOT NULL CHECK (source IN ('artist_invite', 'collaborator_invite')),
  invite_id   UUID NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.verified_signup_invite_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.verified_signup_invite_claims FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.verified_signup_invite_claims TO service_role;

COMMENT ON TABLE public.verified_signup_invite_claims IS
  'Service-role-only, append-only record of invitation capabilities redeemed after auth email verification. Raw capabilities are never copied into this ledger.';

-- Replace the current signup trigger body. Non-member branches and the
-- provision-intent exemption retain their existing behavior. The default
-- self-serve member branch changes from an email allowlist to exact token +
-- email admission and deliberately performs no acceptance/claim writes.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_signup_token       TEXT;
  v_has_invite         BOOLEAN := FALSE;
  v_admin_provisioned  BOOLEAN := FALSE;
BEGIN
  IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN
    RETURN NEW;
  END IF;

  IF (NEW.raw_app_meta_data->>'role') = 'buyer' THEN
    RETURN NEW;
  END IF;

  IF (NEW.raw_app_meta_data->>'staff_role') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.raw_app_meta_data->>'role') = 'industry' THEN
    INSERT INTO public.user_profiles (id, member_type, artist_name, industry_roles, roles, claimed_at)
    VALUES (
      NEW.id,
      'industry',
      NEW.raw_user_meta_data->>'display_name',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(NEW.raw_user_meta_data->'role_badges', '[]'::jsonb))),
      COALESCE(NEW.raw_user_meta_data->'profile_roles', '[]'::jsonb),
      now()
    );

    BEGIN
      INSERT INTO public.subscriptions (user_id, tier, status)
      VALUES (NEW.id, 'free', 'active');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      INSERT INTO public.capability_grants (
        profile_id,
        capability,
        status,
        role_slugs,
        source,
        decided_at
      )
      VALUES (
        NEW.id,
        'industry',
        'approved',
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(NEW.raw_user_meta_data->'role_badges', '[]'::jsonb))),
        'signup',
        now()
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN NEW;
  END IF;

  DELETE FROM public.account_provision_intents
   WHERE id::text = NEW.raw_user_meta_data->>'provision_intent'
     AND lower(email) = lower(NEW.email)
     AND expires_at > now();
  v_admin_provisioned := FOUND;

  IF NOT v_admin_provisioned THEN
    v_signup_token := NULLIF(trim(NEW.raw_user_meta_data->>'signup_invite_token'), '');

    IF v_signup_token IS NULL OR v_signup_token !~ '^[A-Fa-f0-9]{64}$' THEN
      RAISE EXCEPTION 'invalid_invite' USING ERRCODE = 'P0001';
    END IF;

    SELECT EXISTS (
      SELECT 1
        FROM public.artist_invites
       WHERE invite_token = v_signup_token
         AND lower(email) = lower(NEW.email)
         AND status = 'pending'
         AND (token_expires_at IS NULL OR token_expires_at > now())
    ) INTO v_has_invite;

    IF NOT v_has_invite THEN
      SELECT EXISTS (
        SELECT 1
          FROM public.collaborator_invites
         WHERE invite_token = v_signup_token
           AND lower(invited_email) = lower(NEW.email)
           AND status = 'pending'
           AND token_expires_at > now()
      ) INTO v_has_invite;
    END IF;

    IF NOT v_has_invite THEN
      RAISE EXCEPTION 'invalid_invite' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.user_profiles (id, handle)
    VALUES (NEW.id, NULLIF(trim(NEW.raw_user_meta_data->>'handle'), ''));
  EXCEPTION WHEN unique_violation OR raise_exception THEN
    INSERT INTO public.user_profiles (id) VALUES (NEW.id);
  END;

  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active');

  IF v_admin_provisioned THEN
    UPDATE public.user_profiles SET claimed_at = now() WHERE id = NEW.id;
  END IF;

  -- Invitation acceptance and claim_collaborators() intentionally do not run
  -- here. At auth.users INSERT time the email has not been proven.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- This function is invoked by its auth.users trigger, never as an application
-- RPC. Keep direct execution unavailable even if an older deployment left the
-- function's default PUBLIC privilege intact.
REVOKE ALL ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated, service_role;

-- Returns true only when the account is verified and either already completed
-- this claim or atomically consumes its exact pending capability now.
CREATE OR REPLACE FUNCTION public.complete_verified_signup_claim(
  p_user_id UUID,
  p_invite_token TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email        TEXT;
  v_token        TEXT;
  v_invite_id    UUID;
  v_source       TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.verified_signup_invite_claims
     WHERE user_id = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  SELECT email,
         COALESCE(
           NULLIF(trim(p_invite_token), ''),
           NULLIF(trim(raw_user_meta_data->>'signup_invite_token'), '')
         )
    INTO v_email, v_token
    FROM auth.users
   WHERE id = p_user_id
     AND email_confirmed_at IS NOT NULL
   FOR UPDATE;

  IF NOT FOUND OR v_email IS NULL OR v_token IS NULL OR v_token !~ '^[A-Fa-f0-9]{64}$' THEN
    RETURN FALSE;
  END IF;

  SELECT id
    INTO v_invite_id
    FROM public.artist_invites
   WHERE invite_token = v_token
     AND lower(email) = lower(v_email)
     AND (
       (status = 'pending' AND (token_expires_at IS NULL OR token_expires_at > now()))
       OR (status = 'accepted' AND accepted_user_id = p_user_id)
     )
   FOR UPDATE;

  IF FOUND THEN
    v_source := 'artist_invite';

    UPDATE public.artist_invites
       SET status = 'accepted',
           accepted_user_id = p_user_id,
           accepted_at = COALESCE(accepted_at, now()),
           updated_at = now()
     WHERE id = v_invite_id
       AND (status = 'pending' OR accepted_user_id = p_user_id);
  ELSE
    SELECT id
      INTO v_invite_id
      FROM public.collaborator_invites
     WHERE invite_token = v_token
       AND lower(invited_email) = lower(v_email)
       AND (
         (status = 'pending' AND token_expires_at > now())
         OR (status = 'accepted' AND accepted_user_id = p_user_id)
       )
     FOR UPDATE;

    IF NOT FOUND THEN
      RETURN FALSE;
    END IF;

    v_source := 'collaborator_invite';

    UPDATE public.collaborator_invites
       SET status = 'accepted',
           accepted_user_id = p_user_id,
           accepted_at = COALESCE(accepted_at, now())
     WHERE id = v_invite_id
       AND (status = 'pending' OR accepted_user_id = p_user_id);
  END IF;

  INSERT INTO public.verified_signup_invite_claims (
    user_id,
    source,
    invite_id,
    token_hash
  )
  VALUES (
    p_user_id,
    v_source,
    v_invite_id,
    pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex')
  )
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM public.claim_collaborators(p_user_id, v_email);

  UPDATE public.user_profiles
     SET claimed_at = COALESCE(claimed_at, now())
   WHERE id = p_user_id;

  -- Do not retain the raw bearer capability on the long-lived auth identity.
  UPDATE auth.users
     SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) - 'signup_invite_token'
   WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_verified_signup_claim(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_verified_signup_claim(UUID, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.complete_verified_signup_claim(UUID, TEXT) IS
  'Service-role-only atomic post-verification redemption. Binds p_user_id to auth.users, requires email_confirmed_at, consumes the exact token/email invite under lock, claims matching collaborator identity, records a token hash, and removes the raw token from auth metadata.';

-- Stop the legacy middleware retry loop for accounts that predate this
-- security boundary. Their historical claim opportunity already occurred;
-- future invitation claims must present a fresh capability explicitly.
UPDATE public.user_profiles
   SET claimed_at = now()
 WHERE claimed_at IS NULL
   AND id IN (SELECT id FROM auth.users);

NOTIFY pgrst, 'reload schema';

COMMIT;
