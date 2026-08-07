-- ============================================================
-- Funūn — Phase 28: Industry Accounts & Green Room Access Model
-- Migration 085: handle_new_user() industry capability grant write +
--                 backfill + Green Room member_type RLS gate
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (matches Phases 16/21/25's standing convention). Draft + text-tested
-- only; the owner reviews and pushes via Codex (see 28-05-PLAN.md Task 3).
-- ============================================================

-- ─── (a) handle_new_user(): industry branch now writes the capability ───
-- INDUSTRY-01/06: today, no account (however created) can pass
-- hasCapability(user,'industry') at signup time — createIndustryMember()/
-- the admin-invite path and the repointed curator claim (Plan 28-03) both
-- rely on this trigger's industry branch to set member_type, but the
-- branch never wrote a capability_grants row. This closes that gap at the
-- SINGLE writer (atomic with the user_profiles insert the branch already
-- owns) so BOTH creation call sites are covered for free — no racing
-- app-side insert (PATTERNS Architecture note).
--
-- Full-body replace of handle_new_user() (migration 076 already applied
-- this body post-rename). The curator early-return branch and the artist
-- default branch (with claim_collaborators()) are preserved verbatim;
-- only the industry branch gains a new capability_grants insert.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN
    RETURN NEW;
  END IF;

  -- Industry branch (D-01/D-03 resolved, migration 039; renamed table,
  -- migration 076). Unlike the curator branch, an industry member DOES
  -- get a real profile row (never a bare RETURN NEW), just built without
  -- claim_collaborators() (that flow is artist-only).
  IF (NEW.raw_app_meta_data->>'role') = 'industry' THEN
    INSERT INTO public.user_profiles (id, member_type, artist_name, industry_roles, roles)
    VALUES (
      NEW.id,
      'industry',
      NEW.raw_user_meta_data->>'display_name',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(NEW.raw_user_meta_data->'role_badges', '[]'::jsonb))),
      COALESCE(NEW.raw_user_meta_data->'profile_roles', '[]'::jsonb)
    );

    -- D-18: industry members DO get a free subscriptions row, same as
    -- artists. Wrapped in the same nested exception-isolation pattern as
    -- the artist branch's claim_collaborators call below so a
    -- secondary-insert failure cannot orphan the profile row just
    -- created above (mirrors CR-04 / migration 027).
    BEGIN
      INSERT INTO public.subscriptions (user_id, tier, status)
      VALUES (NEW.id, 'free', 'active');
    EXCEPTION WHEN OTHERS THEN
      NULL; -- swallow subscription-insert errors; account creation continues
    END;

    -- INDUSTRY-01/06 (migration 085): single writer of the industry
    -- capability grant, atomic with the user_profiles insert above.
    -- source='signup' is already an allowed value per migration 042's
    -- CHECK constraint. Wrapped in the same nested exception-isolation
    -- idiom as the subscriptions insert above (T-28-05-04) so a
    -- grant-insert hiccup cannot orphan the account.
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

  -- Phase 4: claim any collaborator rows matching this user's email.
  -- Wrapped in a nested exception block so a claim failure cannot orphan
  -- the new account by rolling back the two inserts above (CR-04).
  BEGIN
    PERFORM public.claim_collaborators(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- swallow claim errors; account creation continues
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── (b) One-time backfill: existing industry accounts lacking a grant ──
-- Mirrors migration 042's own D-12 backfill shape. Idempotent via the
-- anti-join guard below, so re-running this migration is safe and it will
-- never trip capability_grants_active_uniq (no duplicate approved row for
-- an account migration 042 already backfilled from member_type).
INSERT INTO capability_grants (profile_id, capability, status, source, decided_at)
SELECT up.id, 'industry', 'approved', 'backfill', now()
FROM public.user_profiles up
WHERE up.member_type = 'industry'
  AND NOT EXISTS (
    SELECT 1 FROM capability_grants cg
    WHERE cg.profile_id = up.id
      AND cg.capability = 'industry'
      AND cg.status = 'approved'
  );

-- ─── (c) INDUSTRY-02: Green Room member_type RLS backstop ───────────────
-- Mirrors Plan 28-02's app-layer greenRoomPosterGate() member_type rule
-- (PATTERNS Pattern 2 — a client-visible check is never sufficient; RLS
-- must independently enforce the same rule so a direct PostgREST insert
-- can't bypass the route). T-28-05-01 mitigation.
--
-- Verified against the live schema (migration 076 renamed
-- artist_profiles -> user_profiles). Replaces the policy rather than
-- stacking a second one; green_room_posts_update_own is untouched.
DROP POLICY IF EXISTS "green_room_posts_insert_own" ON green_room_posts;

CREATE POLICY "green_room_posts_insert_own" ON green_room_posts FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND member_type IN ('artist', 'industry')
    )
  );
