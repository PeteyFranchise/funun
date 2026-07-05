-- ============================================================
-- Funūn — Wave 4: The Green Room
-- Migration 035: connections + blocks tables + no_block() helper
-- Run via: supabase db push
-- ============================================================

-- These are the tables Phases 10 (Connect), 11 (Messaging), and 13
-- (Trust & Safety) build on. Creating `blocks` + `no_block()` now — even
-- though the block *feature* ships in Phase 13 — means later phases
-- inherit RLS block-enforcement for free (D-15). This migration creates
-- the tables and the helper only; wiring `no_block()` into existing
-- tables' policies is a later plan.

-- ─── connections (mutual request/accept state machine) ──────────────
CREATE TABLE connections (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id   UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  addressee_id   UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requester_id <> addressee_id)
);

-- Partial unique index (not a plain UNIQUE) so a re-request after a
-- terminal decline/withdrawal can INSERT a fresh row once the prior
-- request is no longer 'pending'/'accepted' (RESEARCH connections edge
-- case, recommended option (b)).
CREATE UNIQUE INDEX connections_active_pair_uniq
  ON connections (requester_id, addressee_id)
  WHERE status IN ('pending', 'accepted');

-- "Requests to me" lookup.
CREATE INDEX idx_connections_addressee_status ON connections (addressee_id, status);

ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "connections_select_participant" ON connections;
DROP POLICY IF EXISTS "connections_insert_own" ON connections;
DROP POLICY IF EXISTS "connections_update_participant" ON connections;
DROP POLICY IF EXISTS "connections_update_addressee" ON connections;
DROP POLICY IF EXISTS "connections_update_requester_withdraw" ON connections;

-- Visible to either participant.
CREATE POLICY "connections_select_participant" ON connections FOR SELECT
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- A caller can only insert a request as themselves.
CREATE POLICY "connections_insert_own" ON connections FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- State transitions use two targeted policies so a requester cannot
-- self-accept their own request and neither participant can rewrite
-- requester_id/addressee_id via direct PostgREST (CR-04 security fix).
--
-- Addressee: can accept or decline a pending request addressed to them.
CREATE POLICY "connections_update_addressee" ON connections FOR UPDATE TO authenticated
  USING (addressee_id = auth.uid() AND status = 'pending')
  WITH CHECK (addressee_id = auth.uid() AND status IN ('accepted', 'declined'));

-- Requester: can withdraw their own pending outbound request.
CREATE POLICY "connections_update_requester_withdraw" ON connections FOR UPDATE TO authenticated
  USING (requester_id = auth.uid() AND status = 'pending')
  WITH CHECK (requester_id = auth.uid() AND status = 'withdrawn');

-- Column-level UPDATE grant: restrict writes to status only so neither
-- party can rewrite requester_id/addressee_id even with an open USING
-- clause. Phase 10 API layer routes drive state via the service client
-- and are unaffected (service_role bypasses column grants).
REVOKE UPDATE ON connections FROM authenticated;
GRANT UPDATE (status) ON connections TO authenticated;

-- Reuse update_updated_at() trigger function defined in migration 001.
CREATE TRIGGER connections_updated_at
  BEFORE UPDATE ON connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── blocks (directional storage, bidirectional check via no_block()) ─
-- Store ONE directional row per block — never write two symmetric rows.
-- Who blocked whom is meaningful, non-public data (only the blocker may
-- ever see their own blocklist).
CREATE TABLE blocks (
  blocker_id  UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

-- Reverse-direction lookups (used by no_block()).
CREATE INDEX idx_blocks_blocked ON blocks (blocked_id);

ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocks_select_own" ON blocks;
DROP POLICY IF EXISTS "blocks_insert_own" ON blocks;
DROP POLICY IF EXISTS "blocks_delete_own" ON blocks;

-- A member sees ONLY their own blocklist, never who blocked them
-- (T-08-03: enumeration of "who blocked me" is an information-disclosure
-- risk mitigated by restricting SELECT to blocker_id = auth.uid()).
CREATE POLICY "blocks_select_own" ON blocks FOR SELECT
  USING (blocker_id = auth.uid());

CREATE POLICY "blocks_insert_own" ON blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid());

CREATE POLICY "blocks_delete_own" ON blocks FOR DELETE TO authenticated
  USING (blocker_id = auth.uid());

-- ─── no_block() — SECURITY DEFINER bidirectional block check ────────
-- SECURITY DEFINER is required here specifically because the calling
-- role (authenticated, restricted by blocks_select_own to
-- blocker_id = auth.uid()) could not otherwise read the OTHER party's
-- block row to check "did they block me" — the function runs as its
-- owner (bypassing RLS on blocks) so it can see both directions
-- regardless of the caller's own RLS-restricted view.
--
-- SET search_path = '' (with fully-qualified public.blocks) prevents a
-- search-path-hijacking attack (T-08-04) where a malicious `blocks`
-- table earlier in a caller-controlled search path could be picked up
-- instead of public.blocks.
--
-- STABLE (not VOLATILE) allows the planner to cache the result within a
-- single statement when wrapped in (SELECT no_block(...)) inside an RLS
-- policy, avoiding a per-row re-evaluation.
CREATE OR REPLACE FUNCTION public.no_block(a UUID, b UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = a AND blocked_id = b)
       OR (blocker_id = b AND blocked_id = a)
  )
$$;

-- Intended for use inside RLS policy WITH CHECK/USING clauses, not as a
-- client RPC (RESEARCH Assumption A2). Revoke the blanket PostgREST RPC
-- exposure every function in the public schema gets by default, then
-- grant back only to authenticated so RLS policy bodies and any
-- authenticated request path can invoke it without gratuitous anon
-- exposure.
REVOKE EXECUTE ON FUNCTION public.no_block(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.no_block(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.no_block(uuid, uuid) IS
  'Returns false when EITHER direction of a block exists between a and b. Intended for use inside RLS policy WITH CHECK/USING clauses (wrapped as (SELECT no_block(...))), not as a client-invoked RPC.';
