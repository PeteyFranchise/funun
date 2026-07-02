-- ============================================================
-- Funūn — Wave 3: Playlist Curator Pitching
-- Migration 032: UNIQUE constraint on curators.claim_token (WR-06,
-- 06-REVIEW.md)
-- Run via: supabase db push
-- ============================================================

-- pitch_history.response_token is declared TEXT NOT NULL UNIQUE
-- (migration 030), but the sibling bearer token curators.claim_token was
-- only backed by a non-unique partial index. Both are used identically as
-- bearer-style authenticators looked up via `.eq(...).maybeSingle()`.
-- Relying purely on 256-bit randomness to avoid collisions is fine in
-- practice, but the DB-level UNIQUE constraint is a near-free
-- defense-in-depth backstop the sibling table already has — this migration
-- brings claim_token in line with it. Additive-only (032, not an edit of
-- 030 — 030 is already applied to the live database).
DROP INDEX idx_curators_claim_token;
CREATE UNIQUE INDEX idx_curators_claim_token ON curators (claim_token) WHERE claim_token IS NOT NULL;
