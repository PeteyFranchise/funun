-- ============================================================
-- Funūn — Wave 3: Launchpad — Playlist Curator Pitching
-- Migration 030: curators directory + pitch_history log +
-- handle_new_user() curator branch
-- Run via: supabase db push
-- ============================================================

-- ─── curators (directory of playlist/channel curators) ─────────────
-- Lean field set (D-02): name, email, playlist/channel URL, genre
-- focus, submission notes, plus an auto-fetched reach_signal (never
-- admin-entered directly). RLS enabled immediately after CREATE TABLE
-- (CVE-2025-48757 convention).
CREATE TABLE curators (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                   TEXT NOT NULL,
  email                  TEXT NOT NULL UNIQUE,
  playlist_name          TEXT,
  playlist_url           TEXT,
  platform               TEXT NOT NULL CHECK (platform IN ('spotify', 'apple_music', 'youtube_music', 'soundcloud', 'blog_other')),
  genre_focus            TEXT[] NOT NULL DEFAULT '{}',
  baseline_genre_focus   TEXT[] NOT NULL DEFAULT '{}',   -- drift baseline (D-16)
  submission_notes       TEXT,
  reach_signal           INT,                            -- nullable/approximate — never 0 (RESEARCH Pitfall 5)
  reach_fetched_at       TIMESTAMPTZ,
  email_valid            BOOLEAN NOT NULL DEFAULT true,   -- flips false on hard bounce (D-15)
  do_not_pitch           BOOLEAN NOT NULL DEFAULT false,  -- unsubscribe flag (D-20)
  drift_flagged          BOOLEAN NOT NULL DEFAULT false,  -- genre-focus drift alert (D-16/D-17)
  flagged_inactive       BOOLEAN NOT NULL DEFAULT false,  -- admin manual toggle (D-21)
  claimed_by             UUID REFERENCES auth.users(id),  -- set on claim (D-18)
  claim_token            TEXT,
  claim_token_expires_at TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE curators ENABLE ROW LEVEL SECURITY;

-- Authenticated artists browse the directory; admin writes go through
-- createServiceClient() which bypasses RLS (matching launchpad_checklist_items).
CREATE POLICY "Anyone can read curators" ON curators
  FOR SELECT USING (true);

-- Curator self-serve edit of their own claimed row (IDOR mitigation T-06-05).
-- Defense-in-depth `.eq('claimed_by', user.id)` enforced again in the API
-- route (plan 06-05).
CREATE POLICY "Claimed curators update own row" ON curators
  FOR UPDATE
  USING (auth.uid() = claimed_by)
  WITH CHECK (auth.uid() = claimed_by);

-- Reuse update_updated_at() trigger function defined in migration 001
CREATE TRIGGER set_curators_updated_at
  BEFORE UPDATE ON curators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_curators_email ON curators (email);
CREATE INDEX idx_curators_claim_token ON curators (claim_token) WHERE claim_token IS NOT NULL;

-- ─── pitch_history (per-project pitch log) ──────────────────────────
-- All writes are server-side via the service-role client (send route,
-- token accept/decline routes, curator portal read path) — matching
-- the notifications table convention in migration 009. The
-- uniq_curator_track_pitch constraint is the DB-layer backstop for the
-- duplicate-send guard (PITCH-03).
CREATE TABLE pitch_history (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id     UUID NOT NULL REFERENCES vault_projects(id) ON DELETE CASCADE,
  track_id       UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  curator_id     UUID NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
  artist_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),  -- no 'opened' (D-10)
  response_token TEXT NOT NULL UNIQUE,
  decline_reason TEXT,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at   TIMESTAMPTZ,
  CONSTRAINT uniq_curator_track_pitch UNIQUE (curator_id, track_id)
);

ALTER TABLE pitch_history ENABLE ROW LEVEL SECURITY;

-- Artists read their own pitch history only. No INSERT/UPDATE policy
-- for users — all writes are server-side (service-role client).
-- Curator portal reads pitches-received via a service-role query
-- filtered to their curator_id, not via RLS.
CREATE POLICY "Artists read own pitch history" ON pitch_history
  FOR SELECT USING (auth.uid() = artist_id);

CREATE INDEX idx_pitch_history_curator_sent ON pitch_history (curator_id, sent_at);
CREATE INDEX idx_pitch_history_project ON pitch_history (project_id);

-- ─── handle_new_user() — curator branch (RESEARCH Pitfall 1) ───────
-- Curator accounts are created via service.auth.admin.createUser()
-- with app_metadata.role = 'curator' set at creation time. Without
-- this branch, the trigger would insert artist_profiles/subscriptions
-- rows for curators too, and claim_collaborators() would run against
-- an account that was never meant to be an artist. Early RETURN NEW
-- as the FIRST statement inside BEGIN skips all of that. app_metadata
-- is service-role-only writable, not client-forgeable.
--
-- Entire body copied verbatim from migration 027 with the curator
-- branch inserted. No CREATE TRIGGER statement — on_auth_user_created
-- (migration 001) already invokes this function and picks up the
-- replaced body automatically.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.artist_profiles (id) VALUES (NEW.id);
  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active');

  -- Phase 4: claim any collaborator rows matching this user's email.
  -- Wrapped in a nested exception block so a claim failure cannot
  -- orphan the new account by rolling back the two inserts above (CR-04).
  BEGIN
    PERFORM public.claim_collaborators(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- swallow claim errors; account creation continues
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
