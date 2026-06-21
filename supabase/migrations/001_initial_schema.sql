-- ============================================================
-- Funūn — Sound Vault Schema
-- Sound Vault is the central entity — an artist's full discography
-- Run via: supabase db push
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Artist Profiles ─────────────────────────────────────────────────
CREATE TABLE artist_profiles (
  id                UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  artist_name       TEXT,
  genre             TEXT,
  location          TEXT,
  bio               TEXT,
  career_stage      INTEGER DEFAULT 1 CHECK (career_stage BETWEEN 1 AND 4),
  instagram_handle  TEXT,
  threads_handle    TEXT,
  tiktok_handle     TEXT,
  spotify_url       TEXT,
  monthly_listeners INTEGER,
  total_streams     BIGINT,
  sound_identity    JSONB,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE artist_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Artists manage own profile" ON artist_profiles
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Public profiles visible" ON artist_profiles FOR SELECT USING (true);

-- ─── Industry Profiles ───────────────────────────────────────────────
CREATE TABLE industry_profiles (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID REFERENCES auth.users ON DELETE CASCADE UNIQUE NOT NULL,
  display_name        TEXT NOT NULL,
  company             TEXT,
  role                TEXT NOT NULL CHECK (role IN (
    'a_and_r','sync_supervisor','playlist_curator','venue_booker',
    'music_publisher','festival_director','music_supervisor','brand_music_director'
  )),
  verified            BOOLEAN DEFAULT false,
  verified_by         UUID REFERENCES auth.users,
  bio                 TEXT,
  genres_seeking      TEXT[] DEFAULT '{}',
  currently_accepting BOOLEAN DEFAULT true,
  response_rate       INTEGER,
  website             TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE industry_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Industry pros manage own profile" ON industry_profiles
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Verified industry profiles discoverable" ON industry_profiles
  FOR SELECT USING (verified = true);

-- ─── Subscriptions ───────────────────────────────────────────────────
CREATE TABLE subscriptions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID REFERENCES auth.users ON DELETE CASCADE UNIQUE NOT NULL,
  tier                    TEXT NOT NULL DEFAULT 'free'
                          CHECK (tier IN ('free','pro','studio','founding')),
  status                  TEXT NOT NULL DEFAULT 'active',
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  current_period_end      TIMESTAMPTZ,
  pitch_credits_remaining INTEGER DEFAULT 2,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own subscription" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- ─── Sound Vault Projects (THE CENTRAL ENTITY) ───────────────────────
-- An artist's full discography — singles, snippets, EPs, albums, unreleased
CREATE TABLE vault_projects (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title                 TEXT NOT NULL,
  type                  TEXT NOT NULL CHECK (type IN (
    'single', 'snippet', 'ep', 'album', 'unreleased'
  )),
  status                TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN (
    'in_progress', 'vault_ready', 'submitted', 'released', 'archived', 'shelved'
  )),
  release_date          DATE,
  vault_readiness_score INTEGER DEFAULT 0 CHECK (vault_readiness_score BETWEEN 0 AND 100),
  genre                 TEXT,
  sub_genre             TEXT,
  cover_art_url         TEXT,
  upc                   TEXT,
  is_public             BOOLEAN DEFAULT false,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vault_projects_user_id ON vault_projects (user_id);
CREATE INDEX idx_vault_projects_type    ON vault_projects (type);
CREATE INDEX idx_vault_projects_status  ON vault_projects (status);
CREATE INDEX idx_vault_projects_genre   ON vault_projects (genre);

ALTER TABLE vault_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Artists manage own vault projects" ON vault_projects
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public vault projects discoverable" ON vault_projects
  FOR SELECT USING (is_public = true);

-- ─── Tracks ──────────────────────────────────────────────────────────
CREATE TABLE tracks (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id         UUID REFERENCES vault_projects ON DELETE CASCADE NOT NULL,
  user_id            UUID REFERENCES auth.users NOT NULL,
  title              TEXT NOT NULL,
  track_number       INTEGER,
  duration_seconds   INTEGER,
  isrc               TEXT,
  audio_file_url     TEXT,
  audio_file_size    BIGINT,
  bpm                INTEGER,
  key_signature      TEXT,
  explicit           BOOLEAN DEFAULT false,
  lyrics             TEXT,
  featuring_artists  TEXT[] DEFAULT '{}',
  writers            TEXT[] DEFAULT '{}',
  producers          TEXT[] DEFAULT '{}',
  mixing_engineer    TEXT,
  mastering_engineer TEXT,
  metadata           JSONB DEFAULT '{}',
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tracks_project_id ON tracks (project_id);

ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Artists manage own tracks" ON tracks
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── Vault Assets ─────────────────────────────────────────────────────
CREATE TABLE vault_assets (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id   UUID REFERENCES vault_projects ON DELETE CASCADE NOT NULL,
  user_id      UUID REFERENCES auth.users NOT NULL,
  type         TEXT NOT NULL CHECK (type IN (
    'cover_art', 'press_photo', 'lyric_card', 'snippet_visual', 'promo_video', 'banner'
  )),
  url          TEXT NOT NULL,
  filename     TEXT,
  size_bytes   BIGINT,
  width        INTEGER,
  height       INTEGER,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vault_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Artists manage own assets" ON vault_assets
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── Vault Documents (legal gate) ────────────────────────────────────
CREATE TABLE vault_documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID REFERENCES vault_projects ON DELETE CASCADE,
  track_id      UUID REFERENCES tracks ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users NOT NULL,
  type          TEXT NOT NULL CHECK (type IN (
    'split_sheet', 'copyright_registration', 'hire_right',
    'sample_clearance', 'distribution_agreement'
  )),
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','signed','verified')),
  document_data JSONB NOT NULL DEFAULT '{}',
  signed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vault_docs_project_id ON vault_documents (project_id);

ALTER TABLE vault_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Artists manage own documents" ON vault_documents
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── Tool Outputs (attached to vault projects) ────────────────────────
CREATE TABLE tool_outputs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  project_id   UUID REFERENCES vault_projects ON DELETE SET NULL,
  tool_slug    TEXT NOT NULL,
  title        TEXT,
  inputs       JSONB NOT NULL DEFAULT '{}',
  output       JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tool_outputs_user_id    ON tool_outputs (user_id);
CREATE INDEX idx_tool_outputs_project_id ON tool_outputs (project_id);
CREATE INDEX idx_tool_outputs_tool_slug  ON tool_outputs (tool_slug);

ALTER TABLE tool_outputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Artists manage own outputs" ON tool_outputs
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── Submissions ──────────────────────────────────────────────────────
CREATE TABLE submissions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id          UUID REFERENCES vault_projects ON DELETE CASCADE NOT NULL,
  user_id             UUID REFERENCES auth.users NOT NULL,
  destination_type    TEXT NOT NULL,
  destination_name    TEXT NOT NULL,
  destination_contact TEXT,
  pitch_text          TEXT,
  status              TEXT DEFAULT 'draft' CHECK (status IN (
    'draft','sent','viewed','responded','accepted','declined','no_response'
  )),
  submitted_at        TIMESTAMPTZ,
  responded_at        TIMESTAMPTZ,
  response_message    TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_submissions_project_id ON submissions (project_id);
CREATE INDEX idx_submissions_user_id    ON submissions (user_id);

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Artists manage own submissions" ON submissions
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── Pitches (artist → industry pro) ─────────────────────────────────
CREATE TABLE pitches (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       UUID REFERENCES vault_projects ON DELETE CASCADE NOT NULL,
  artist_id        UUID REFERENCES auth.users NOT NULL,
  recipient_id     UUID REFERENCES auth.users NOT NULL,
  message          TEXT,
  status           TEXT DEFAULT 'sent' CHECK (status IN (
    'sent','viewed','interested','passed','responded'
  )),
  sent_at          TIMESTAMPTZ DEFAULT NOW(),
  viewed_at        TIMESTAMPTZ,
  responded_at     TIMESTAMPTZ,
  response_message TEXT
);

CREATE INDEX idx_pitches_artist_id    ON pitches (artist_id);
CREATE INDEX idx_pitches_recipient_id ON pitches (recipient_id);
CREATE INDEX idx_pitches_project_id   ON pitches (project_id);

ALTER TABLE pitches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Artists see own sent pitches"     ON pitches FOR SELECT USING (auth.uid() = artist_id);
CREATE POLICY "Artists send pitches"             ON pitches FOR INSERT WITH CHECK (auth.uid() = artist_id);
CREATE POLICY "Recipients see incoming pitches"  ON pitches FOR SELECT USING (auth.uid() = recipient_id);
CREATE POLICY "Recipients update pitch status"   ON pitches FOR UPDATE USING (auth.uid() = recipient_id);

-- ─── Opportunities (The Antenna) ──────────────────────────────────────
CREATE TABLE opportunities (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by              UUID REFERENCES auth.users,
  title                   TEXT NOT NULL,
  description             TEXT,
  type                    TEXT CHECK (type IN (
    'sync','playlist','label','venue','festival','press','brand'
  )),
  genres                  TEXT[] DEFAULT '{}',
  mood_tags               TEXT[] DEFAULT '{}',
  bpm_min                 INTEGER,
  bpm_max                 INTEGER,
  deadline                TIMESTAMPTZ,
  active                  BOOLEAN DEFAULT true,
  exclusive               BOOLEAN DEFAULT false,
  compensation            TEXT,
  submission_requirements TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active opportunities visible" ON opportunities
  FOR SELECT USING (active = true);
CREATE POLICY "Industry pros manage own opps" ON opportunities
  USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

-- ─── Opportunity Matches ───────────────────────────────────────────────
CREATE TABLE opportunity_matches (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  opportunity_id   UUID REFERENCES opportunities ON DELETE CASCADE NOT NULL,
  project_id       UUID REFERENCES vault_projects ON DELETE CASCADE NOT NULL,
  user_id          UUID REFERENCES auth.users NOT NULL,
  match_score      INTEGER CHECK (match_score BETWEEN 0 AND 100),
  notified_at      TIMESTAMPTZ DEFAULT NOW(),
  applied          BOOLEAN DEFAULT false,
  applied_at       TIMESTAMPTZ,
  UNIQUE (opportunity_id, project_id)
);

ALTER TABLE opportunity_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Artists see own matches" ON opportunity_matches
  FOR SELECT USING (auth.uid() = user_id);

-- ─── Community ─────────────────────────────────────────────────────────
CREATE TABLE community_posts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  project_id    UUID REFERENCES vault_projects ON DELETE SET NULL,
  type          TEXT CHECK (type IN (
    'vault_share','feedback_request','success_story','question','collab_search'
  )),
  content       TEXT NOT NULL,
  likes         INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pro+ users can post" ON community_posts FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = auth.uid()
    AND tier IN ('pro','studio','founding')
    AND status = 'active'
  )
);
CREATE POLICY "Posts visible to members" ON community_posts FOR SELECT USING (true);

CREATE TABLE community_comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    UUID REFERENCES community_posts ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  content    TEXT NOT NULL,
  likes      INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can comment" ON community_comments
  USING (true) WITH CHECK (auth.uid() = user_id);

-- ─── Waitlist ──────────────────────────────────────────────────────────
CREATE TABLE waitlist (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email        TEXT UNIQUE NOT NULL,
  artist_name  TEXT,
  source       TEXT DEFAULT 'direct',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can join waitlist" ON waitlist FOR INSERT WITH CHECK (true);

-- ─── Auto-create profiles on signup ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.artist_profiles (id) VALUES (NEW.id);
  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Auto-calculate Vault Readiness Score ─────────────────────────────
CREATE OR REPLACE FUNCTION calculate_vault_readiness(project_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  score        INTEGER := 0;
  project_type TEXT;
  track_count  INTEGER;
  doc_count    INTEGER;
BEGIN
  SELECT type INTO project_type FROM vault_projects WHERE id = project_uuid;

  -- Snippet: simplified score
  IF project_type = 'snippet' THEN
    IF EXISTS (SELECT 1 FROM vault_assets WHERE project_id = project_uuid AND type IN ('lyric_card','snippet_visual')) THEN
      score := score + 40;
    END IF;
    IF EXISTS (SELECT 1 FROM tool_outputs WHERE project_id = project_uuid AND tool_slug = 'dropready') THEN
      score := score + 30;
    END IF;
    IF EXISTS (SELECT 1 FROM tool_outputs WHERE project_id = project_uuid AND tool_slug = 'soundbait') THEN
      score := score + 30;
    END IF;
    RETURN score;
  END IF;

  -- All other types: full score
  SELECT COUNT(*) INTO track_count FROM tracks WHERE project_id = project_uuid;
  IF track_count > 0 THEN score := score + 10; END IF;

  IF EXISTS (SELECT 1 FROM vault_assets WHERE project_id = project_uuid AND type = 'cover_art') THEN
    score := score + 10;
  END IF;

  SELECT COUNT(*) INTO doc_count FROM vault_documents
    WHERE project_id = project_uuid AND type = 'split_sheet' AND status = 'signed';
  IF doc_count > 0 THEN score := score + 15; END IF;

  IF EXISTS (SELECT 1 FROM vault_documents WHERE project_id = project_uuid AND type = 'copyright_registration') THEN
    score := score + 15;
  END IF;

  IF EXISTS (SELECT 1 FROM tracks WHERE project_id = project_uuid AND isrc IS NOT NULL) THEN
    score := score + 10;
  END IF;

  IF EXISTS (SELECT 1 FROM tool_outputs WHERE project_id = project_uuid AND tool_slug = 'royaltyaudit') THEN
    score := score + 10;
  END IF;

  SELECT COUNT(*) INTO doc_count FROM vault_documents
    WHERE project_id = project_uuid AND type = 'hire_right' AND status = 'signed';
  IF doc_count > 0 THEN score := score + 10; END IF;

  IF EXISTS (SELECT 1 FROM tool_outputs WHERE project_id = project_uuid AND tool_slug = 'epkfyi') THEN
    score := score + 10;
  END IF;

  IF EXISTS (SELECT 1 FROM tool_outputs WHERE project_id = project_uuid AND tool_slug IN ('presbit','distroadvisor')) THEN
    score := score + 10;
  END IF;

  RETURN LEAST(score, 100);
END;
$$ LANGUAGE plpgsql;

-- ─── Trigger: recalculate score when anything changes ─────────────────
CREATE OR REPLACE FUNCTION update_vault_readiness()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE vault_projects
  SET vault_readiness_score = calculate_vault_readiness(
    COALESCE(NEW.project_id, OLD.project_id)
  )
  WHERE id = COALESCE(NEW.project_id, OLD.project_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tracks_affect_readiness
  AFTER INSERT OR UPDATE OR DELETE ON tracks
  FOR EACH ROW EXECUTE FUNCTION update_vault_readiness();

CREATE TRIGGER docs_affect_readiness
  AFTER INSERT OR UPDATE ON vault_documents
  FOR EACH ROW EXECUTE FUNCTION update_vault_readiness();

CREATE TRIGGER assets_affect_readiness
  AFTER INSERT ON vault_assets
  FOR EACH ROW EXECUTE FUNCTION update_vault_readiness();

CREATE TRIGGER outputs_affect_readiness
  AFTER INSERT ON tool_outputs
  FOR EACH ROW EXECUTE FUNCTION update_vault_readiness();

-- ─── updated_at triggers ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vault_projects_updated_at    BEFORE UPDATE ON vault_projects    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER artist_profiles_updated_at   BEFORE UPDATE ON artist_profiles   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER subscriptions_updated_at     BEFORE UPDATE ON subscriptions     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tracks_updated_at            BEFORE UPDATE ON tracks            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tool_outputs_updated_at      BEFORE UPDATE ON tool_outputs      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER industry_profiles_updated_at BEFORE UPDATE ON industry_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
