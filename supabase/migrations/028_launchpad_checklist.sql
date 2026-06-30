-- ============================================================
-- Funūn — Wave 3: Launchpad Checklist
-- Migration 028: Launchpad checklist items and progress
-- Run via: supabase db push
-- ============================================================

-- ─── launchpad_checklist_items (admin-managed item definitions) ─────
-- Stores checklist item definitions and tip content. Admin-managed
-- via the /admin/checklist and /admin/tips routes. Artists read items
-- via the API layer (tip_draft never exposed to artists).
CREATE TABLE launchpad_checklist_items (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key            TEXT NOT NULL UNIQUE,
  label          TEXT NOT NULL,
  section        TEXT NOT NULL,              -- 'before_release' | 'week_1' | 'week_2' | 'weeks_3_4'
  suggested_week INT,                        -- 0=before release, 1, 2, 3 (covers weeks 3–4)
  sort_order     INT NOT NULL DEFAULT 0,
  action_type    TEXT NOT NULL,              -- 'internal_tool' | 'external_url'
  action_href    TEXT,
  action_label   TEXT,
  tip_body       TEXT,                       -- approved tip text; null = no tip yet
  tip_approved   BOOLEAN NOT NULL DEFAULT false,
  tip_draft      TEXT,                       -- pending AI draft awaiting admin approval
  tip_drafted_at TIMESTAMPTZ,
  author         TEXT,                       -- 'ai' | 'admin' | future: industry expert email
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE launchpad_checklist_items ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read checklist items; approved-tip
-- filtering is enforced at the API layer, not RLS. Admin writes go
-- through service-role client which bypasses RLS.
CREATE POLICY "Anyone can read checklist items" ON launchpad_checklist_items
  FOR SELECT USING (true);

-- Reuse update_updated_at() trigger function defined in migration 001
CREATE TRIGGER set_launchpad_checklist_items_updated_at
  BEFORE UPDATE ON launchpad_checklist_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_launchpad_checklist_items_section
  ON launchpad_checklist_items (section, sort_order);

-- ─── launchpad_progress (per-user per-project completion state) ────
-- Tracks which checklist items each artist has completed for each
-- project. RLS restricts reads and writes to the owning user.
-- FK on item_key resolves the RESEARCH Risk 2 / Open Question 1 —
-- DB enforces cascade automatically when an item is deleted.
CREATE TABLE launchpad_progress (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES vault_projects(id) ON DELETE CASCADE,
  item_key     TEXT NOT NULL REFERENCES launchpad_checklist_items(key) ON DELETE CASCADE,
  completed    BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_id, item_key)
);

ALTER TABLE launchpad_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own progress" ON launchpad_progress
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_launchpad_progress_user_project
  ON launchpad_progress (user_id, project_id);

-- ─── Seed data — 20 checklist items across 4 sections ─────────────
-- Tips are not seeded (tip_approved defaults to false, tip_body NULL).
-- Admin drafts and approves tips via /admin/tips after seed.
-- ON CONFLICT (key) DO NOTHING makes re-runs idempotent.
INSERT INTO launchpad_checklist_items
  (key, label, section, suggested_week, sort_order, action_type, action_href, action_label)
VALUES
  -- Before release (suggested_week = 0)
  ('presave_link',            'Set up a pre-save link',                'before_release', 0, 0, 'external_url',  'https://distrokid.com/hyperfollow',  'Create pre-save on DistroKid'),
  ('spotify_editorial_pitch', 'Pitch Spotify editorial',               'before_release', 0, 1, 'internal_tool', '/vault',                             'Open Sound Vault'),
  ('canvas_clips',            'Create Spotify Canvas / Clips',         'before_release', 0, 2, 'external_url',  'https://artists.spotify.com/home',   'Open Spotify for Artists'),
  ('social_teasers',          'Post social teasers',                   'before_release', 0, 3, 'internal_tool', '/vault',                             'Open Sound Vault'),
  ('epk_ready',               'Press kit (EPK) ready',                 'before_release', 0, 4, 'internal_tool', '/vault',                             'Open Sound Vault'),

  -- Week 1 — Release week (suggested_week = 1)
  ('announce_platforms',      'Announce across platforms',             'week_1',         1, 0, 'internal_tool', '/vault',                             'Open Sound Vault'),
  ('email_list_push',         'Push to email list',                    'week_1',         1, 1, 'external_url',  'https://mailchimp.com',              'Open Mailchimp'),
  ('save_to_stream_prompt',   'Ask fans to save (not just stream)',    'week_1',         1, 2, 'external_url',  NULL,                                 NULL),
  ('curator_pitches_week1',   'Send first curator pitches',            'week_1',         1, 3, 'internal_tool', '/tools/pitchplug',                   'Open PitchPlug'),
  ('engagement_sprint',       'Engagement sprint: comments & shares',  'week_1',         1, 4, 'external_url',  NULL,                                 NULL),

  -- Week 2 (suggested_week = 2)
  ('bts_content',             'Post behind-the-scenes content',        'week_2',         2, 0, 'external_url',  NULL,                                 NULL),
  ('listener_reactions',      'Share listener reactions',              'week_2',         2, 1, 'external_url',  NULL,                                 NULL),
  ('playlist_followup',       'Follow up on playlist pitches',         'week_2',         2, 2, 'internal_tool', '/tools/pitchplug',                   'Open PitchPlug'),
  ('benchmark_check',         'Check benchmark readiness',             'week_2',         2, 3, 'internal_tool', '/benchmarks',                        'Open Benchmarks'),

  -- Weeks 3–4 (suggested_week = 3)
  ('lyric_pull_posts',        'Post lyric pull content',               'weeks_3_4',      3, 0, 'external_url',  NULL,                                 NULL),
  ('ugc_push',                'Push UGC (user-generated content)',     'weeks_3_4',      3, 1, 'external_url',  NULL,                                 NULL),
  ('discovery_mode',          'Set up Spotify Discovery Mode',         'weeks_3_4',      3, 2, 'external_url',  'https://artists.spotify.com/home',   'Open Spotify for Artists'),
  ('spotify_ads',             'Run Spotify / Meta ads',                'weeks_3_4',      3, 3, 'external_url',  'https://adstudio.spotify.com',       'Open Spotify Ad Studio'),
  ('rights_cleanup',          'Complete rights registrations',         'weeks_3_4',      3, 4, 'internal_tool', '/coach',                             'Open Rights Coach'),
  ('catalog_bridge',          'Mention earlier releases',              'weeks_3_4',      3, 5, 'external_url',  NULL,                                 NULL)
ON CONFLICT (key) DO NOTHING;
