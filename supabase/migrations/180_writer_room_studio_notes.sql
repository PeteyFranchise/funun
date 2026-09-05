-- ============================================================
-- Funūn — Writer's Room Studio Notes
-- Migration 180: whole-song note threads for the unified notes surface.
--
-- HUMAN-GATED. Do not apply from an agent. The project owner runs
-- `supabase db push` after reviewing this file.
--
-- Audio-timestamp notes remain in work_version_comments and lyric-section
-- notes remain in work_lyric_block_comments. This table fills only the
-- missing whole-song context, so each note has one authoritative home.
-- Studio notes are private creative context. They never change membership,
-- audio, lyrics, credits, splits, rights, approval, or delivery state.
-- ============================================================

CREATE TABLE public.work_studio_notes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id               UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  parent_note_id        UUID REFERENCES public.work_studio_notes(id) ON DELETE CASCADE,
  author_user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body                  TEXT NOT NULL,
  mentioned_user_ids    UUID[] NOT NULL DEFAULT '{}'::UUID[],
  resolved_at           TIMESTAMPTZ,
  resolved_by_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (body = btrim(body) AND char_length(body) BETWEEN 1 AND 2000),
  CHECK (cardinality(mentioned_user_ids) <= 25),
  CHECK (parent_note_id IS NULL OR (resolved_at IS NULL AND resolved_by_user_id IS NULL))
);

CREATE INDEX idx_work_studio_notes_work_created
  ON public.work_studio_notes (work_id, created_at DESC);
CREATE INDEX idx_work_studio_notes_parent_created
  ON public.work_studio_notes (parent_note_id, created_at)
  WHERE parent_note_id IS NOT NULL;

ALTER TABLE public.work_studio_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_studio_notes_select
ON public.work_studio_notes
FOR SELECT TO authenticated
USING (
  public.is_work_owner(work_id, auth.uid())
  OR public.work_member_tier(work_id, auth.uid()) IS NOT NULL
);

REVOKE ALL ON TABLE public.work_studio_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, work_id, parent_note_id, author_user_id, body,
  mentioned_user_ids, resolved_at, resolved_by_user_id, created_at
) ON public.work_studio_notes TO authenticated;

COMMENT ON TABLE public.work_studio_notes IS
  'Private whole-song Studio Notes and replies. Context and notification only—not a task, approval, right, split, credit, lyric edit, audio edit, or access grant.';

CREATE OR REPLACE FUNCTION public.validate_work_studio_note()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent public.work_studio_notes%ROWTYPE;
  v_mentioned_user_id UUID;
