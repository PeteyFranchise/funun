-- 169_ideas_inbox.sql
-- Private, capture-first sparks that exist before a Writer's Room. The Idea
-- Canvas is intentionally absent; this migration supports a linear inbox and
-- preserves provenance when an owner promotes an idea into a work.

CREATE TABLE public.ideas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  note              TEXT,
  transcript        TEXT,
  moods             TEXT[] NOT NULL DEFAULT '{}',
  state             TEXT NOT NULL DEFAULT 'active'
                    CHECK (state IN ('active', 'snoozed', 'archived', 'promoted')),
  pinned            BOOLEAN NOT NULL DEFAULT FALSE,
  snoozed_until     TIMESTAMPTZ,
  parent_idea_id    UUID REFERENCES public.ideas(id) ON DELETE SET NULL,
  promoted_work_id  UUID REFERENCES public.works(id) ON DELETE SET NULL,
  captured_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(title) BETWEEN 1 AND 200),
  CHECK (note IS NULL OR char_length(note) <= 10000),
  CHECK (transcript IS NULL OR char_length(transcript) <= 50000),
  CHECK (cardinality(moods) <= 12)
);

CREATE INDEX idx_ideas_owner_inbox ON public.ideas (user_id, pinned DESC, captured_at DESC);
CREATE INDEX idx_ideas_parent ON public.ideas (parent_idea_id) WHERE parent_idea_id IS NOT NULL;
CREATE INDEX idx_ideas_promoted_work ON public.ideas (promoted_work_id) WHERE promoted_work_id IS NOT NULL;

CREATE TRIGGER ideas_updated_at
  BEFORE UPDATE ON public.ideas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.idea_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id     UUID NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission  TEXT NOT NULL CHECK (permission IN ('listen', 'comment', 'contribute')),
  added_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idea_id, user_id)
);

CREATE INDEX idx_idea_members_user ON public.idea_members (user_id, created_at DESC);

CREATE TABLE public.idea_share_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id     UUID NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  permission  TEXT NOT NULL CHECK (permission IN ('listen', 'comment', 'contribute')),
  created_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  claimed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at  TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(token_hash) = 64)
);

CREATE INDEX idx_idea_share_links_owner ON public.idea_share_links (created_by, created_at DESC);

CREATE TABLE public.idea_recordings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id              UUID NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  parent_recording_id  UUID REFERENCES public.idea_recordings(id) ON DELETE SET NULL,
  audio_path           TEXT NOT NULL,
  audio_ext            TEXT NOT NULL,
  audio_size           BIGINT NOT NULL CHECK (audio_size > 0),
  duration_seconds     INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  label                TEXT,
  kind                 TEXT NOT NULL DEFAULT 'voice'
                       CHECK (kind IN ('voice', 'melody', 'lyric', 'rhythm', 'harmony', 'reference', 'import')),
  rating               TEXT CHECK (rating IS NULL OR rating IN ('keep', 'maybe')),
  archived_at          TIMESTAMPTZ,
  captured_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (label IS NULL OR char_length(label) <= 200)
);

CREATE INDEX idx_idea_recordings_idea ON public.idea_recordings (idea_id, captured_at DESC);
CREATE INDEX idx_idea_recordings_path ON public.idea_recordings (audio_path);

CREATE TABLE public.idea_markers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id       UUID NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  recording_id  UUID NOT NULL REFERENCES public.idea_recordings(id) ON DELETE CASCADE,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  timestamp_ms  INTEGER NOT NULL CHECK (timestamp_ms >= 0),
  label         TEXT CHECK (label IS NULL OR char_length(label) <= 100),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_idea_markers_recording ON public.idea_markers (recording_id, timestamp_ms);

CREATE TABLE public.idea_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id       UUID NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  recording_id  UUID REFERENCES public.idea_recordings(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  timestamp_ms  INTEGER CHECK (timestamp_ms IS NULL OR timestamp_ms >= 0),
  body          TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_idea_comments_idea ON public.idea_comments (idea_id, created_at);

CREATE TABLE public.idea_references (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id     UUID NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('link', 'text', 'image')),
  value       TEXT NOT NULL CHECK (char_length(value) BETWEEN 1 AND 2000),
  label       TEXT CHECK (label IS NULL OR char_length(label) <= 200),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_idea_references_idea ON public.idea_references (idea_id, created_at);

CREATE TABLE public.idea_collections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE public.idea_collection_items (
  collection_id UUID NOT NULL REFERENCES public.idea_collections(id) ON DELETE CASCADE,
  idea_id       UUID NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, idea_id)
);

