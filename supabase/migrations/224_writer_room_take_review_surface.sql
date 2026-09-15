-- 224_writer_room_take_review_surface.sql
-- Lays the take-review-surface foundation for the Writer's Room: a peaks
-- array on work_versions, a span plus reposition flag on
-- work_version_comments (extending migration 160's validated-RPC and
-- trigger discipline), and a dedicated work_version_pins table. This
-- migration adds creative-review context only and alters no authorship,
-- credits, splits, rights, approvals, delivery state, or membership.

-- ─── (1) Peaks on work_versions ──────────────────────────────────────────
-- work_versions has no column-level GRANT lockdown (migration 136 gates it
-- by RLS alone), so no GRANT is issued for this column.

ALTER TABLE public.work_versions ADD COLUMN peaks SMALLINT[];

-- The 0-100 range below is enforced in the database, not only in the client
-- helper: migration 136 gates work_versions by RLS alone, so any work member
-- can write this column directly. A CHECK cannot contain a subquery, so the
-- per-element test lives in an IMMUTABLE helper.
CREATE OR REPLACE FUNCTION public.work_version_peaks_in_range(p SMALLINT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p IS NULL OR NOT EXISTS (
    SELECT 1 FROM unnest(p) AS v WHERE v < 0 OR v > 100
  );
$$;

REVOKE EXECUTE ON FUNCTION public.work_version_peaks_in_range(SMALLINT[]) FROM PUBLIC, anon;

ALTER TABLE public.work_versions
  ADD CONSTRAINT work_versions_peaks_shape
  CHECK (peaks IS NULL OR (
    cardinality(peaks) = 200
    AND array_position(peaks, NULL) IS NULL
    AND public.work_version_peaks_in_range(peaks)
  ));

COMMENT ON COLUMN public.work_versions.peaks IS
  'Percent-height waveform bars (0-100), fixed cardinality 200, computed client-side at take creation. A NULL value means "not extracted yet -- the player backfills it," never "draw a placeholder shape."';

-- ─── (2) Span and reposition flag on work_version_comments ───────────────
-- A column not in the restated GRANT SELECT list below is invisible to the
-- API client, so the whole column list from migration 160 is restated here
-- with end_timestamp_ms and needs_reposition appended. The existing
-- work_version_comments_select policy is untouched and no second policy is
-- added to this table.

ALTER TABLE public.work_version_comments
  ADD COLUMN end_timestamp_ms INTEGER,
  ADD COLUMN needs_reposition BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT work_version_comments_end_after_start
    CHECK (end_timestamp_ms IS NULL OR end_timestamp_ms > timestamp_ms),
  ADD CONSTRAINT work_version_comments_end_range
    CHECK (end_timestamp_ms IS NULL OR end_timestamp_ms BETWEEN 1 AND 86400000);

GRANT SELECT (
  id, work_id, version_id, parent_comment_id, author_user_id, body,
  timestamp_ms, mentioned_user_ids, resolved_at, resolved_by_user_id,
  carried_from_version_id, carried_from_comment_id, created_at,
  end_timestamp_ms, needs_reposition
) ON public.work_version_comments TO authenticated;

-- ─── (3) validate_work_version_comment() gains the span guards ──────────
-- Same no-argument trigger signature and the same trigger binding as
-- migration 160; only the function body gains two new checks beside the
-- existing comment_timestamp_out_of_range check.

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

  IF NEW.end_timestamp_ms IS NOT NULL
     AND v_version.duration_seconds IS NOT NULL
     AND NEW.end_timestamp_ms > ceil(v_version.duration_seconds * 1000)::INTEGER THEN
    RAISE EXCEPTION 'comment_end_timestamp_out_of_range' USING ERRCODE = '22023';
  END IF;

  IF NEW.needs_reposition AND NEW.carried_from_comment_id IS NULL THEN
    RAISE EXCEPTION 'reposition_flag_requires_carry' USING ERRCODE = 'P0001';
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

-- ─── (4) create_work_version_comment gains a span parameter ─────────────
-- Adding a parameter to a Postgres function creates an overload rather than
-- replacing it, and PostgREST then cannot resolve a .rpc() call against an
-- ambiguous signature -- so the six-argument signature is dropped before the
-- seven-argument one is created.

DROP FUNCTION IF EXISTS public.create_work_version_comment(uuid, uuid, text, integer, uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.create_work_version_comment(
  p_work_id UUID,
  p_version_id UUID,
  p_body TEXT,
  p_timestamp_ms INTEGER,
  p_parent_comment_id UUID DEFAULT NULL,
  p_mentioned_user_ids UUID[] DEFAULT '{}'::UUID[],
  p_end_timestamp_ms INTEGER DEFAULT NULL
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
  IF p_end_timestamp_ms IS NOT NULL AND (
    p_end_timestamp_ms NOT BETWEEN 1 AND 86400000
    OR p_end_timestamp_ms <= p_timestamp_ms
  ) THEN
    RAISE EXCEPTION 'invalid_comment_end_timestamp' USING ERRCODE = '22023';
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
    timestamp_ms, mentioned_user_ids, end_timestamp_ms
  ) VALUES (
    p_work_id, p_version_id, p_parent_comment_id, v_uid, btrim(p_body),
    p_timestamp_ms, v_mentions, p_end_timestamp_ms
  ) RETURNING * INTO v_comment;

  RETURN to_jsonb(v_comment);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_work_version_comment(uuid, uuid, text, integer, uuid, uuid[], integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_work_version_comment(uuid, uuid, text, integer, uuid, uuid[], integer)
  TO authenticated;

-- ─── (5) review_work_version_comment_carry() clamps both endpoints together ───
-- Same three-argument signature as migration 160. A carried range comment's
-- start and end are computed once, together, via two CROSS JOIN LATERAL
-- derivations, so a span is always clamped -- never collapsed to a point and
-- never silently dropped (D-07). One millisecond of headroom is reserved on
-- the start so a clamped start never lands exactly on the bound and forces
-- an end of bound + 1, which the new trigger check would reject and which
-- would roll back every other comment in the same carry batch.

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
  v_bound INTEGER;
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

  -- NULL when the target take has no duration yet.
  v_bound := ceil(v_target.duration_seconds * 1000)::INTEGER;

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
      mentioned_user_ids, carried_from_version_id, carried_from_comment_id,
      end_timestamp_ms, needs_reposition
    )
    SELECT
      source.work_id,
      p_target_version_id,
      source.author_user_id,
      source.body,
      carried_start.start_ms,
      ARRAY(
        SELECT mentioned_id
        FROM unnest(source.mentioned_user_ids) AS mentioned_id
        WHERE public.is_work_owner(p_work_id, mentioned_id)
           OR public.work_member_tier(p_work_id, mentioned_id) IS NOT NULL
      ),
      v_source_version_id,
      source.id,
      carried_end.end_ms,
      (v_bound IS NOT NULL AND source.timestamp_ms > v_bound)
    FROM public.work_version_comments AS source
    CROSS JOIN LATERAL (
      SELECT LEAST(
        source.timestamp_ms,
        COALESCE(
          CASE
            WHEN source.end_timestamp_ms IS NULL THEN v_bound
            ELSE GREATEST(0, v_bound - 1)
          END,
          source.timestamp_ms
        )
      ) AS start_ms
    ) AS carried_start
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN source.end_timestamp_ms IS NULL THEN NULL
        ELSE GREATEST(
          carried_start.start_ms + 1,
          LEAST(COALESCE(v_bound, source.end_timestamp_ms), source.end_timestamp_ms)
        )
      END AS end_ms
    ) AS carried_end
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

REVOKE EXECUTE ON FUNCTION public.review_work_version_comment_carry(uuid, uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_work_version_comment_carry(uuid, uuid, uuid[])
  TO authenticated;

-- ─── (6) work_version_pins — a private, author-only bookmark ────────────
-- The entire access model is "you wrote it." Room membership is verified by
-- the API route at insert time, not by a second RLS policy here.

-- A composite FK needs a matching unique key on the referenced side.
-- work_versions.id is already the primary key, so this adds no new
-- uniqueness guarantee -- it only makes (id, work_id) referenceable.
ALTER TABLE public.work_versions
  ADD CONSTRAINT work_versions_id_work_id_key UNIQUE (id, work_id);

CREATE TABLE public.work_version_pins (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id        UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  version_id     UUID NOT NULL,
  author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp_ms   INTEGER NOT NULL CHECK (timestamp_ms BETWEEN 0 AND 86400000),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Composite, not two independent keys: a pin whose version belongs to some
  -- OTHER work is incoherent, and separate FKs to works(id) and
  -- work_versions(id) would each pass while permitting exactly that.
  CONSTRAINT work_version_pins_version_in_work
    FOREIGN KEY (version_id, work_id)
    REFERENCES public.work_versions (id, work_id) ON DELETE CASCADE
);

CREATE INDEX idx_work_version_pins_author_version_time
  ON public.work_version_pins (author_user_id, version_id, timestamp_ms);

ALTER TABLE public.work_version_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_version_pins_author_only ON public.work_version_pins
  FOR ALL TO authenticated
  USING (author_user_id = auth.uid())
  WITH CHECK (author_user_id = auth.uid());

REVOKE ALL ON TABLE public.work_version_pins FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, work_id, version_id, author_user_id, timestamp_ms, created_at)
  ON public.work_version_pins TO authenticated;
GRANT INSERT (work_id, version_id, author_user_id, timestamp_ms)
  ON public.work_version_pins TO authenticated;
GRANT DELETE ON public.work_version_pins TO authenticated;

COMMENT ON TABLE public.work_version_pins IS
  'A pin is a private, wordless bookmark visible to its author alone. It generates no notification, rides no realtime channel, and carries no body. Room membership is verified by the API route at insert time, not by a second RLS policy here.';

NOTIFY pgrst, 'reload schema';
