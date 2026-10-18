-- 244_verified_signup_claim_sentinel.sql
--
-- Closes #191.
--
-- Middleware retries POST /api/claim-collaborators on every navigation for as
-- long as user_profiles.claimed_at is NULL. complete_verified_signup_claim
-- (migration 214) returns FALSE for a confirmed account on three paths that
-- write nothing, so the sentinel never flips and every request pays for an
-- extra auth round trip and an RPC that cannot succeed:
--
--   1. the account holds no signup token, or a malformed one (tokenless case);
--   2. the account holds a well-formed token but no artist_invites row
--      redeems it and no collaborator_invites row does either, because the
--      invite expired, was revoked, or was consumed by someone else
--      (dead-token case).
--
-- This migration sets claimed_at = COALESCE(claimed_at, now()) on every
-- return-FALSE path for a confirmed account that has an email. The function
-- still returns FALSE on those paths, because no invitation was redeemed. That
-- keeps /api/claim-collaborators (409 when not completed), the signin page and
-- the signup page on their current semantics.
--
-- Production status: on 2026-10-18 a read-only check found 10 user_profiles
-- rows and 0 with claimed_at NULL, so no account is stuck today. This change
-- is preventive. It covers both the tokenless and the dead-token cases, which
-- is why it keeps "Closes #191".
--
-- Why setting the sentinel cannot block a later legitimate claim: claimed_at
-- is read only by middleware, as a retry sentinel. The function keys on the
-- verified_signup_invite_claims ledger and on token + email, never on
-- claimed_at. Later invites are redeemed through an explicit token (signin
-- ?invite=, /auth/callback metadata, token-bearing POST), all of which reach
-- the function and are unaffected by the sentinel.
--
-- What does not change:
--   - An unconfirmed account, or one with no email, still gets FALSE and
--     claimed_at stays NULL, so it keeps retrying until it confirms.
--   - The success path (artist_invites, collaborator_invites, ledger insert,
--     claim_collaborators, claimed_at write, metadata token removal) is
--     copied from migration 214 unchanged.
--   - The early-return TRUE branch for an existing ledger row is unchanged.
--   - Grants stay service_role only.
--
-- Edits to the function body relative to 214:
--   a. The token expression only accepts p_invite_token when it matches the
--      64-hex pattern. 214 used any non-empty parameter, so a malformed
--      explicit value overrode a valid metadata token. Now a malformed
--      parameter is ignored and the metadata token is used.
--   b. 214's single guard
--        IF NOT FOUND OR v_email IS NULL OR v_token IS NULL OR v_token !~ '...'
--      is split into two sequential guards. The second writes the sentinel.
--   c. The collaborator_invites "IF NOT FOUND" dead-end writes the sentinel.
--
-- Backfill choice: the one-time UPDATE at the bottom is not "all confirmed
-- users with NULL claimed_at". That would be wrong, because a confirmed user
-- whose metadata token still redeems a live invite has a pending redemption
-- that the middleware retry would complete, and setting the sentinel would
-- short-circuit it. The backfill instead writes exactly what the redefined
-- function would write on that user's next navigation: confirmed users with an
-- email, no ledger row, and either no well-formed metadata token or a
-- well-formed token that no invite redeems under the same predicates the
-- function uses (pending and unexpired, or accepted by that same user).
--
-- Not changed here, recorded for the owner: the ledger early-return TRUE
-- branch does not write claimed_at. It is normally unreachable because the
-- success path writes it in the same transaction. The backfill skips users
-- with a ledger row for the same reason.
--
-- This file is authored but must not be applied automatically. Apply it by
-- hand, then run the OWNER-RUN BEHAVIORAL VERIFICATION block at the bottom.

