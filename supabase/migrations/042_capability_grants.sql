-- ============================================================
-- Funūn — Wave 4: Account Capability Model
-- Migration 042: capability_grants table (request/approve state machine)
-- Run via: supabase db push
-- ============================================================

-- Replaces the single exclusive artist_profiles.member_type value (migration
-- 034) with a set of granted capabilities on one account, modeled as rows so
-- both an instant-grant path (industry -> artist, D-02) and a
-- review-then-grant path (artist -> industry, D-02) can share one table.
-- Mirrors the connections request/accept state machine (migration 035):
-- a partial unique index -- not a plain UNIQUE -- allows a fresh request
-- after a terminal 'denied' decision, while blocking a second concurrent
-- pending/approved request for the same (profile_id, capability) pair.
--
-- D-12: every existing artist_profiles row's single member_type value is
-- backfilled below as its own 'approved' grant, so no existing account
-- loses access or needs to re-request a capability it already has.

CREATE TABLE capability_grants (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id   UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  capability   TEXT NOT NULL CHECK (capability IN ('artist', 'industry')),
  status       TEXT NOT NULL DEFAULT 'approved'
               CHECK (status IN ('pending', 'approved', 'denied')),
  role_slugs   TEXT[] NOT NULL DEFAULT '{}',
  source       TEXT NOT NULL
               CHECK (source IN ('signup', 'self_serve_instant', 'admin_approved', 'backfill')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at   TIMESTAMPTZ,
  decided_by   UUID REFERENCES auth.users(id)
);

-- Partial unique index (mirrors connections_active_pair_uniq, migration
-- 035): allows a fresh request after a terminal 'denied' decision, since a
-- 'denied' row falls outside the WHERE clause and no longer blocks a new
-- INSERT for the same (profile_id, capability) pair.
CREATE UNIQUE INDEX capability_grants_active_uniq
  ON capability_grants (profile_id, capability)
  WHERE status IN ('pending', 'approved');

-- Admin approval-queue lookup (Plan 04).
CREATE INDEX idx_capability_grants_pending
  ON capability_grants (status, requested_at)
  WHERE status = 'pending';

ALTER TABLE capability_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "capability_grants_select_own" ON capability_grants;

-- A member can see only their own grant/request rows.
CREATE POLICY "capability_grants_select_own" ON capability_grants
  FOR SELECT USING (profile_id = auth.uid());

-- Column-lockdown doctrine (standing project practice since migration 031,
-- reapplied in 040): all writes route through service_role API routes
-- (Plan 02's request/approve routes), never direct authenticated/anon
-- PostgREST access. This also closes T-15-01 (Elevation of Privilege) --
-- an authenticated caller cannot INSERT a self-approved row, and
-- hasCapability() additionally filters on status='approved' so even a
-- 'pending' row inserted through some other path grants nothing.
REVOKE INSERT, UPDATE, DELETE ON capability_grants FROM authenticated, anon;
REVOKE SELECT ON capability_grants FROM anon;

-- ─── D-12 backfill: preserve every existing member_type as one grant ────
-- Defensive existence guard (Pitfall 3): migrations 034-040 may not yet be
-- applied to every environment this migration runs against. If
-- artist_profiles.member_type does not exist yet, this block is a safe
-- no-op rather than a hard failure.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artist_profiles' AND column_name = 'member_type'
  ) THEN
    INSERT INTO capability_grants (profile_id, capability, status, source, decided_at)
    SELECT id, member_type, 'approved', 'backfill', now()
    FROM artist_profiles
    WHERE member_type IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
