-- ============================================================
-- Funūn — Phase 28 (corrective): restore the buyer branch in handle_new_user()
-- Migration 086
--
-- WHY: migration 085 rebuilt handle_new_user() from the migration-076 body
-- (its own comments misdirected the comparison) and DROPPED the buyer
-- early-return that migration 080 had added. Migrations 081–084 never
-- redefine the function, so 080 was the latest-correct definition. Live
-- consequence after 085 landed: a new buyer signup no longer hit the buyer
-- RETURN NEW and fell through to the artist/default branch — inserting
-- user_profiles + subscriptions and running claim_collaborators() for buyers,
-- regressing migration 080's buyer-account separation (D-11/D-04).
--
-- WHAT: re-define handle_new_user() = migration 085's body WITH migration
-- 080's buyer early-return RESTORED, in the correct order:
--   curator → buyer → industry (+ 085's capability_grants insert) → artist.
-- Migration 085's other parts — (b) the one-time industry-grant backfill and
-- (c) the green_room_posts_insert_own member_type RLS gate — are ALREADY
-- APPLIED and are intentionally NOT re-run here; this migration only fixes
-- the function body.
--
-- HUMAN-GATED — never `supabase db push` from an agent (matches Phases
-- 16/21/25/28's standing convention). Draft + text-tested only; the owner
-- reviews and pushes via Codex. Do NOT edit migration 085 (already landed).
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN
    RETURN NEW;
  END IF;

  -- Buyer branch (Phase 16, migration 080, D-11/D-04): buyers are a fully
  -- separate account type — RETURN NEW immediately with NO user_profiles
  -- insert and NO subscriptions insert. Positioned before the industry and
  -- default branches so a buyer signup can never fall through to the
  -- user_profiles insert (the phantom-row bug class this repo has fixed
  -- before). RESTORED here after migration 085 inadvertently dropped it.
  IF (NEW.raw_app_meta_data->>'role') = 'buyer' THEN
    RETURN NEW;
  END IF;

  -- Industry branch (migration 039; re-pointed to user_profiles by migration
  -- 076; capability grant added by migration 085). Unlike the curator/buyer
  -- branches, an industry member DOES get a real profile row (never a bare
  -- RETURN NEW), just built without claim_collaborators() (artist-only).
  IF (NEW.raw_app_meta_data->>'role') = 'industry' THEN
    INSERT INTO public.user_profiles (id, member_type, artist_name, industry_roles, roles)
    VALUES (
      NEW.id,
      'industry',
      NEW.raw_user_meta_data->>'display_name',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(NEW.raw_user_meta_data->'role_badges', '[]'::jsonb))),
      COALESCE(NEW.raw_user_meta_data->'profile_roles', '[]'::jsonb)
    );

    -- D-18: industry members DO get a free subscriptions row, same as artists.
    -- Nested exception-isolation so a secondary-insert failure cannot orphan
    -- the profile row just created above (mirrors CR-04 / migration 027).
    BEGIN
      INSERT INTO public.subscriptions (user_id, tier, status)
      VALUES (NEW.id, 'free', 'active');
    EXCEPTION WHEN OTHERS THEN
      NULL; -- swallow subscription-insert errors; account creation continues
    END;

    -- INDUSTRY-01/06 (migration 085, retained here): single writer of the
    -- industry capability grant, atomic with the user_profiles insert above.
    -- source='signup' is an allowed value per migration 042's CHECK.
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

  INSERT INTO public.user_profiles (id) VALUES (NEW.id);
  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active');

  -- Phase 4: claim any collaborator rows matching this user's email. Nested
  -- exception block so a claim failure cannot orphan the new account by
  -- rolling back the two inserts above (CR-04).
  BEGIN
    PERFORM public.claim_collaborators(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- swallow claim errors; account creation continues
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