CREATE TABLE public.idea_work_version_links (
  idea_id       UUID NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  recording_id  UUID NOT NULL REFERENCES public.idea_recordings(id) ON DELETE CASCADE,
  work_id       UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  version_id    UUID NOT NULL UNIQUE REFERENCES public.work_versions(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (idea_id, recording_id, work_id)
);

CREATE OR REPLACE FUNCTION public.idea_access_level(p_idea_id UUID, p_uid UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.ideas idea
      WHERE idea.id = p_idea_id AND idea.user_id = p_uid
    ) THEN 'owner'
    ELSE (
      SELECT member.permission FROM public.idea_members member
      WHERE member.idea_id = p_idea_id AND member.user_id = p_uid
    )
  END
$$;

REVOKE EXECUTE ON FUNCTION public.idea_access_level(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.idea_access_level(UUID, UUID) TO authenticated;

ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_markers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_work_version_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY ideas_select ON public.ideas FOR SELECT TO authenticated USING (
  (SELECT public.idea_access_level(id, auth.uid())) IS NOT NULL
);
CREATE POLICY idea_members_select ON public.idea_members FOR SELECT TO authenticated USING (
  (SELECT public.idea_access_level(idea_id, auth.uid())) IS NOT NULL
);
CREATE POLICY idea_share_links_select ON public.idea_share_links FOR SELECT TO authenticated USING (
  created_by = auth.uid()
);
CREATE POLICY idea_recordings_select ON public.idea_recordings FOR SELECT TO authenticated USING (
  (SELECT public.idea_access_level(idea_id, auth.uid())) IS NOT NULL
);
CREATE POLICY idea_markers_select ON public.idea_markers FOR SELECT TO authenticated USING (
  (SELECT public.idea_access_level(idea_id, auth.uid())) IS NOT NULL
);
CREATE POLICY idea_comments_select ON public.idea_comments FOR SELECT TO authenticated USING (
  (SELECT public.idea_access_level(idea_id, auth.uid())) IS NOT NULL
);
CREATE POLICY idea_references_select ON public.idea_references FOR SELECT TO authenticated USING (
  (SELECT public.idea_access_level(idea_id, auth.uid())) IS NOT NULL
);
CREATE POLICY idea_collections_select ON public.idea_collections FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY idea_collection_items_select ON public.idea_collection_items FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.idea_collections collection
    WHERE collection.id = idea_collection_items.collection_id AND collection.user_id = auth.uid()
  )
);
CREATE POLICY idea_work_version_links_select ON public.idea_work_version_links FOR SELECT TO authenticated USING (
  (SELECT public.idea_access_level(idea_id, auth.uid())) IS NOT NULL
);

REVOKE ALL ON public.ideas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.idea_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.idea_share_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.idea_recordings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.idea_markers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.idea_comments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.idea_references FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.idea_collections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.idea_collection_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.idea_work_version_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ideas, public.idea_members, public.idea_share_links, public.idea_recordings,
  public.idea_markers, public.idea_comments, public.idea_references,
  public.idea_collections, public.idea_collection_items,
  public.idea_work_version_links TO authenticated;

