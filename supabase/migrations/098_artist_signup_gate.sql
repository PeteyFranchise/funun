-- ============================================================
-- Funūn — Phase 27 (artist-invite-only-onboarding): the gate
-- Migration 098 — handle_new_user() artist-branch invite gate
--
-- WHY: Phase 27 gates artist self-serve signup behind an invitation
-- allowlist (D-01/D-02/D-03). D-02 requires the check be enforced where
-- the account is actually provisioned — the handle_new_user() trigger —
-- not merely on the signup page, which is bypassable via a direct POST to
-- Supabase's /auth/v1/signup REST endpoint. This migration re-defines
-- handle_new_user() = migration 086's current live body (curator → buyer
-- → industry → default/artist), reproduced VERBATIM for every branch
-- EXCEPT the default (artist) branch, which gets one new gate check
-- inserted as its first statement, before its two existing INSERTs.
--
-- SCOPE (RESEARCH Pitfall 1 — the #1 risk on this migration): the gate is
-- the FIRST statement inside the DEFAULT/ARTIST BRANCH ONLY, positioned
-- after all three role-specific `IF ... RETURN NEW` blocks (curator,
-- buyer, industry). Curator/buyer/industry provisioning is byte-for-byte
-- unchanged from migration 086 — none of those branches can reach the
-- gate, because each RETURNs NEW before the artist branch is ever
-- reached. See __tests__/migration-098-gate.test.ts for the automated
-- placement assertion that guards this invariant.
--
-- WHAT (the gate, inside the artist branch only):
--   1. v_is_invited := EXISTS(collaborators WHERE LOWER(email) matches)
--      OR EXISTS(artist_invites WHERE LOWER(email) matches AND
--      status='pending' AND (token_expires_at IS NULL OR in the future)).
--      This is the SQL twin of lib/invites/allowlist.ts's
--      isArtistEmailAllowed() — both sides are checked against the same
--      shared fixture table (lib/invites/invite-fixtures.ts) by
--      __tests__/migration-098-gate.test.ts (RESEARCH Pitfall 3).
--   2. IF NOT v_is_invited THEN RAISE EXCEPTION 'not_invited' — this rolls
--      back the WHOLE transaction, including the auth.users row Supabase's
--      signUp() just inserted. No phantom account, no user_profiles row,
--      no enumeration leak from this layer (D-01/D-02).
--   3. On the admitted path, mark the matching artist_invites row
--      'accepted' BEFORE the existing INSERTs — wrapped in its own
--      BEGIN...EXCEPTION WHEN OTHERS THEN NULL; END; block (mirrors the
--      claim_collaborators() exception-isolation this function already
--      uses) so a mark-accepted failure can never roll back a legitimate
--      signup.
--   4. The existing user_profiles/subscriptions INSERTs and the
--      claim_collaborators() call are UNCHANGED — by construction, claim
--      now only ever runs for admitted signups (RESEARCH sequencing).
--
-- HUMAN-GATED — never `supabase db push` from an agent (matches Phases
-- 16/21/25/28's standing convention, and 097's own header). This migration
-- is TEXT/test only — the actual push is Phase 27's blocking checkpoint
-- (plan 27-11), reviewed and run by the owner via Codex. Do NOT push this
-- migration from this plan; doing so risks locking out real users before
-- the bootstrap/founding-cohort invites (D-18) are confirmed seeded.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_is_invited BOOLEAN;
BEGIN
  IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN
    RETURN NEW;
  END IF;

  -- Buyer branch (Phase 16, migration 080; restored by migration 086):
  -- buyers are a fully separate account type — RETURN NEW immediately,
  -- unchanged, unreachable by the new gate below.
  IF (NEW.raw_app_meta_data->>'role') = 'buyer' THEN
    RETURN NEW;
  END IF;

  -- Industry branch (migration 039/076/085/086): unchanged, unreachable by
  -- the new gate below — an industry member always RETURNs NEW before the
  -- default (artist) branch is ever reached.
  IF (NEW.raw_app_meta_data->>'role') = 'industry' THEN
    INSERT INTO public.user_profiles (id, member_type, artist_name, industry_roles, roles)
    VALUES (
      NEW.id,
      'industry',
      NEW.raw_user_meta_data->>'display_name',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(NEW.raw_user_meta_data->'role_badges', '[]'::jsonb))),
      COALESCE(NEW.raw_user_meta_data->'profile_roles', '[]'::jsonb)
    );

    BEGIN
      INSERT INTO public.subscriptions (user_id, tier, status)
      VALUES (NEW.id, 'free', 'active');
    EXCEPTION WHEN OTHERS THEN
      NULL; -- swallow subscription-insert errors; account creation continues
    END;

    BEGIN
      INSERT INTO public.capability_grants (profile_id, capability, status, role_slugs, source, decided_at)
      VALUES (
        NEW.id,
        'industry',
        'approved',
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(NEW.raw_user_meta_data->'role_badges', '[]'::jsonb))),
        'signup',
        now()
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- swallow grant-insert errors; account creation continues
    END;

    RETURN NEW;
  END IF;

  -- ── default / artist branch — ONLY branch the new gate applies to ──────

  -- ── NEW: artist self-serve invite gate (Phase 27, D-01/D-02/D-03) ──────
  -- Staff/industry/buyer/curator provisioning above is untouched — this
  -- check is the FIRST statement inside the default (artist) branch only,
  -- matching D-03's "artist branch only" scope exactly, and runs BEFORE
  -- any INSERT so an uninvited signup leaves no trace of any kind.
  SELECT EXISTS (
    SELECT 1 FROM public.collaborators WHERE LOWER(email) = LOWER(NEW.email)
  ) OR EXISTS (
    SELECT 1 FROM public.artist_invites
    WHERE LOWER(email) = LOWER(NEW.email)
      AND status = 'pending'
      AND (token_expires_at IS NULL OR token_expires_at > NOW())
  ) INTO v_is_invited;

  IF NOT v_is_invited THEN
    -- Raising here rolls back the ENTIRE transaction, including the
    -- auth.users row Supabase's signUp() just inserted — no phantom
    -- account, no profile row, no enumeration leak from this layer.
    RAISE EXCEPTION 'not_invited' USING ERRCODE = 'P0001';
  END IF;

  -- Mark the matching invite accepted BEFORE the inserts below. Exception-
  -- isolated (mirrors the claim_collaborators() block further down) so a
  -- mark-accepted failure can never roll back an otherwise-legitimate
  -- signup that already passed the gate above.
  BEGIN
    UPDATE public.artist_invites
      SET status = 'accepted', accepted_user_id = NEW.id, accepted_at = NOW()
      WHERE LOWER(email) = LOWER(NEW.email) AND status = 'pending';
  EXCEPTION WHEN OTHERS THEN
    NULL; -- swallow accept-marking errors; account creation continues
  END;

  INSERT INTO public.user_profiles (id) VALUES (NEW.id);
  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active');

  -- Phase 4: claim any collaborator rows matching this user's email.
  -- Unchanged — by construction this now only ever runs for signups that
  -- passed the gate above (RESEARCH sequencing note). Nested exception
  -- block so a claim failure cannot orphan the new account.
  BEGIN
    PERFORM public.claim_collaborators(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- swallow claim errors; account creation continues
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
