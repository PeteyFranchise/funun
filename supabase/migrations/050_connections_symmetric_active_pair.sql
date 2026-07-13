-- ============================================================
-- Funūn — Wave 4: The Green Room
-- Migration 050: symmetric active connection uniqueness
-- Run via: supabase db push
-- ============================================================

-- Migration 035 made active connections unique by exact requester/addressee
-- direction. That still allows a simultaneous opposite-direction race:
-- A -> B pending and B -> A pending. The product model is one active
-- relationship/request per unordered member pair, so enforce that invariant
-- at the database layer before Phase 10 ships broadly.

WITH ranked_active AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id)
      ORDER BY
        CASE WHEN status = 'accepted' THEN 0 ELSE 1 END,
        created_at ASC,
        id ASC
    ) AS keep_rank
  FROM connections
  WHERE status IN ('pending', 'accepted')
)
UPDATE connections
SET status = 'withdrawn'
WHERE id IN (
  SELECT id
  FROM ranked_active
  WHERE keep_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS connections_active_unordered_pair_uniq
  ON connections (
    LEAST(requester_id, addressee_id),
    GREATEST(requester_id, addressee_id)
  )
  WHERE status IN ('pending', 'accepted');
