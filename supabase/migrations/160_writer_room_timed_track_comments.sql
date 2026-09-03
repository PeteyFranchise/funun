-- 160_writer_room_timed_track_comments.sql
-- Version-scoped mix notes for the Writer's Room. These comments are
-- creative discussion only: they do not alter audio, credits, rights,
-- splits, approvals, or delivery state.

CREATE TABLE public.work_version_comments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id                  UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  version_id               UUID NOT NULL REFERENCES public.work_versions(id) ON DELETE CASCADE,
  parent_comment_id        UUID REFERENCES public.work_version_comments(id) ON DELETE CASCADE,
  author_user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body                     TEXT NOT NULL,
  timestamp_ms             INTEGER NOT NULL,
  mentioned_user_ids       UUID[] NOT NULL DEFAULT '{}'::UUID[],
  resolved_at              TIMESTAMPTZ,
  resolved_by_user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  carried_from_version_id  UUID REFERENCES public.work_versions(id) ON DELETE SET NULL,
  carried_from_comment_id  UUID REFERENCES public.work_version_comments(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (body = btrim(body) AND char_length(body) BETWEEN 1 AND 2000),
  CHECK (timestamp_ms BETWEEN 0 AND 86400000),
  CHECK (cardinality(mentioned_user_ids) <= 25),
  CHECK (parent_comment_id IS NULL OR (resolved_at IS NULL AND resolved_by_user_id IS NULL)),
  CHECK ((carried_from_version_id IS NULL) = (carried_from_comment_id IS NULL))
);

CREATE INDEX idx_work_version_comments_version_time
  ON public.work_version_comments (version_id, timestamp_ms, created_at);
CREATE INDEX idx_work_version_comments_parent_created
  ON public.work_version_comments (parent_comment_id, created_at)
  WHERE parent_comment_id IS NOT NULL;
CREATE UNIQUE INDEX idx_work_version_comments_carry_once
  ON public.work_version_comments (version_id, carried_from_comment_id)
  WHERE carried_from_comment_id IS NOT NULL;

CREATE TABLE public.work_version_comment_carry_reviews (
  target_version_id UUID PRIMARY KEY REFERENCES public.work_versions(id) ON DELETE CASCADE,
  work_id           UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  source_version_id UUID NOT NULL REFERENCES public.work_versions(id) ON DELETE CASCADE,
  reviewed_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (target_version_id <> source_version_id)
);

ALTER TABLE public.work_version_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_version_comment_carry_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_version_comments_select
ON public.work_version_comments
FOR SELECT TO authenticated
USING (
  public.is_work_owner(work_id, auth.uid())
  OR public.work_member_tier(work_id, auth.uid()) IS NOT NULL
);

CREATE POLICY work_version_comment_carry_reviews_select
ON public.work_version_comment_carry_reviews
FOR SELECT TO authenticated
USING (
  public.is_work_owner(work_id, auth.uid())
  OR public.work_member_tier(work_id, auth.uid()) IS NOT NULL
);

REVOKE ALL ON TABLE public.work_version_comments FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, work_id, version_id, parent_comment_id, author_user_id, body,
  timestamp_ms, mentioned_user_ids, resolved_at, resolved_by_user_id,
  carried_from_version_id, carried_from_comment_id, created_at
) ON public.work_version_comments TO authenticated;

REVOKE ALL ON TABLE public.work_version_comment_carry_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT (target_version_id, work_id, source_version_id, reviewed_by, created_at)
  ON public.work_version_comment_carry_reviews TO authenticated;

COMMENT ON TABLE public.work_version_comments IS
  'Private Writer''s Room discussion anchored to an exact recording version and millisecond. Creative context only—not an audio edit, right, split, approval, or delivery instruction.';
COMMENT ON TABLE public.work_version_comment_carry_reviews IS
  'Records the explicit carry-forward choice for a new recording version, including an empty Start fresh choice. Notes are never moved automatically.';

