-- ============================================================
-- Funūn — Wave 4: The Green Room
-- Migration 039: handle_new_user() industry branch (D-01/D-03
-- resolved — app_metadata-keyed, no side-channel table)
-- Run via: supabase db push
-- ============================================================

-- Full-body replace of handle_new_user() (migration 030 already
-- applied that body). The existing curator early-return branch and the
-- default artist branch (with claim_collaborators()) are preserved
-- verbatim; a new industry branch is inserted between them.
--
-- CRITICAL DIVERGENCE FROM RESEARCH: 08-RESEARCH.md Pitfall 2
-- recommends a side-channel invites table keyed independently of
-- auth.users. CONTEXT.md D-03 (RESOLVED 2026-07-04) supersedes this:
-- industry accounts are created via admin.createUser() with
-- app_metadata.role='industry' set atomically at creation time (plan
-- 08-06's createIndustryMember()), so this trigger branches on
-- raw_app_meta_data directly — no side-channel table, no post-insert
-- UPDATE, no timing race (RESEARCH Pitfall 3).
--
-- Contract with plan 08-06's createIndustryMember(): it must pass, via
-- admin.createUser()'s user_metadata (-> NEW.raw_user_meta_data):
--   - display_name   -> artist_name
--   - role_badges    -> JSON array of lib/industry-roles.ts slugs,
--                       copied into industry_roles (TEXT[])
--   - profile_roles  -> pre-built ProfileRole[] JSONB (mapped from
--                       those same slugs to a PROFILE_ROLES preset
--                       where one exists, else {kind:'custom',label}),
--                       copied straight into roles (JSONB)
-- The slug -> preset mapping logic lives in TypeScript (plan 08-06),
-- not in this trigger, so a role badge renders correctly on day one
-- without embedding a mapping table in PL/pgSQL (D-08 / RESEARCH
-- Pitfall 4).
--
-- No CREATE TRIGGER statement — on_auth_user_created (migration 001)
-- already invokes this function and picks up the replaced body
-- automatically.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN
    RETURN NEW;
  END IF;

  -- Industry branch (D-01/D-03 resolved). Unlike the curator branch,
  -- an industry member DOES get a real artist_profiles row (RESEARCH
  -- Pitfall 3 — never a bare RETURN NEW), just built without
  -- claim_collaborators() (that flow is artist-only).
  IF (NEW.raw_app_meta_data->>'role') = 'industry' THEN
    INSERT INTO public.artist_profiles (id, member_type, artist_name, industry_roles, roles)
    VALUES (
      NEW.id,
      'industry',
      NEW.raw_user_meta_data->>'display_name',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(NEW.raw_user_meta_data->'role_badges', '[]'::jsonb))),
      COALESCE(NEW.raw_user_meta_data->'profile_roles', '[]'::jsonb)
    );

    -- D-18: industry members DO get a free subscriptions row, same as
    -- artists. Wrapped in the same nested exception-isolation pattern
    -- as the artist branch's claim_collaborators call below so a
    -- secondary-insert failure cannot orphan the artist_profiles row
    -- just created above (mirrors CR-04 / migration 027).
    BEGIN
      INSERT INTO public.subscriptions (user_id, tier, status)
      VALUES (NEW.id, 'free', 'active');
    EXCEPTION WHEN OTHERS THEN
      NULL; -- swallow subscription-insert errors; account creation continues
    END;

    RETURN NEW;
  END IF;

  INSERT INTO public.artist_profiles (id) VALUES (NEW.id);
  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active');

  -- Phase 4: claim any collaborator rows matching this user's email.
  -- Wrapped in a nested exception block so a claim failure cannot
  -- orphan the new account by rolling back the two inserts above (CR-04).
  BEGIN
    PERFORM public.claim_collaborators(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- swallow claim errors; account creation continues
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
