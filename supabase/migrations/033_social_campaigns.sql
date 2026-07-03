-- ============================================================
-- Funūn — Wave 3: Launchpad — Social Campaign Planner
-- Migration 033: social_campaigns table (one-active-per-project
-- calendar storage, D-04 invariant, JSONB posts array)
-- Run via: supabase db push
-- ============================================================

-- ─── social_campaigns (per-project content calendar) ───────────────
-- Denormalized user_id/project_id RLS pattern (mirrors pitch_history,
-- migration 030) — not an EXISTS(...) join through vault_projects.
-- posts is a JSONB array of flat slot objects, never trusted raw from
-- the client — see lib/launchpad/campaigns.ts's readPosts()/
-- sanitizeSlotEdit(). Multiple campaigns per project are allowed
-- (D-04); is_active marks which one the Launchpad room, completion
-- tracking, and CSV export operate on. RLS enabled immediately after
-- CREATE TABLE (CVE-2025-48757 convention).
CREATE TABLE social_campaigns (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES vault_projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Campaign',
  platforms   TEXT[] NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  posts       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE social_campaigns ENABLE ROW LEVEL SECURITY;

-- Single policy gates all access — denormalized user_id column is the
-- sole owner check (no cross-user read/write possible even if a route
-- forgets its own .eq('user_id', ...) filter).
CREATE POLICY "Users manage own campaigns" ON social_campaigns
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- D-04's "exactly one active campaign per project" invariant — DB-level
-- backstop written in from day one (RESEARCH.md Pitfall 5), not
-- retrofitted later like migration 032's UNIQUE index on claim_token.
-- The API still does the two-step "flip old active off, set new one
-- on" logic; this index is the defense-in-depth belt-and-suspenders
-- layer against concurrent requests. Do NOT add a UNIQUE constraint on
-- project_id alone — multiple campaigns per project are intentional.
CREATE UNIQUE INDEX idx_social_campaigns_one_active_per_project
  ON social_campaigns (project_id) WHERE is_active;

CREATE INDEX idx_social_campaigns_project ON social_campaigns (project_id);

-- Reuse update_updated_at() trigger function defined in migration 001
CREATE TRIGGER set_social_campaigns_updated_at
  BEFORE UPDATE ON social_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