CREATE OR REPLACE FUNCTION public.promote_idea_to_work(
  p_idea_id UUID,
  p_actor UUID,
  p_target_work_id UUID DEFAULT NULL
)
RETURNS TABLE(work_id UUID, created BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  idea_row public.ideas%ROWTYPE;
  target_work_id UUID;
  recording public.idea_recordings%ROWTYPE;
  new_version_id UUID;
  created_work BOOLEAN := FALSE;
BEGIN
  SELECT * INTO idea_row FROM public.ideas
  WHERE id = p_idea_id FOR UPDATE;

  IF idea_row.id IS NULL OR idea_row.user_id <> p_actor THEN
    RAISE EXCEPTION 'idea_promotion_requires_owner' USING ERRCODE = 'P0001';
  END IF;

  IF idea_row.promoted_work_id IS NOT NULL THEN
    RETURN QUERY SELECT idea_row.promoted_work_id, FALSE;
    RETURN;
  END IF;

  IF p_target_work_id IS NULL THEN
    INSERT INTO public.works (user_id, title)
    VALUES (p_actor, idea_row.title)
    RETURNING id INTO target_work_id;

    INSERT INTO public.work_members (work_id, user_id, collaborator_id, tier, added_by)
    VALUES (target_work_id, p_actor, NULL, 'administer', p_actor);

    INSERT INTO public.split_sheets (initiator_user_id, work_id, song_name, status)
    VALUES (p_actor, target_work_id, idea_row.title, 'draft');
    created_work := TRUE;
  ELSE
    IF NOT (
      public.is_work_owner(p_target_work_id, p_actor)
      OR public.work_member_tier(p_target_work_id, p_actor) = 'administer'
    ) THEN
      RAISE EXCEPTION 'idea_target_requires_administer_access' USING ERRCODE = 'P0001';
    END IF;
    target_work_id := p_target_work_id;
  END IF;

  INSERT INTO public.work_members (work_id, user_id, collaborator_id, tier, added_by)
  SELECT target_work_id, member.user_id, NULL, 'contribute', p_actor
  FROM public.idea_members member
  WHERE member.idea_id = idea_row.id
    AND member.permission = 'contribute'
    AND member.user_id <> p_actor
    AND NOT EXISTS (
      SELECT 1 FROM public.work_members existing
      WHERE existing.work_id = target_work_id AND existing.user_id = member.user_id
    );

  FOR recording IN
    SELECT * FROM public.idea_recordings
    WHERE idea_id = idea_row.id AND archived_at IS NULL
    ORDER BY captured_at, id
  LOOP
    new_version_id := gen_random_uuid();
    INSERT INTO public.work_versions (
      id, work_id, user_id, source, audio_path, audio_ext, audio_size,
      duration_seconds, label, performers, created_at
    ) VALUES (
      new_version_id, target_work_id, COALESCE(recording.created_by, p_actor),
      'hum', recording.audio_path, recording.audio_ext, recording.audio_size,
      recording.duration_seconds, recording.label, '[]'::jsonb, recording.captured_at
    );
    INSERT INTO public.idea_work_version_links (
      idea_id, recording_id, work_id, version_id
    ) VALUES (
      idea_row.id, recording.id, target_work_id, new_version_id
    );
  END LOOP;

  UPDATE public.ideas
  SET promoted_work_id = target_work_id, state = 'promoted', snoozed_until = NULL
  WHERE id = idea_row.id;

  RETURN QUERY SELECT target_work_id, created_work;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.promote_idea_to_work(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_idea_to_work(UUID, UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_idea_share_link(p_token_hash TEXT, p_user UUID)
RETURNS TABLE(claimed_idea_id UUID, inviter_user_id UUID, granted_permission TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  link_row public.idea_share_links%ROWTYPE;
BEGIN
  SELECT * INTO link_row FROM public.idea_share_links
  WHERE token_hash = p_token_hash FOR UPDATE;

  IF link_row.id IS NULL OR link_row.revoked_at IS NOT NULL OR link_row.expires_at <= now() THEN
    RAISE EXCEPTION 'idea_share_link_unavailable' USING ERRCODE = 'P0001';
  END IF;
  IF link_row.claimed_by IS NOT NULL AND link_row.claimed_by <> p_user THEN
    RAISE EXCEPTION 'idea_share_link_already_claimed' USING ERRCODE = 'P0001';
  END IF;

  IF link_row.created_by <> p_user THEN
    INSERT INTO public.idea_members (idea_id, user_id, permission, added_by)
    VALUES (link_row.idea_id, p_user, link_row.permission, link_row.created_by)
    ON CONFLICT (idea_id, user_id) DO UPDATE SET permission = EXCLUDED.permission;

    UPDATE public.idea_share_links
    SET claimed_by = p_user, claimed_at = COALESCE(claimed_at, now())
    WHERE id = link_row.id;
  END IF;

  RETURN QUERY SELECT link_row.idea_id, link_row.created_by, link_row.permission;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_idea_share_link(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_idea_share_link(TEXT, UUID) TO service_role;

COMMENT ON TABLE public.ideas IS
  'Private pre-song captures. No row is a song, split, right, registration, approval, master or release.';
COMMENT ON TABLE public.idea_work_version_links IS
  'Immutable provenance from an Idea recording to the Writer''s Room take created during promotion.';
COMMENT ON FUNCTION public.promote_idea_to_work(UUID, UUID, UUID) IS
  'Service-only atomic promotion that carries recordings and contribute members into a Writer''s Room without assigning splits or rights.';
COMMENT ON FUNCTION public.claim_idea_share_link(TEXT, UUID) IS
  'Service-only, row-locked one-use claim for an expiring private Idea invitation.';

NOTIFY pgrst, 'reload schema';
