-- ─────────────────────────────────────────────────────────────────────────
-- Migration 009 — The Antenna matching engine + Notifications
--
-- Extends the existing opportunities / opportunity_matches tables (migration
-- 001) with the targeting + scoring fields the Antenna needs, and adds a
-- generic notifications table (in-app bell + email triggers).
--
-- Numbered 009 to fit the live sequence (001–008). The original feature spec
-- referenced "003_antenna_additions.sql"; that number is already taken, so we
-- additive-ALTER the real tables instead of recreating them.
-- ─────────────────────────────────────────────────────────────────────────

-- ─── Opportunities: targeting + logistics ────────────────────────────────
-- `exclusive` already exists (tier-gate: studio/founding only). We keep it and
-- add `pete_exclusive` as the separate "Pete's Network" curation flag (gold
-- badge + email on strong matches). They are independent.
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS industry_profile_id  UUID REFERENCES industry_profiles ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS min_readiness_score  INTEGER DEFAULT 60,
  ADD COLUMN IF NOT EXISTS min_monthly_listeners INTEGER,
  ADD COLUMN IF NOT EXISTS max_monthly_listeners INTEGER,
  ADD COLUMN IF NOT EXISTS career_stages        INTEGER[] DEFAULT '{1,2,3,4}',
  ADD COLUMN IF NOT EXISTS location_preference  TEXT,
  ADD COLUMN IF NOT EXISTS response_deadline    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS slots_available      INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS slots_filled         INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform             TEXT,
  ADD COLUMN IF NOT EXISTS compensation_type    TEXT
    CHECK (compensation_type IN ('paid','rev_share','credit_only','tbd')),
  ADD COLUMN IF NOT EXISTS pete_exclusive       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pete_note            TEXT;

CREATE INDEX IF NOT EXISTS idx_opportunities_active   ON opportunities (active);
CREATE INDEX IF NOT EXISTS idx_opportunities_industry ON opportunities (industry_profile_id);

-- ─── Opportunity matches: persisted score breakdown + lifecycle ──────────
ALTER TABLE opportunity_matches
  ADD COLUMN IF NOT EXISTS breakdown JSONB,
  ADD COLUMN IF NOT EXISTS status    TEXT DEFAULT 'matched'
    CHECK (status IN ('matched','notified','applied','accepted','declined'));

-- Artists need to flip applied=true on their own matches from the apply flow.
DROP POLICY IF EXISTS "Artists update own matches" ON opportunity_matches;
CREATE POLICY "Artists update own matches" ON opportunity_matches
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Industry owners need to read the matches/applications for opportunities they
-- created (the application inbox).
DROP POLICY IF EXISTS "Owners see matches for their opps" ON opportunity_matches;
CREATE POLICY "Owners see matches for their opps" ON opportunity_matches
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM opportunities o
      WHERE o.id = opportunity_matches.opportunity_id
        AND o.created_by = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_matches_user        ON opportunity_matches (user_id);
CREATE INDEX IF NOT EXISTS idx_matches_opportunity ON opportunity_matches (opportunity_id);

-- ─── Notifications ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  type        TEXT NOT NULL,            -- 'antenna_match' | 'application_received' | ...
  title       TEXT NOT NULL,
  body        TEXT,
  link        TEXT,                     -- in-app deep link
  data        JSONB DEFAULT '{}'::jsonb,
  emailed     BOOLEAN DEFAULT false,    -- whether an email copy was also sent
  read        BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own notifications" ON notifications;
CREATE POLICY "Users see own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Inserts happen server-side via the service-role client (matching engine,
-- apply flow), which bypasses RLS, so no INSERT policy is granted to users.

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, read, created_at DESC);
