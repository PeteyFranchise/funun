-- 244_verified_signup_claim_sentinel.sql
--
-- Closes #191.
--
-- Middleware retries POST /api/claim-collaborators on every navigation for as
-- long as user_profiles.claimed_at is NULL. A confirmed account whose auth
-- metadata carries no usable signup invite token never reaches the
-- success-path claimed_at write in migration 214: complete_verified_signup_claim
-- returns FALSE at the combined "not found / no token / malformed token" guard
-- before anything is written. The sentinel never flips, so every request pays
-- for an extra auth round trip and an RPC that cannot succeed.
--
-- This migration sets the sentinel on that one path: the account is confirmed
-- but holds no well-formed token, so there is nothing left to claim. The
-- function still returns FALSE there, because no invitation was redeemed. That
-- keeps /api/claim-collaborators (409 when not completed), the signin page and
-- the signup page on their current semantics.
--
-- What does not change:
--   - An unconfirmed account still gets FALSE and claimed_at stays NULL, so it
--     keeps retrying until it confirms.
--   - The token path (artist_invites, collaborator_invites, ledger insert,
--     claim_collaborators, success-path claimed_at write, metadata token
--     removal) is copied from migration 214 unchanged.
--   - The early-return TRUE branch for an existing ledger row is unchanged.
--   - Grants stay service_role only.
--
-- The only edit to the function body is splitting 214's single guard
--   IF NOT FOUND OR v_email IS NULL OR v_token IS NULL OR v_token !~ '...'
-- into two sequential guards, the second of which writes the sentinel.
--
-- Not changed here, recorded for the owner:
--   - A confirmed account holding a well-formed token whose invite has expired
--     or been revoked still returns FALSE without a sentinel write.
--   - The ledger early-return TRUE branch does not write claimed_at. It is
--     normally unreachable because the success path writes it in the same
--     transaction.
--
-- This file is authored but must not be applied automatically. Apply it by
-- hand, then run the OWNER-RUN BEHAVIORAL VERIFICATION block at the bottom.

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

  IF NOT FOUND OR v_email IS NULL THEN
    RETURN FALSE;
  END IF;

  -- A confirmed account with no usable capability has nothing left to claim,
  -- so set the middleware sentinel. The function still reports that no
  -- invitation was redeemed. A malformed token is treated as no token because
  -- nothing can ever match it: the route and this function both reject
  -- non-64-hex values.
  IF v_token IS NULL OR v_token !~ '^[A-Fa-f0-9]{64}$' THEN
    UPDATE public.user_profiles
       SET claimed_at = COALESCE(claimed_at, now())
     WHERE id = p_user_id;

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

-- One-time backfill, following the precedent at the end of migration 214.
-- It writes exactly the state the redefined function would write on that
-- user's next navigation, and the no-token branch has no other side effect.
-- Users still holding a well-formed token are excluded so a pending
-- redemption is never short-circuited, and unconfirmed users are excluded so
-- they keep retrying until they confirm.
UPDATE public.user_profiles p
   SET claimed_at = now()
  FROM auth.users u
 WHERE p.id = u.id
   AND p.claimed_at IS NULL
   AND u.email_confirmed_at IS NOT NULL
   AND u.email IS NOT NULL
   AND (
     NULLIF(trim(u.raw_user_meta_data->>'signup_invite_token'), '') IS NULL
     OR trim(u.raw_user_meta_data->>'signup_invite_token') !~ '^[A-Fa-f0-9]{64}$'
   );

NOTIFY pgrst, 'reload schema';

-- ─── OWNER-RUN BEHAVIORAL VERIFICATION ────────────────────────────────────
--
-- The Jest test for this migration proves the SQL was written with the
-- intended shape. It cannot prove Postgres behaves that way. Run these by
-- hand in the Supabase SQL editor after applying 244. Every probe ends in
-- ROLLBACK, so production is unchanged afterwards.
--
-- Before applying, and again after, record:
--
--   select count(*) from public.user_profiles where claimed_at is null;
--
-- The count should drop by the number of confirmed users with no usable token
-- and should not change for unconfirmed users or users holding a well-formed
-- token.
--
--   C1  MUST SUCCEED  confirmed user, no metadata token: function returns
--                     false AND user_profiles.claimed_at becomes non-null
--   C2  MUST SUCCEED  unconfirmed user, no token: returns false AND claimed_at
--                     stays null
--   C3  MUST SUCCEED  confirmed user with a valid pending invite token:
--                     returns true, invite accepted, ledger row written,
--                     claimed_at set, metadata token removed (unchanged
--                     migration 214 behavior)
--   C4  MUST FAIL     42501: the authenticated role calling the function
--                     directly
--
--   BEGIN;
--
--   -- C1: pick a confirmed user whose claimed_at is null and who has no
--   -- signup_invite_token in raw_user_meta_data.
--   SAVEPOINT c1;
--   SELECT public.complete_verified_signup_claim('<CONFIRMED_NO_TOKEN_USER_ID>');
--   -- Expect: false
--   SELECT claimed_at IS NOT NULL AS sentinel_set
--     FROM public.user_profiles WHERE id = '<CONFIRMED_NO_TOKEN_USER_ID>';
--   -- Expect: true
--   ROLLBACK TO SAVEPOINT c1;
--
--   -- C2: pick an unconfirmed user (email_confirmed_at is null).
--   SAVEPOINT c2;
--   SELECT public.complete_verified_signup_claim('<UNCONFIRMED_USER_ID>');
--   -- Expect: false
--   SELECT claimed_at IS NULL AS sentinel_still_null
--     FROM public.user_profiles WHERE id = '<UNCONFIRMED_USER_ID>';
--   -- Expect: true
--   ROLLBACK TO SAVEPOINT c2;
--
--   -- C3: pick a confirmed user whose email matches a pending invite and
--   -- whose metadata carries that invite's 64-hex token.
--   SAVEPOINT c3;
--   SELECT public.complete_verified_signup_claim('<CONFIRMED_TOKEN_USER_ID>');
--   -- Expect: true
--   ROLLBACK TO SAVEPOINT c3;
--
--   -- C4: the browser roles must not be able to call it.
--   SAVEPOINT c4;
--   SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub','<ANY_USER_ID>')::text, true);
--   SET ROLE authenticated;
--   SELECT public.complete_verified_signup_claim('<ANY_USER_ID>');
--   -- Expect: ERROR, SQLSTATE 42501 (permission denied for function)
--   RESET ROLE;
--   ROLLBACK TO SAVEPOINT c4;
--
--   ROLLBACK;
