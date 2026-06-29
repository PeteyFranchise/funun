-- ============================================================
-- Funūn — Wave 2: Rights & Registration Rails
-- Migration 026: Collaborator Identity Reconciliation
-- Adds user_profiles table, claim/archive/favorite columns on
-- collaborators, claimed_at sentinel on artist_profiles, functional
-- email index, cross-user RLS policy, and SECURITY DEFINER claim
-- functions. Extends handle_new_user() to claim on signup.
-- Run via: supabase db push
-- ============================================================

-- ─── user_profiles (identity table for all Funūn users) ────────
-- Keyed by auth.users.id. Stores rights identity fields (PRO, IPI,
-- publisher, phone, address) and display info (display_name, bio).
-- Settings page writes here; back-fill propagates to claimed rows.
CREATE TABLE IF NOT EXISTS user_profiles (
  id              UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  pro             TEXT,
  ipi             TEXT,
  publisher       TEXT,
  phone           TEXT,
  mailing_address JSONB DEFAULT '{}',
  display_name    TEXT,
  bio             TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own profile" ON user_profiles
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Auto-update updated_at on every row change (D-07)
CREATE TRIGGER set_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── collaborators: claim + archive + favorites columns ─────────
-- claimed_by: auth.users.id of the Funūn member who claimed this row
-- archived_at: soft-delete timestamp; null = active in roster (D-11)
-- is_favorite: star-pinned in picker Favorites group (D-12)
ALTER TABLE collaborators
  ADD COLUMN IF NOT EXISTS claimed_by  UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;

-- ─── artist_profiles: claimed_at sentinel ──────────────────────
-- Null until the claim check has been completed for this user (D-02).
-- Middleware reads this flag and skips further claim fetches once set.
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- ─── Indexes ───────────────────────────────────────────────────
-- Functional index required for case-insensitive email claim scan
-- (RESEARCH Pitfall 1: without this, the UPDATE is a full-table scan)
CREATE INDEX IF NOT EXISTS idx_collaborators_lower_email
  ON collaborators (LOWER(email));

-- Index for the credits query (all rows claimed by a given user)
CREATE INDEX IF NOT EXISTS idx_collaborators_claimed_by
  ON collaborators (claimed_by);

-- ─── RLS: claimed users can read rows they appear in ───────────
-- Additive SELECT policy alongside the existing "Users manage own
-- collaborators" policy. Row-scoped to claimed_by = auth.uid()
-- (mitigates T-rls-leak — never grants table-wide access).
CREATE POLICY "Claimed users see own credits" ON collaborators
  FOR SELECT
  USING (auth.uid() = claimed_by);

-- ─── claim_collaborators() ──────────────────────────────────────
-- SECURITY DEFINER so it can write claimed_by on rows owned by
-- other artists (intentional cross-user write, T-mass-assign mitigated
-- by excluding claimed_by from COLLABORATOR_EDITABLE_FIELDS).
-- Idempotent: WHERE claimed_by IS NULL ensures re-runs are safe (D-03).
-- Back-fill: reads user_profiles and fills NULL fields on claimed rows
-- using COALESCE(existing_col, new_value) — additive only (D-09, T-backfill).
CREATE OR REPLACE FUNCTION public.claim_collaborators(
  p_user_id UUID,
  p_email   TEXT
)
RETURNS VOID AS $$
DECLARE
  v_pro       TEXT;
  v_ipi       TEXT;
  v_publisher TEXT;
  v_phone     TEXT;
  v_address   JSONB;
BEGIN
  -- Claim all matching collaborator rows (idempotent guard: claimed_by IS NULL)
  UPDATE public.collaborators
    SET claimed_by = p_user_id
  WHERE LOWER(email) = LOWER(p_email)
    AND claimed_by IS NULL;

  -- Back-fill from user_profiles if the user already has one.
  -- COALESCE(existing_column, new_value) — existing data is never overwritten.
  SELECT pro, ipi, publisher, phone, mailing_address
    INTO v_pro, v_ipi, v_publisher, v_phone, v_address
    FROM public.user_profiles
    WHERE id = p_user_id;

  IF FOUND THEN
    UPDATE public.collaborators
      SET pro             = COALESCE(pro, v_pro),
          ipi             = COALESCE(ipi, v_ipi),
          publisher       = COALESCE(publisher, v_publisher),
          phone           = COALESCE(phone, v_phone),
          mailing_address = COALESCE(mailing_address, v_address)
    WHERE claimed_by = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── backfill_claimed_collaborators() ──────────────────────────
-- Called from /api/user-profiles PATCH after every settings save.
-- Updates all collaborator rows claimed by this user with their
-- latest rights identity data — additive only (D-08, D-09).
CREATE OR REPLACE FUNCTION public.backfill_claimed_collaborators(
  p_user_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_pro       TEXT;
  v_ipi       TEXT;
  v_publisher TEXT;
  v_phone     TEXT;
  v_address   JSONB;
BEGIN
  SELECT pro, ipi, publisher, phone, mailing_address
    INTO v_pro, v_ipi, v_publisher, v_phone, v_address
    FROM public.user_profiles
    WHERE id = p_user_id;

  IF FOUND THEN
    UPDATE public.collaborators
      SET pro             = COALESCE(pro, v_pro),
          ipi             = COALESCE(ipi, v_ipi),
          publisher       = COALESCE(publisher, v_publisher),
          phone           = COALESCE(phone, v_phone),
          mailing_address = COALESCE(mailing_address, v_address)
    WHERE claimed_by = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── handle_new_user() — extended to claim on signup ───────────
-- Retains the original two INSERTs (artist_profiles + subscriptions)
-- and appends PERFORM claim_collaborators() so the claim is atomic
-- with signup. No new trigger — on_auth_user_created already exists.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.artist_profiles (id) VALUES (NEW.id);
  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active');
  -- Phase 4: claim any collaborator rows matching this user's email
  PERFORM public.claim_collaborators(NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Note: on_auth_user_created trigger already exists (migration 001).
-- Do NOT add a new CREATE TRIGGER statement.
