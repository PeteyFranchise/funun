-- ============================================================
-- 012 — Profile social layer
-- Tables for the networking features on the public profile: follows,
-- wall posts, endorsements, release comments (threaded), activity feed,
-- and 1:1 direct messages. This is the schema FOUNDATION — endpoints,
-- UI and realtime are wired incrementally on top.
-- Idempotent. Run via: supabase db push (or the management query API).
-- ============================================================

-- ─── Follows ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX IF NOT EXISTS follows_followee_idx ON follows (followee_id);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "follows_select_all" ON follows;
DROP POLICY IF EXISTS "follows_insert_own" ON follows;
DROP POLICY IF EXISTS "follows_delete_own" ON follows;
CREATE POLICY "follows_select_all" ON follows FOR SELECT USING (true);
CREATE POLICY "follows_insert_own" ON follows FOR INSERT TO authenticated WITH CHECK (follower_id = auth.uid());
CREATE POLICY "follows_delete_own" ON follows FOR DELETE TO authenticated USING (follower_id = auth.uid());

-- ─── Wall posts (public guestbook on a profile) ──────────────────────
CREATE TABLE IF NOT EXISTS wall_posts (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE, -- whose wall
  author_id  UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wall_posts_profile_idx ON wall_posts (profile_id, created_at DESC);

ALTER TABLE wall_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wall_select_all" ON wall_posts;
DROP POLICY IF EXISTS "wall_insert_author" ON wall_posts;
DROP POLICY IF EXISTS "wall_delete_own_or_owner" ON wall_posts;
CREATE POLICY "wall_select_all" ON wall_posts FOR SELECT USING (true);
CREATE POLICY "wall_insert_author" ON wall_posts FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "wall_delete_own_or_owner" ON wall_posts FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR profile_id = auth.uid());

-- ─── Endorsements (recommendations on a profile) ─────────────────────
CREATE TABLE IF NOT EXISTS endorsements (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE, -- who's endorsed
  author_id  UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, author_id)
);
CREATE INDEX IF NOT EXISTS endorsements_profile_idx ON endorsements (profile_id, created_at DESC);

ALTER TABLE endorsements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "endo_select_all" ON endorsements;
DROP POLICY IF EXISTS "endo_insert_author" ON endorsements;
DROP POLICY IF EXISTS "endo_delete_own" ON endorsements;
CREATE POLICY "endo_select_all" ON endorsements FOR SELECT USING (true);
CREATE POLICY "endo_insert_author" ON endorsements FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "endo_delete_own" ON endorsements FOR DELETE TO authenticated USING (author_id = auth.uid());

-- ─── Release comments (threaded) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS release_comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES vault_projects ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  parent_id  UUID REFERENCES release_comments ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS release_comments_project_idx ON release_comments (project_id, created_at);

ALTER TABLE release_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rc_select_public" ON release_comments;
DROP POLICY IF EXISTS "rc_insert_author" ON release_comments;
DROP POLICY IF EXISTS "rc_delete_own" ON release_comments;
-- Visible when the parent release is public (or you own it).
CREATE POLICY "rc_select_public" ON release_comments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM vault_projects p
    WHERE p.id = project_id AND (p.is_public OR p.user_id = auth.uid())
  ));
CREATE POLICY "rc_insert_author" ON release_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "rc_delete_own" ON release_comments FOR DELETE TO authenticated USING (author_id = auth.uid());

-- ─── Activity feed ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_events (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  kind       TEXT NOT NULL, -- 'placement' | 'release' | 'readiness' | ...
  body       TEXT NOT NULL,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_profile_idx ON activity_events (profile_id, created_at DESC);

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "act_select_all" ON activity_events;
DROP POLICY IF EXISTS "act_insert_own" ON activity_events;
CREATE POLICY "act_select_all" ON activity_events FOR SELECT USING (true);
CREATE POLICY "act_insert_own" ON activity_events FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());

-- ─── Direct messages (1:1) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dm_threads (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  a_id       UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  b_id       UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- canonical ordering so a pair maps to one thread
  CHECK (a_id < b_id),
  UNIQUE (a_id, b_id)
);

CREATE TABLE IF NOT EXISTS dm_messages (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id  UUID NOT NULL REFERENCES dm_threads ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dm_messages_thread_idx ON dm_messages (thread_id, created_at);

ALTER TABLE dm_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dmt_select_participant" ON dm_threads;
DROP POLICY IF EXISTS "dmt_insert_participant" ON dm_threads;
DROP POLICY IF EXISTS "dmm_select_participant" ON dm_messages;
DROP POLICY IF EXISTS "dmm_insert_sender" ON dm_messages;
CREATE POLICY "dmt_select_participant" ON dm_threads FOR SELECT TO authenticated
  USING (a_id = auth.uid() OR b_id = auth.uid());
CREATE POLICY "dmt_insert_participant" ON dm_threads FOR INSERT TO authenticated
  WITH CHECK (a_id = auth.uid() OR b_id = auth.uid());
CREATE POLICY "dmm_select_participant" ON dm_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM dm_threads t
    WHERE t.id = thread_id AND (t.a_id = auth.uid() OR t.b_id = auth.uid())
  ));
CREATE POLICY "dmm_insert_sender" ON dm_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND EXISTS (
    SELECT 1 FROM dm_threads t
    WHERE t.id = thread_id AND (t.a_id = auth.uid() OR t.b_id = auth.uid())
  ));
