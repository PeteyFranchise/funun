-- 161_writer_room_lyric_suggestions.sql
-- Non-destructive alternate lyrics for original Writer's Room sections.
-- A suggestion is creative discussion until an authorized person accepts it.

ALTER TABLE public.work_lyric_block_snapshots
  DROP CONSTRAINT IF EXISTS work_lyric_block_snapshots_reason_check;
ALTER TABLE public.work_lyric_block_snapshots
  ADD CONSTRAINT work_lyric_block_snapshots_reason_check
  CHECK (reason IN ('edit_session_start', 'before_restore', 'before_suggestion_accept'));

CREATE TABLE public.work_lyric_block_suggestions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id               UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  block_id              UUID NOT NULL REFERENCES public.lyric_blocks(id) ON DELETE CASCADE,
  author_user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  base_text             TEXT NOT NULL,
  proposed_text         TEXT NOT NULL,
  note                  TEXT,
  mentioned_user_ids    UUID[] NOT NULL DEFAULT '{}'::UUID[],
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  decided_by_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(proposed_text) BETWEEN 1 AND 4000 AND char_length(btrim(proposed_text)) > 0),
  CHECK (note IS NULL OR (note = btrim(note) AND char_length(note) BETWEEN 1 AND 500)),
  CHECK (cardinality(mentioned_user_ids) <= 25),
  CHECK (
    (status = 'pending' AND decided_by_user_id IS NULL AND decided_at IS NULL)
    OR (status <> 'pending' AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL)
  )
);

CREATE INDEX idx_work_lyric_block_suggestions_block_status_created
  ON public.work_lyric_block_suggestions (block_id, status, created_at DESC);

ALTER TABLE public.work_lyric_block_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_lyric_block_suggestions_select
ON public.work_lyric_block_suggestions
FOR SELECT
TO authenticated
USING (
  public.is_work_owner(work_id, auth.uid())
  OR public.work_member_tier(work_id, auth.uid()) IS NOT NULL
);

REVOKE ALL ON TABLE public.work_lyric_block_suggestions FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, work_id, block_id, author_user_id, base_text, proposed_text, note,
  mentioned_user_ids, status, decided_by_user_id, decided_at, created_at, updated_at
) ON public.work_lyric_block_suggestions TO authenticated;

COMMENT ON TABLE public.work_lyric_block_suggestions IS
  'Private alternate words proposed beside a Writer''s Room lyric section. A suggestion is not canonical lyrics, authorship adjudication, a split claim, rights approval, or legal consent.';