BEGIN;

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

  -- The explicit parameter wins only when it is a well-formed 64-hex token.
  -- Anything else (empty, malformed) falls back to the metadata token.
  SELECT email,
         COALESCE(
           CASE
             WHEN trim(p_invite_token) ~ '^[A-Fa-f0-9]{64}$' THEN trim(p_invite_token)
           END,
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

  -- From here the account is confirmed and has an email, so every FALSE below
  -- sets the middleware sentinel. The function still reports that no
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
      UPDATE public.user_profiles
         SET claimed_at = COALESCE(claimed_at, now())
       WHERE id = p_user_id;

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
-- user's next navigation, and the sentinel branches have no other side effect.
-- Excluded: unconfirmed or email-less users (they keep retrying until they
-- confirm), users with a ledger row (the function returns TRUE for them), and
-- users whose metadata token still redeems a live invite (a pending
-- redemption must not be short-circuited). The redeemable-invite predicates
-- below mirror the two lookups in the function body.
UPDATE public.user_profiles p
   SET claimed_at = now()
  FROM auth.users u
 WHERE p.id = u.id
   AND p.claimed_at IS NULL
   AND u.email_confirmed_at IS NOT NULL
   AND u.email IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM public.verified_signup_invite_claims c
      WHERE c.user_id = u.id
   )
   AND (
     NULLIF(trim(u.raw_user_meta_data->>'signup_invite_token'), '') IS NULL
     OR trim(u.raw_user_meta_data->>'signup_invite_token') !~ '^[A-Fa-f0-9]{64}$'
     OR (
       NOT EXISTS (
         SELECT 1
           FROM public.artist_invites ai
          WHERE ai.invite_token = trim(u.raw_user_meta_data->>'signup_invite_token')
            AND lower(ai.email) = lower(u.email)
            AND (
              (ai.status = 'pending' AND (ai.token_expires_at IS NULL OR ai.token_expires_at > now()))
              OR (ai.status = 'accepted' AND ai.accepted_user_id = u.id)
            )
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.collaborator_invites ci
          WHERE ci.invite_token = trim(u.raw_user_meta_data->>'signup_invite_token')
            AND lower(ci.invited_email) = lower(u.email)
            AND (
              (ci.status = 'pending' AND ci.token_expires_at > now())
              OR (ci.status = 'accepted' AND ci.accepted_user_id = u.id)
            )
       )
     )
   );

NOTIFY pgrst, 'reload schema';

COMMIT;

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
-- On 2026-10-18 this was 0. If it is still 0 the backfill is a no-op and the
-- probes below need a synthetic user (create one inside the transaction).
-- Otherwise the count should drop by the number of confirmed users with no
-- usable token or a dead token, and should not change for unconfirmed users or
-- users whose token still redeems a live invite.
--
--   C1  MUST SUCCEED  confirmed user, no metadata token: function returns
--                     false AND user_profiles.claimed_at becomes non-null
--   C1b MUST SUCCEED  confirmed user whose metadata token is well-formed but
--                     matches no redeemable invite (expired, revoked or used):
--                     returns false AND claimed_at becomes non-null
--   C2  MUST SUCCEED  unconfirmed user, no token: returns false AND claimed_at
--                     stays null
--   C3  MUST SUCCEED  confirmed user with a valid pending invite token:
--                     returns true, invite accepted, ledger row written,
--                     claimed_at set, metadata token removed (unchanged
--                     migration 214 behavior)
--   C3b MUST SUCCEED  confirmed user with a valid pending metadata token and a
--                     malformed explicit p_invite_token ('not-hex'): returns
--                     true (the malformed parameter is ignored)
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
--   -- C1b: pick a confirmed user whose metadata token is 64-hex but whose
--   -- invite is expired, revoked or consumed.
--   SAVEPOINT c1b;
--   SELECT public.complete_verified_signup_claim('<CONFIRMED_DEAD_TOKEN_USER_ID>');
--   -- Expect: false
--   SELECT claimed_at IS NOT NULL AS sentinel_set
--     FROM public.user_profiles WHERE id = '<CONFIRMED_DEAD_TOKEN_USER_ID>';
--   -- Expect: true
--   ROLLBACK TO SAVEPOINT c1b;
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
--   -- C3b: same user as C3, with a malformed explicit token.
--   SAVEPOINT c3b;
--   SELECT public.complete_verified_signup_claim('<CONFIRMED_TOKEN_USER_ID>', 'not-hex');
--   -- Expect: true
--   ROLLBACK TO SAVEPOINT c3b;
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
