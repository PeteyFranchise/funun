-- ============================================================
-- Funūn — Wave 2: Rights & Registration Rails
-- Migration 027: Fix handle_new_user() exception isolation and
-- explicit user_profiles RLS policies.
--
-- Changes:
--   1. CR-04: Wrap claim_collaborators() call in a nested
--      BEGIN/EXCEPTION WHEN OTHERS THEN NULL END block so a claim
--      failure cannot roll back the artist_profiles and subscriptions
--      inserts and orphan a new account.
--   2. CR-02: Replace the single ambiguous "Users manage own profile"
--      policy on user_profiles with three explicit per-operation
--      policies (SELECT, INSERT, UPDATE) to ensure first-time upserts
--      persist unambiguously across PostgREST versions.
--
-- Run via: supabase db push
-- ============================================================

-- ─── CR-04: Exception-isolated handle_new_user() ───────────────
-- The two core inserts (artist_profiles, subscriptions) commit even
-- if claim_collaborators() raises. The nested BEGIN block swallows
-- any claim exception without rolling back the outer transaction.
-- No CREATE TRIGGER statement — on_auth_user_created already exists
-- (migration 001) and picks up this replaced body automatically.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
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

-- ─── CR-02: Explicit user_profiles RLS policies ────────────────
-- The single ambiguous "Users manage own profile" policy had no
-- explicit FOR clause, relying on PostgREST to infer SELECT + INSERT
-- + UPDATE. Replacing it with three explicit policies makes the
-- first-time settings upsert (INSERT) unambiguous across versions.
DROP POLICY IF EXISTS "Users manage own profile" ON user_profiles;

CREATE POLICY "Users select own profile" ON user_profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users insert own profile" ON user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users update own profile" ON user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