CREATE OR REPLACE FUNCTION public.validate_work_lyric_block_suggestion()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mentioned_user_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.lyric_blocks
    WHERE id = NEW.block_id
      AND work_id = NEW.work_id
      AND repeat_of_block_id IS NULL
  ) THEN
    RAISE EXCEPTION 'lyric_block_not_suggestible' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.author_user_id IS NULL OR NOT (
    public.is_work_owner(NEW.work_id, NEW.author_user_id)
    OR public.work_member_tier(NEW.work_id, NEW.author_user_id) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'suggestion_author_not_participant' USING ERRCODE = 'P0001';
  END IF;

  FOREACH v_mentioned_user_id IN ARRAY NEW.mentioned_user_ids LOOP
    IF NOT (
      public.is_work_owner(NEW.work_id, v_mentioned_user_id)
      OR public.work_member_tier(NEW.work_id, v_mentioned_user_id) IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'mentioned_user_not_participant' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_work_lyric_block_suggestion
  BEFORE INSERT OR UPDATE OF work_id, block_id, mentioned_user_ids
  ON public.work_lyric_block_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.validate_work_lyric_block_suggestion();

-- Lock acquisition and suggestion acceptance both serialize on the lyric
-- block row. Without this, a new 30-second lease could race between the
-- acceptance function's active-lock check and its canonical text update.
CREATE OR REPLACE FUNCTION public.serialize_work_lyric_block_lock()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1
  FROM public.lyric_blocks
  WHERE id = NEW.block_id AND work_id = NEW.work_id
  FOR UPDATE;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_serialize_work_lyric_block_lock
  BEFORE INSERT OR UPDATE ON public.work_lyric_block_locks
  FOR EACH ROW EXECUTE FUNCTION public.serialize_work_lyric_block_lock();

CREATE OR REPLACE FUNCTION public.create_work_lyric_block_suggestion(
  p_work_id UUID,
  p_block_id UUID,
  p_proposed_text TEXT,
  p_note TEXT DEFAULT NULL,
  p_mentioned_user_ids UUID[] DEFAULT '{}'::UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID;
  v_block public.lyric_blocks%ROWTYPE;
  v_suggestion public.work_lyric_block_suggestions%ROWTYPE;
  v_mentions UUID[];
  v_note TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL OR NOT (
    public.is_work_owner(p_work_id, v_uid)
    OR public.work_member_tier(p_work_id, v_uid) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'work_access_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_proposed_text IS NULL
     OR char_length(p_proposed_text) NOT BETWEEN 1 AND 4000
     OR char_length(btrim(p_proposed_text)) = 0 THEN
    RAISE EXCEPTION 'invalid_suggestion_text' USING ERRCODE = '22023';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'invalid_suggestion_note' USING ERRCODE = '22023';
  END IF;

  v_mentions := ARRAY(
    SELECT DISTINCT mentioned_id
    FROM unnest(COALESCE(p_mentioned_user_ids, '{}'::UUID[])) AS mentioned_id
    WHERE mentioned_id IS NOT NULL
    ORDER BY mentioned_id
  );
  IF cardinality(v_mentions) > 25 THEN
    RAISE EXCEPTION 'too_many_mentions' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_block
  FROM public.lyric_blocks
  WHERE id = p_block_id
    AND work_id = p_work_id
    AND repeat_of_block_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lyric_block_not_suggestible' USING ERRCODE = 'P0001';
  END IF;
  IF p_proposed_text IS NOT DISTINCT FROM v_block.text THEN
    RAISE EXCEPTION 'suggestion_matches_current' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.work_lyric_block_suggestions (
    work_id, block_id, author_user_id, base_text, proposed_text, note, mentioned_user_ids
  ) VALUES (
    p_work_id, p_block_id, v_uid, v_block.text, p_proposed_text, v_note, v_mentions
  )
  RETURNING * INTO v_suggestion;

  RETURN to_jsonb(v_suggestion);
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_work_lyric_block_suggestion(
  p_work_id UUID,
  p_block_id UUID,
  p_suggestion_id UUID,
  p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID;
  v_suggestion public.work_lyric_block_suggestions%ROWTYPE;
  v_block public.lyric_blocks%ROWTYPE;
  v_can_administer BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL OR p_action IS NULL OR p_action NOT IN ('accept', 'decline') THEN
    RAISE EXCEPTION 'invalid_suggestion_decision' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_work_owner(p_work_id, v_uid)
    OR public.work_member_tier(p_work_id, v_uid) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'work_access_required' USING ERRCODE = 'P0001';
  END IF;

  v_can_administer := public.is_work_owner(p_work_id, v_uid)
    OR public.work_member_tier(p_work_id, v_uid) = 'administer';

  -- Every decision on this section takes the same row lock first. This
  -- prevents two administrators accepting different pending proposals
  -- from deadlocking while each transaction closes the other's row.
  SELECT * INTO v_block
  FROM public.lyric_blocks
  WHERE id = p_block_id
    AND work_id = p_work_id
    AND repeat_of_block_id IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lyric_block_not_suggestible' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_suggestion
  FROM public.work_lyric_block_suggestions
  WHERE id = p_suggestion_id
    AND work_id = p_work_id
    AND block_id = p_block_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'suggestion_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_suggestion.status <> 'pending' THEN
    RAISE EXCEPTION 'suggestion_already_decided' USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'decline' THEN
    IF NOT v_can_administer AND v_suggestion.author_user_id <> v_uid THEN
      RAISE EXCEPTION 'suggestion_decision_not_allowed' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.work_lyric_block_suggestions
    SET status = 'declined', decided_by_user_id = v_uid, decided_at = now(), updated_at = now()
    WHERE id = v_suggestion.id
    RETURNING * INTO v_suggestion;
    RETURN to_jsonb(v_suggestion);
  END IF;

  IF NOT v_can_administer THEN
    RAISE EXCEPTION 'suggestion_accept_not_allowed' USING ERRCODE = 'P0001';
  END IF;
  IF v_suggestion.author_user_id IS NULL THEN
    RAISE EXCEPTION 'suggestion_author_unavailable' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.work_lyric_block_locks
    WHERE work_id = p_work_id
      AND block_id = p_block_id
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'lyric_block_busy' USING ERRCODE = 'P0001';
  END IF;
  IF v_block.text IS DISTINCT FROM v_suggestion.base_text THEN
    RAISE EXCEPTION 'suggestion_stale' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.work_lyric_block_snapshots (
    work_id, block_id, capture_key, reason, text, captured_by_user_id
  ) VALUES (
    p_work_id, p_block_id, v_suggestion.id, 'before_suggestion_accept', v_block.text, v_uid
  ) ON CONFLICT (block_id, capture_key) DO NOTHING;

  PERFORM set_config('funun.lyric_text_write', 'suggestion_accept', TRUE);
  PERFORM set_config('funun.lyric_suggestion_id', v_suggestion.id::TEXT, TRUE);
  PERFORM set_config('funun.lyric_suggestion_author_id', v_suggestion.author_user_id::TEXT, TRUE);

  UPDATE public.lyric_blocks
  SET text = v_suggestion.proposed_text,
      author_kind = 'human',
      author_user_id = v_suggestion.author_user_id
  WHERE id = p_block_id AND work_id = p_work_id;

  UPDATE public.work_lyric_block_suggestions
  SET status = CASE WHEN id = v_suggestion.id THEN 'accepted' ELSE 'declined' END,
      decided_by_user_id = v_uid,
      decided_at = now(),
      updated_at = now()
  WHERE block_id = p_block_id AND status = 'pending';

  SELECT * INTO v_suggestion
  FROM public.work_lyric_block_suggestions
  WHERE id = p_suggestion_id;
  RETURN to_jsonb(v_suggestion);
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_lyric_text_write_path()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_write_mode TEXT;
BEGIN
  v_write_mode := NULLIF(current_setting('funun.lyric_text_write', TRUE), '');
  IF v_write_mode IS NULL OR v_write_mode NOT IN ('locked_save', 'restore', 'detach', 'suggestion_accept') THEN
    RAISE EXCEPTION 'lyric_text_write_path_required' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_lyric_block_edited()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_restore_snapshot_id TEXT;
  v_suggestion_id TEXT;
  v_suggestion_author_id TEXT;
  v_write_mode TEXT;
BEGIN
  v_write_mode := NULLIF(current_setting('funun.lyric_text_write', TRUE), '');
  IF v_write_mode = 'detach' THEN
    RETURN NEW;
  END IF;

  v_restore_snapshot_id := NULLIF(current_setting('funun.lyric_restore_snapshot_id', TRUE), '');
  v_suggestion_id := NULLIF(current_setting('funun.lyric_suggestion_id', TRUE), '');
  v_suggestion_author_id := NULLIF(current_setting('funun.lyric_suggestion_author_id', TRUE), '');

  INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)
  VALUES (
    NEW.work_id,
    'lyric_edit',
    COALESCE(auth.uid(), NEW.author_user_id),
    jsonb_strip_nulls(jsonb_build_object(
      'blockId', NEW.id,
      'blockType', NEW.block_type,
      'customLabel', NEW.custom_label,
      'operation', CASE
        WHEN v_suggestion_id IS NOT NULL THEN 'suggestion_accepted'
        WHEN v_restore_snapshot_id IS NOT NULL THEN 'restored'
        ELSE 'edited'
      END,
      'snapshotId', v_restore_snapshot_id,
      'suggestionId', v_suggestion_id,
      'suggestionAuthorId', v_suggestion_author_id
    ))
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_work_lyric_block_suggestion(uuid, uuid, text, text, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_work_lyric_block_suggestion(uuid, uuid, text, text, uuid[])
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.decide_work_lyric_block_suggestion(uuid, uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_work_lyric_block_suggestion(uuid, uuid, uuid, text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.validate_work_lyric_block_suggestion()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.serialize_work_lyric_block_lock()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
