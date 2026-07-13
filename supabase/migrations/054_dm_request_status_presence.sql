-- ============================================================
-- Funūn — Wave 4: The Green Room
-- Migration 054: DM message-request state machine + presence
-- Adds dm_threads.status (connection gate), dm_threads.requester_id
-- (rate-limit direction), and artist_profiles.last_seen_at (presence
-- buckets). Follows the migration-040 column-privilege doctrine for
-- last_seen_at. Idempotent throughout.
-- Run via: supabase db push
-- ============================================================

-- ─── dm_threads.status (CONNECT-03) ─────────────────────────────────
-- Records the message-request state machine for new conversation starts.
-- DEFAULT 'direct' grandfathers every existing thread as a direct
-- conversation (the connection gate applies to NEW starts only — D-DISCRETION
-- grandfathering; all pre-Phase-11 threads are treated as mutually consented).
-- Plan 03's send-gate checks status before allowing a first message;
-- Plan 03's accept/decline routes transition pending → direct/declined.
ALTER TABLE dm_threads
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'direct'
    CHECK (status IN ('direct', 'pending', 'declined'));

-- Partial index for the Requests-section (Plan 05) and rate-limit queries
-- (Plan 01's countRecentRequests): only pending rows need to be scanned
-- quickly by requester_id, so a partial index keeps the scan tight.
CREATE INDEX IF NOT EXISTS dm_threads_pending_idx
  ON dm_threads (requester_id, created_at)
  WHERE status = 'pending';

-- ─── dm_threads.requester_id (CONNECT-04) ────────────────────────────
-- Records who initiated the thread so rate-limit COUNT (Plan 01) and the
-- Requests-section "received vs sent" split (Plan 05) work correctly.
-- Nullable: grandfathered direct threads (pre-Phase-11) have no known
-- initiator and NULL is a valid, expected value for them.
ALTER TABLE dm_threads
  ADD COLUMN IF NOT EXISTS requester_id UUID REFERENCES auth.users ON DELETE SET NULL;

-- ─── artist_profiles.last_seen_at (PRESENCE-01/02) ───────────────────
-- Nullable timestamp written by Plan 03's service-role heartbeat route.
-- Drives the "Active now / Active X ago / not recently active" presence
-- buckets rendered across Plans 05 and 06. NULL = never set (new account
-- or pre-Phase-11 member who has not yet triggered a heartbeat).
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Column-privilege doctrine (migration-040 pattern):
-- Migration 040 did REVOKE SELECT ON artist_profiles FROM authenticated, anon
-- and re-granted an explicit column list. A NEW column has NO grant by
-- default and would return error 42501 on any SELECT. We must add it to the
-- grant explicitly and deliberately.
--
-- SELECT: visible to authenticated and anon — presence is intentionally public
-- this phase (D-23: "Active X ago" is part of the member's public presence).
-- The >7-day null bucket in Plan 01 prevents a stale value advertising
-- indefinitely.
GRANT SELECT (last_seen_at) ON artist_profiles TO authenticated, anon;

-- NO UPDATE grant on last_seen_at for authenticated:
-- last_seen_at is written ONLY by the service-role heartbeat route (Plan 03).
-- Granting UPDATE to authenticated would let any member forge their own
-- "Active now" via direct PostgREST (T-11-04). The service-role client
-- bypasses column grants entirely, so no authenticated UPDATE grant is needed
-- (mirrors migration 040's sound_identity rationale).

-- RLS note: dm_threads RLS policies (dmt_insert_participant and its no_block()
-- clause from migration 038) are intentionally left untouched. The connection
-- gate lives in the API layer (Plan 03), not RLS. requester_id and status are
-- set server-side; no new write path is opened by this migration.
