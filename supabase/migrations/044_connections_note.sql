-- ============================================================
-- Funūn — Wave 4: The Green Room
-- Migration 044: connections.note + no_block() wiring + auto-follow-seed trigger
-- Run via: supabase db push
-- ============================================================

-- Three additive changes, all scoped to `connections`:
--
-- 1. `note` column (D-04) — a short optional message a requester can
--    attach to a connect request, capped at 200 chars by a CHECK.
--    Set only at INSERT time (never UPDATE), so no additional column
--    GRANT is needed beyond migration 035's existing INSERT policy —
--    migration 035 already scopes UPDATE column privileges to `status`
--    only, which is unaffected here.
--
-- 2. `no_block()` wiring gap close (D-15 / Pitfall 2) — migration 038
--    wired `no_block()` into follows/wall_posts/endorsements/dm_threads/
--    dm_messages INSERT policies but left `connections` out. This is
--    inert today (the `blocks` table is empty until Phase 13 ships the
--    block feature UI), but closes the gap now so Phase 13 doesn't need
--    its own retrofit migration for `connections` specifically.
--
-- 3. Auto-follow-seed trigger (D-05 / Pitfall 1) — accepting a
--    connection must seed BOTH follow directions atomically. The
--    accepting user's own RLS session physically cannot do this:
--    `follows_insert_own` requires `follower_id = auth.uid()`, so the
--    row asserting "the other party follows me" would be rejected by
--    RLS if attempted from the API layer's session client. A DB
--    trigger, running SECURITY DEFINER, is the correct RLS-safe,
--    defense-in-depth mechanism — it fires regardless of which code
--    path performs the pending->accepted transition.

-- ─── 1. connections.note (D-04) ─────────────────────────────────────
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS note TEXT
    CHECK (note IS NULL OR char_length(note) <= 200);

-- ─── 2. no_block() wiring gap close (D-15 / Pitfall 2, T-10-04) ─────
-- Re-create connections_insert_own with the block check appended,
-- matching migration 038's precedent for the other four social tables.
-- The original ownership condition (requester_id = auth.uid()) is
-- preserved verbatim; this is an additive AND clause, not a rewrite.
DROP POLICY IF EXISTS "connections_insert_own" ON connections;
CREATE POLICY "connections_insert_own" ON connections FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid() AND no_block(auth.uid(), addressee_id));

-- ─── 3. Auto-follow-seed trigger (D-05 / Pitfall 1, T-10-05) ────────
-- SECURITY DEFINER + SET search_path = '' with fully-qualified
-- public.follows mirrors no_block()'s search-path-hijack guard
-- (migration 035). Only ever inserts the two follow rows for the
-- exact requester/addressee pair on a pending->accepted transition,
-- ON CONFLICT DO NOTHING — no attacker-controlled table/row targeting
-- is possible.
--
-- Intentional suppression: this trigger does NOT emit any
-- notification. The `connection_accepted` notification is emitted by
-- the API route (Plan 03), and the two seeded follow rows must NOT
-- fire `new_follower` — connect-accept produces exactly one
-- notification, to the requester (RESEARCH Open Question #1).
CREATE OR REPLACE FUNCTION public.connections_seed_follows()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    INSERT INTO public.follows (follower_id, followee_id)
    VALUES (NEW.requester_id, NEW.addressee_id), (NEW.addressee_id, NEW.requester_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER connections_on_accept
  AFTER UPDATE ON connections
  FOR EACH ROW EXECUTE FUNCTION public.connections_seed_follows();
