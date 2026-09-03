-- 167_returned_mix_review.sql
-- Optional room-level review of a producer return. A decision records only
-- creative preference; it never approves, rejects, archives or masters audio.

CREATE TABLE public.work_recording_handoff_return_reviews (
  return_id    UUID PRIMARY KEY REFERENCES public.work_recording_handoff_returns(id) ON DELETE CASCADE,
  work_id      UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  reviewed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome      TEXT NOT NULL CHECK (outcome IN ('made_working', 'kept_current')),
  reviewed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_handoff_return_reviews_work
  ON public.work_recording_handoff_return_reviews (work_id, reviewed_at DESC);

ALTER TABLE public.work_recording_handoff_return_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_recording_handoff_return_reviews_select
ON public.work_recording_handoff_return_reviews
FOR SELECT TO authenticated USING (
  (SELECT public.is_work_owner(work_id, auth.uid()))
  OR (SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL
);

REVOKE ALL ON public.work_recording_handoff_return_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.work_recording_handoff_return_reviews TO authenticated;

CREATE OR REPLACE FUNCTION public.review_producer_mix_return(
  p_return_id UUID,
  p_reviewer UUID,
  p_outcome TEXT
)
RETURNS TABLE(return_id UUID, outcome TEXT, reviewed_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  returned public.work_recording_handoff_returns%ROWTYPE;
  saved public.work_recording_handoff_return_reviews%ROWTYPE;
BEGIN
  IF p_reviewer IS NULL OR p_outcome NOT IN ('made_working', 'kept_current') THEN
    RAISE EXCEPTION 'invalid_producer_mix_review' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO returned
  FROM public.work_recording_handoff_returns
  WHERE id = p_return_id;

  IF returned.id IS NULL OR NOT (
    public.is_work_owner(returned.work_id, p_reviewer)
    OR public.work_member_tier(returned.work_id, p_reviewer) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'producer_mix_review_requires_current_room_access' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.work_versions version
    WHERE version.id = returned.version_id
      AND version.work_id = returned.work_id
      AND version.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'producer_mix_review_requires_an_active_returned_take' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.work_recording_handoff_return_reviews (
    return_id, work_id, reviewed_by, outcome
  ) VALUES (
    returned.id, returned.work_id, p_reviewer, p_outcome
  )
  ON CONFLICT (return_id) DO NOTHING
  RETURNING * INTO saved;

  IF saved.return_id IS NULL THEN
    RETURN QUERY
      SELECT review.return_id, review.outcome, review.reviewed_at
      FROM public.work_recording_handoff_return_reviews review
      WHERE review.return_id = p_return_id;
    RETURN;
  END IF;

  IF p_outcome = 'made_working' THEN
    UPDATE public.works
    SET working_version_id = returned.version_id
    WHERE id = returned.work_id;
  END IF;

  RETURN QUERY SELECT saved.return_id, saved.outcome, saved.reviewed_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_producer_mix_return(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_producer_mix_return(UUID, UUID, TEXT)
  TO service_role;

ALTER TABLE public.work_diary_events
  DROP CONSTRAINT IF EXISTS work_diary_events_kind_check;
ALTER TABLE public.work_diary_events
  ADD CONSTRAINT work_diary_events_kind_check CHECK (kind IN (
    'version', 'lyric_edit', 'roster', 'sheet', 'ai_entry',
    'rename', 'reorder', 'detach', 'note', 'comment', 'producer_handoff',
    'producer_handoff_received', 'producer_mix_returned', 'producer_mix_reviewed'
  ));

CREATE OR REPLACE FUNCTION public.capture_producer_mix_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  returned_version_id UUID;
BEGIN
  SELECT version_id INTO returned_version_id
  FROM public.work_recording_handoff_returns
  WHERE id = NEW.return_id;

  INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)
  VALUES (
    NEW.work_id,
    'producer_mix_reviewed',
    NEW.reviewed_by,
    jsonb_build_object(
      'returnId', NEW.return_id,
      'versionId', returned_version_id,
      'outcome', NEW.outcome
    )
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.capture_producer_mix_review() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_capture_producer_mix_review
  AFTER INSERT ON public.work_recording_handoff_return_reviews
  FOR EACH ROW EXECUTE FUNCTION public.capture_producer_mix_review();

COMMENT ON TABLE public.work_recording_handoff_return_reviews IS
  'Optional immutable creative review outcomes for producer-returned takes. No outcome is a master, approval, rejection, split or rights fact.';

NOTIFY pgrst, 'reload schema';