BEGIN
  IF NEW.author_user_id IS NULL OR NOT (
    public.is_work_owner(NEW.work_id, NEW.author_user_id)
    OR public.work_member_tier(NEW.work_id, NEW.author_user_id) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'studio_note_author_not_participant' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.parent_note_id IS NOT NULL THEN
    SELECT * INTO v_parent
    FROM public.work_studio_notes
    WHERE id = NEW.parent_note_id;

    IF NOT FOUND
       OR v_parent.work_id <> NEW.work_id
       OR v_parent.parent_note_id IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_studio_note_parent' USING ERRCODE = 'P0001';
    END IF;
    IF v_parent.resolved_at IS NOT NULL THEN
      RAISE EXCEPTION 'studio_note_thread_resolved' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  FOREACH v_mentioned_user_id IN ARRAY NEW.mentioned_user_ids LOOP
    IF NOT (
      public.is_work_owner(NEW.work_id, v_mentioned_user_id)
      OR public.work_member_tier(NEW.work_id, v_mentioned_user_id) IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'studio_note_recipient_not_participant' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_work_studio_note
  BEFORE INSERT OR UPDATE OF work_id, parent_note_id, author_user_id, mentioned_user_ids
  ON public.work_studio_notes
  FOR EACH ROW EXECUTE FUNCTION public.validate_work_studio_note();

CREATE OR REPLACE FUNCTION public.create_work_studio_note(
  p_work_id UUID,
  p_body TEXT,
  p_parent_note_id UUID DEFAULT NULL,
  p_mentioned_user_ids UUID[] DEFAULT '{}'::UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID;
  v_note public.work_studio_notes%ROWTYPE;
  v_mentions UUID[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL OR NOT (
    public.is_work_owner(p_work_id, v_uid)
    OR public.work_member_tier(p_work_id, v_uid) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'work_access_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'invalid_studio_note_body' USING ERRCODE = '22023';
  END IF;

  v_mentions := ARRAY(
    SELECT DISTINCT mentioned_id
    FROM unnest(COALESCE(p_mentioned_user_ids, '{}'::UUID[])) AS mentioned_id
    WHERE mentioned_id IS NOT NULL
    ORDER BY mentioned_id
  );
  IF cardinality(v_mentions) > 25 THEN
    RAISE EXCEPTION 'too_many_studio_note_recipients' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.work_studio_notes (
    work_id, parent_note_id, author_user_id, body, mentioned_user_ids
  ) VALUES (
    p_work_id, p_parent_note_id, v_uid, btrim(p_body), v_mentions
  ) RETURNING * INTO v_note;

  RETURN to_jsonb(v_note);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_work_studio_note_resolution(
  p_work_id UUID,
  p_note_id UUID,
  p_resolved BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID;
  v_note public.work_studio_notes%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL OR NOT (
    public.is_work_owner(p_work_id, v_uid)
    OR public.work_member_tier(p_work_id, v_uid) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'work_access_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_resolved IS NULL THEN
    RAISE EXCEPTION 'invalid_studio_note_resolution' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_note
  FROM public.work_studio_notes
  WHERE id = p_note_id AND work_id = p_work_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'studio_note_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_note.parent_note_id IS NOT NULL THEN
    RAISE EXCEPTION 'studio_note_reply_not_resolvable' USING ERRCODE = 'P0001';
  END IF;
  IF v_note.author_user_id IS DISTINCT FROM v_uid
     AND NOT public.is_work_owner(p_work_id, v_uid)
     AND public.work_member_tier(p_work_id, v_uid) IS DISTINCT FROM 'administer' THEN
    RAISE EXCEPTION 'studio_note_resolution_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.work_studio_notes
  SET resolved_at = CASE WHEN p_resolved THEN COALESCE(resolved_at, now()) ELSE NULL END,
      resolved_by_user_id = CASE WHEN p_resolved THEN COALESCE(resolved_by_user_id, v_uid) ELSE NULL END
  WHERE id = p_note_id
  RETURNING * INTO v_note;

  RETURN to_jsonb(v_note);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_work_studio_note(uuid, text, uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_work_studio_note(uuid, text, uuid, uuid[])
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_work_studio_note_resolution(uuid, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_work_studio_note_resolution(uuid, uuid, boolean)
  TO authenticated;

-- ─── Micro-reactions across every Studio Notes source ────────────────

CREATE TABLE public.work_note_reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id     UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  source      TEXT NOT NULL CHECK (source IN ('song', 'audio', 'lyrics')),
  note_id     UUID NOT NULL,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction    TEXT NOT NULL CHECK (reaction IN ('like', 'love', 'fire', 'heard', 'done', 'idea', 'laugh')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (work_id, source, note_id, user_id, reaction)
);

CREATE INDEX idx_work_note_reactions_target
  ON public.work_note_reactions (work_id, source, note_id, created_at);

ALTER TABLE public.work_note_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_note_reactions_select
ON public.work_note_reactions
FOR SELECT TO authenticated
USING (
  public.is_work_owner(work_id, auth.uid())
  OR public.work_member_tier(work_id, auth.uid()) IS NOT NULL
);

REVOKE ALL ON TABLE public.work_note_reactions FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, work_id, source, note_id, user_id, reaction, created_at)
  ON public.work_note_reactions TO authenticated;

COMMENT ON TABLE public.work_note_reactions IS
  'Participant-only micro-reactions on Studio Notes, timestamped comments, lyric comments and replies. A reaction is acknowledgement only; done is not thread resolution or approval.';

CREATE OR REPLACE FUNCTION public.validate_work_note_reaction()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target_work_id UUID;
BEGIN
  IF NOT (
    public.is_work_owner(NEW.work_id, NEW.user_id)
    OR public.work_member_tier(NEW.work_id, NEW.user_id) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'reaction_author_not_participant' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.source = 'song' THEN
    SELECT work_id INTO v_target_work_id FROM public.work_studio_notes WHERE id = NEW.note_id;
  ELSIF NEW.source = 'audio' THEN
    SELECT work_id INTO v_target_work_id FROM public.work_version_comments WHERE id = NEW.note_id;
  ELSIF NEW.source = 'lyrics' THEN
    SELECT work_id INTO v_target_work_id FROM public.work_lyric_block_comments WHERE id = NEW.note_id;
  END IF;

  IF v_target_work_id IS NULL OR v_target_work_id <> NEW.work_id THEN
    RAISE EXCEPTION 'reaction_note_not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_work_note_reaction
  BEFORE INSERT OR UPDATE OF work_id, source, note_id, user_id
  ON public.work_note_reactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_work_note_reaction();

CREATE OR REPLACE FUNCTION public.toggle_work_note_reaction(
  p_work_id UUID,
  p_source TEXT,
  p_note_id UUID,
  p_reaction TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID;
  v_existing_id UUID;
  v_reaction public.work_note_reactions%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL OR NOT (
    public.is_work_owner(p_work_id, v_uid)
    OR public.work_member_tier(p_work_id, v_uid) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'work_access_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('song', 'audio', 'lyrics') THEN
    RAISE EXCEPTION 'invalid_reaction_source' USING ERRCODE = '22023';
  END IF;
  IF p_reaction IS NULL OR p_reaction NOT IN ('like', 'love', 'fire', 'heard', 'done', 'idea', 'laugh') THEN
    RAISE EXCEPTION 'invalid_reaction' USING ERRCODE = '22023';
  END IF;

  -- Serialize toggles for this exact user/reaction target. Without this,
  -- two near-simultaneous taps could both observe no row and race the unique
  -- constraint instead of behaving as one deterministic toggle.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_work_id::TEXT || ':' || p_source || ':' || p_note_id::TEXT || ':' || v_uid::TEXT || ':' || p_reaction,
      0
    )
  );

  SELECT id INTO v_existing_id
  FROM public.work_note_reactions
  WHERE work_id = p_work_id
    AND source = p_source
    AND note_id = p_note_id
    AND user_id = v_uid
    AND reaction = p_reaction
  FOR UPDATE;

  IF FOUND THEN
    DELETE FROM public.work_note_reactions WHERE id = v_existing_id;
    RETURN jsonb_build_object('active', false, 'reaction', p_reaction);
  END IF;

  INSERT INTO public.work_note_reactions (work_id, source, note_id, user_id, reaction)
  VALUES (p_work_id, p_source, p_note_id, v_uid, p_reaction)
  RETURNING * INTO v_reaction;

  RETURN jsonb_build_object(
    'active', true,
    'reaction', v_reaction.reaction,
    'createdAt', v_reaction.created_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_work_note_reaction(uuid, text, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_work_note_reaction(uuid, text, uuid, text)
  TO authenticated;