CREATE OR REPLACE FUNCTION public.validate_work_version_comment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_version public.work_versions%ROWTYPE;
  v_parent public.work_version_comments%ROWTYPE;
  v_source public.work_version_comments%ROWTYPE;
  v_mentioned_user_id UUID;
BEGIN
  SELECT * INTO v_version
  FROM public.work_versions
  WHERE id = NEW.version_id AND work_id = NEW.work_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'work_version_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_version.duration_seconds IS NOT NULL
     AND NEW.timestamp_ms > ceil(v_version.duration_seconds * 1000)::INTEGER THEN
    RAISE EXCEPTION 'comment_timestamp_out_of_range' USING ERRCODE = '22023';
  END IF;

  IF NEW.carried_from_comment_id IS NULL THEN
    IF NEW.author_user_id IS NULL OR NOT (
      public.is_work_owner(NEW.work_id, NEW.author_user_id)
      OR public.work_member_tier(NEW.work_id, NEW.author_user_id) IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'comment_author_not_participant' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    SELECT * INTO v_source
    FROM public.work_version_comments
    WHERE id = NEW.carried_from_comment_id
      AND work_id = NEW.work_id
      AND version_id = NEW.carried_from_version_id
      AND parent_comment_id IS NULL;
    IF NOT FOUND OR NEW.author_user_id IS DISTINCT FROM v_source.author_user_id THEN
      RAISE EXCEPTION 'invalid_carried_comment' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.parent_comment_id IS NOT NULL THEN
    SELECT * INTO v_parent
    FROM public.work_version_comments
    WHERE id = NEW.parent_comment_id;
    IF NOT FOUND
       OR v_parent.work_id <> NEW.work_id
       OR v_parent.version_id <> NEW.version_id
       OR v_parent.parent_comment_id IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_comment_parent' USING ERRCODE = 'P0001';
    END IF;
    IF v_parent.resolved_at IS NOT NULL THEN
      RAISE EXCEPTION 'comment_thread_resolved' USING ERRCODE = 'P0001';
    END IF;
    NEW.timestamp_ms := v_parent.timestamp_ms;
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

CREATE TRIGGER trg_validate_work_version_comment
  BEFORE INSERT OR UPDATE OF work_id, version_id, parent_comment_id,
    author_user_id, timestamp_ms, mentioned_user_ids,
    carried_from_version_id, carried_from_comment_id
  ON public.work_version_comments
  FOR EACH ROW EXECUTE FUNCTION public.validate_work_version_comment();

CREATE OR REPLACE FUNCTION public.create_work_version_comment(
  p_work_id UUID,
  p_version_id UUID,
  p_body TEXT,
  p_timestamp_ms INTEGER,
  p_parent_comment_id UUID DEFAULT NULL,
  p_mentioned_user_ids UUID[] DEFAULT '{}'::UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID;
  v_comment public.work_version_comments%ROWTYPE;
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
  IF p_timestamp_ms IS NULL OR p_timestamp_ms NOT BETWEEN 0 AND 86400000 THEN
    RAISE EXCEPTION 'invalid_comment_timestamp' USING ERRCODE = '22023';
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

  INSERT INTO public.work_version_comments (
    work_id, version_id, parent_comment_id, author_user_id, body,
    timestamp_ms, mentioned_user_ids
  ) VALUES (
    p_work_id, p_version_id, p_parent_comment_id, v_uid, btrim(p_body),
    p_timestamp_ms, v_mentions
  ) RETURNING * INTO v_comment;

  RETURN to_jsonb(v_comment);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_work_version_comment_resolution(
  p_work_id UUID,
  p_version_id UUID,
  p_comment_id UUID,
  p_resolved BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID;
  v_comment public.work_version_comments%ROWTYPE;
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
  FROM public.work_version_comments
  WHERE id = p_comment_id AND work_id = p_work_id AND version_id = p_version_id
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

  UPDATE public.work_version_comments
  SET resolved_at = CASE WHEN p_resolved THEN COALESCE(resolved_at, now()) ELSE NULL END,
      resolved_by_user_id = CASE WHEN p_resolved THEN COALESCE(resolved_by_user_id, v_uid) ELSE NULL END
  WHERE id = p_comment_id
  RETURNING * INTO v_comment;

  RETURN to_jsonb(v_comment);
END;
$$;

CREATE OR REPLACE FUNCTION public.review_work_version_comment_carry(
  p_work_id UUID,
  p_target_version_id UUID,
  p_source_comment_ids UUID[] DEFAULT '{}'::UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID;
  v_target public.work_versions%ROWTYPE;
  v_source_version_id UUID;
  v_ids UUID[];
  v_requested_count INTEGER;
  v_valid_count INTEGER;
  v_copied JSONB;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL OR NOT (
    public.is_work_owner(p_work_id, v_uid)
    OR public.work_member_tier(p_work_id, v_uid) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'work_access_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_target
  FROM public.work_versions
  WHERE id = p_target_version_id AND work_id = p_work_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'work_version_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_source_version_id
  FROM public.work_versions
  WHERE work_id = p_work_id
    AND (created_at, id) < (v_target.created_at, v_target.id)
  ORDER BY created_at DESC, id DESC
  LIMIT 1;
  IF v_source_version_id IS NULL THEN
    RAISE EXCEPTION 'previous_work_version_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_ids := ARRAY(
    SELECT DISTINCT comment_id
    FROM unnest(COALESCE(p_source_comment_ids, '{}'::UUID[])) AS comment_id
    WHERE comment_id IS NOT NULL
    ORDER BY comment_id
  );
  v_requested_count := cardinality(v_ids);
  IF v_requested_count > 100 THEN
    RAISE EXCEPTION 'too_many_comments_to_carry' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_valid_count
  FROM public.work_version_comments
  WHERE id = ANY(v_ids)
    AND work_id = p_work_id
    AND version_id = v_source_version_id
    AND parent_comment_id IS NULL
    AND resolved_at IS NULL;
  IF v_valid_count <> v_requested_count THEN
    RAISE EXCEPTION 'invalid_comments_to_carry' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.work_version_comment_carry_reviews (
    target_version_id, work_id, source_version_id, reviewed_by
  ) VALUES (
    p_target_version_id, p_work_id, v_source_version_id, v_uid
  );

  WITH inserted AS (
    INSERT INTO public.work_version_comments (
      work_id, version_id, author_user_id, body, timestamp_ms,
      mentioned_user_ids, carried_from_version_id, carried_from_comment_id
    )
    SELECT
      source.work_id,
      p_target_version_id,
      source.author_user_id,
      source.body,
      LEAST(
        source.timestamp_ms,
        COALESCE(ceil(v_target.duration_seconds * 1000)::INTEGER, source.timestamp_ms)
      ),
      ARRAY(
        SELECT mentioned_id
        FROM unnest(source.mentioned_user_ids) AS mentioned_id
        WHERE public.is_work_owner(p_work_id, mentioned_id)
           OR public.work_member_tier(p_work_id, mentioned_id) IS NOT NULL
      ),
      v_source_version_id,
      source.id
    FROM public.work_version_comments AS source
    WHERE source.id = ANY(v_ids)
    RETURNING *
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(inserted)), '[]'::JSONB)
  INTO v_copied
  FROM inserted;

  RETURN jsonb_build_object(
    'sourceVersionId', v_source_version_id,
    'targetVersionId', p_target_version_id,
    'copied', v_copied
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_work_version_comment(uuid, uuid, text, integer, uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_work_version_comment(uuid, uuid, text, integer, uuid, uuid[])
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_work_version_comment_resolution(uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_work_version_comment_resolution(uuid, uuid, uuid, boolean)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.review_work_version_comment_carry(uuid, uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_work_version_comment_carry(uuid, uuid, uuid[])
  TO authenticated;

NOTIFY pgrst, 'reload schema';
