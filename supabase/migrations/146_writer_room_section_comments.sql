-- 146_writer_room_section_comments.sql
-- Stage 4 Writer's Room collaboration: private lyric-section comment
-- threads, participant-only mentions and trigger-sourced diary evidence.

CREATE TABLE public.work_lyric_block_comments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id               UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  block_id              UUID NOT NULL REFERENCES public.lyric_blocks(id) ON DELETE CASCADE,
  parent_comment_id     UUID REFERENCES public.work_lyric_block_comments(id) ON DELETE CASCADE,
  author_user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body                  TEXT NOT NULL,
  mentioned_user_ids    UUID[] NOT NULL DEFAULT '{}'::UUID[],
  resolved_at           TIMESTAMPTZ,
  resolved_by_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (body = btrim(body) AND char_length(body) BETWEEN 1 AND 2000),
  CHECK (cardinality(mentioned_user_ids) <= 25),
  CHECK (parent_comment_id IS NULL OR (resolved_at IS NULL AND resolved_by_user_id IS NULL))
);

CREATE INDEX idx_work_lyric_block_comments_block_created
  ON public.work_lyric_block_comments (block_id, created_at);
CREATE INDEX idx_work_lyric_block_comments_parent_created
  ON public.work_lyric_block_comments (parent_comment_id, created_at)
  WHERE parent_comment_id IS NOT NULL;

ALTER TABLE public.work_lyric_block_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_lyric_block_comments_select
ON public.work_lyric_block_comments
FOR SELECT
TO authenticated
USING (
  public.is_work_owner(work_id, auth.uid())
  OR public.work_member_tier(work_id, auth.uid()) IS NOT NULL
);

REVOKE ALL ON TABLE public.work_lyric_block_comments FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, work_id, block_id, parent_comment_id, author_user_id, body,
  mentioned_user_ids, resolved_at, resolved_by_user_id, created_at
) ON public.work_lyric_block_comments TO authenticated;

COMMENT ON TABLE public.work_lyric_block_comments IS
  'Private Writer''s Room discussion attached to a lyric section. Comments and mentions are creative context only—not lyric edits, rights approval, splits, legal consent or delivery authorization.';

-- Fail closed even for a future service-role caller: a comment and its
-- parent must belong to the same song/section, replies are one level deep,
-- and every author/mention must be a current participant in the work.
CREATE OR REPLACE FUNCTION public.validate_work_lyric_block_comment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent public.work_lyric_block_comments%ROWTYPE;
  v_mentioned_user_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.lyric_blocks
    WHERE id = NEW.block_id AND work_id = NEW.work_id
  ) THEN
    RAISE EXCEPTION 'lyric_block_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NEW.author_user_id IS NULL OR NOT (
    public.is_work_owner(NEW.work_id, NEW.author_user_id)
    OR public.work_member_tier(NEW.work_id, NEW.author_user_id) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'comment_author_not_participant' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.parent_comment_id IS NOT NULL THEN
    SELECT * INTO v_parent
    FROM public.work_lyric_block_comments
    WHERE id = NEW.parent_comment_id;

    IF NOT FOUND
       OR v_parent.work_id <> NEW.work_id
       OR v_parent.block_id <> NEW.block_id
       OR v_parent.parent_comment_id IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_comment_parent' USING ERRCODE = 'P0001';
    END IF;

    IF v_parent.resolved_at IS NOT NULL THEN
      RAISE EXCEPTION 'comment_thread_resolved' USING ERRCODE = 'P0001';
    END IF;
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

CREATE TRIGGER trg_validate_work_lyric_block_comment
  BEFORE INSERT OR UPDATE OF work_id, block_id, parent_comment_id, author_user_id, mentioned_user_ids
  ON public.work_lyric_block_comments
  FOR EACH ROW EXECUTE FUNCTION public.validate_work_lyric_block_comment();

-- Clients cannot write the table directly. This function makes comment
-- creation one validated operation and keeps arbitrary author/mention ids
-- out of the API contract.
CREATE OR REPLACE FUNCTION public.create_work_lyric_block_comment(
  p_work_id UUID,
  p_block_id UUID,
  p_body TEXT,
  p_parent_comment_id UUID DEFAULT NULL,
  p_mentioned_user_ids UUID[] DEFAULT '{}'::UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID;
  v_comment public.work_lyric_block_comments%ROWTYPE;
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
    RAISE EXCEPTION 'invalid_comment_body' USING ERRCODE = '22023';
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

  INSERT INTO public.work_lyric_block_comments (
    work_id, block_id, parent_comment_id, author_user_id, body, mentioned_user_ids
  )
  VALUES (
    p_work_id, p_block_id, p_parent_comment_id, v_uid, btrim(p_body), v_mentions
  )
  RETURNING * INTO v_comment;

  RETURN to_jsonb(v_comment);
END;
$$;

-- A root-thread author may resolve their own discussion. The work owner or
-- an administer-tier collaborator may moderate any thread. Resolution is
-- reversible and never edits the comment body or lyric text.
CREATE OR REPLACE FUNCTION public.set_work_lyric_block_comment_resolution(
  p_work_id UUID,
  p_block_id UUID,
  p_comment_id UUID,
  p_resolved BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID;
  v_comment public.work_lyric_block_comments%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL OR NOT (
    public.is_work_owner(p_work_id, v_uid)
    OR public.work_member_tier(p_work_id, v_uid) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'work_access_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_resolved IS NULL THEN
    RAISE EXCEPTION 'invalid_comment_resolution' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_comment
  FROM public.work_lyric_block_comments
  WHERE id = p_comment_id
    AND work_id = p_work_id
    AND block_id = p_block_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'comment_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_comment.parent_comment_id IS NOT NULL THEN
    RAISE EXCEPTION 'comment_reply_not_resolvable' USING ERRCODE = 'P0001';
  END IF;
  IF v_comment.author_user_id IS DISTINCT FROM v_uid
     AND NOT public.is_work_owner(p_work_id, v_uid)
     AND public.work_member_tier(p_work_id, v_uid) IS DISTINCT FROM 'administer' THEN
    RAISE EXCEPTION 'comment_resolution_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.work_lyric_block_comments
  SET resolved_at = CASE WHEN p_resolved THEN COALESCE(resolved_at, now()) ELSE NULL END,
      resolved_by_user_id = CASE WHEN p_resolved THEN COALESCE(resolved_by_user_id, v_uid) ELSE NULL END
  WHERE id = p_comment_id
  RETURNING * INTO v_comment;

  RETURN to_jsonb(v_comment);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_work_lyric_block_comment(uuid, uuid, text, uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_work_lyric_block_comment(uuid, uuid, text, uuid, uuid[])
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_work_lyric_block_comment_resolution(uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_work_lyric_block_comment_resolution(uuid, uuid, uuid, boolean)
  TO authenticated;

-- Extend the private song diary with a trigger-sourced comment kind. Only a
-- new root thread and resolve/reopen transitions enter the diary; replies
-- stay inside the thread so creative discussion does not flood the ledger.
ALTER TABLE public.work_diary_events
  DROP CONSTRAINT IF EXISTS work_diary_events_kind_check;
ALTER TABLE public.work_diary_events
  ADD CONSTRAINT work_diary_events_kind_check CHECK (kind IN (
    'version', 'lyric_edit', 'roster', 'sheet', 'ai_entry',
    'rename', 'reorder', 'detach', 'note', 'comment'
  ));

CREATE OR REPLACE FUNCTION public.capture_work_lyric_comment_opened()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_block public.lyric_blocks%ROWTYPE;
BEGIN
  IF NEW.parent_comment_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_block FROM public.lyric_blocks WHERE id = NEW.block_id;
  INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)
  VALUES (
    NEW.work_id,
    'comment',
    NEW.author_user_id,
    jsonb_build_object(
      'commentId', NEW.id,
      'blockId', NEW.block_id,
      'blockType', v_block.block_type,
      'customLabel', v_block.custom_label,
      'operation', 'opened'
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_capture_work_lyric_comment_opened
  AFTER INSERT ON public.work_lyric_block_comments
  FOR EACH ROW EXECUTE FUNCTION public.capture_work_lyric_comment_opened();

CREATE OR REPLACE FUNCTION public.capture_work_lyric_comment_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_block public.lyric_blocks%ROWTYPE;
BEGIN
  IF NEW.resolved_at IS NOT DISTINCT FROM OLD.resolved_at THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_block FROM public.lyric_blocks WHERE id = NEW.block_id;
  INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)
  VALUES (
    NEW.work_id,
    'comment',
    auth.uid(),
    jsonb_build_object(
      'commentId', NEW.id,
      'blockId', NEW.block_id,
      'blockType', v_block.block_type,
      'customLabel', v_block.custom_label,
      'operation', CASE WHEN NEW.resolved_at IS NULL THEN 'reopened' ELSE 'resolved' END
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_capture_work_lyric_comment_resolution
  AFTER UPDATE OF resolved_at ON public.work_lyric_block_comments
  FOR EACH ROW EXECUTE FUNCTION public.capture_work_lyric_comment_resolution();

NOTIFY pgrst, 'reload schema';
