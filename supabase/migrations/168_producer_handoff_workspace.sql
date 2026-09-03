-- 168_producer_handoff_workspace.sql
-- Optional production context around immutable handoffs. These facts help a
-- room collaborate; none are approvals, masters, rights, splits or deadlines.

ALTER TABLE public.work_recording_handoffs
  ADD COLUMN round_label TEXT,
  ADD COLUMN bpm SMALLINT,
  ADD COLUMN musical_key TEXT,
  ADD COLUMN reference_url TEXT,
  ADD COLUMN feedback_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT work_recording_handoffs_round_label_check
    CHECK (round_label IS NULL OR char_length(round_label) <= 80),
  ADD CONSTRAINT work_recording_handoffs_bpm_check
    CHECK (bpm IS NULL OR bpm BETWEEN 20 AND 300),
  ADD CONSTRAINT work_recording_handoffs_musical_key_check
    CHECK (musical_key IS NULL OR char_length(musical_key) <= 24),
  ADD CONSTRAINT work_recording_handoffs_reference_url_check
    CHECK (reference_url IS NULL OR (
      char_length(reference_url) <= 500
      AND reference_url ~* '^https?://'
    )),
  ADD CONSTRAINT work_recording_handoffs_feedback_snapshot_check
    CHECK (
      jsonb_typeof(feedback_snapshot) = 'array'
      AND jsonb_array_length(feedback_snapshot) <= 25
    );

ALTER TABLE public.work_recording_handoff_returns
  ADD COLUMN round_label TEXT,
  ADD COLUMN feedback_responses JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT work_recording_handoff_returns_round_label_check
    CHECK (round_label IS NULL OR char_length(round_label) <= 80),
  ADD CONSTRAINT work_recording_handoff_returns_feedback_responses_check
    CHECK (
      jsonb_typeof(feedback_responses) = 'array'
      AND jsonb_array_length(feedback_responses) <= 25
    );

CREATE TABLE public.work_recording_handoff_progress (
  handoff_id      UUID PRIMARY KEY REFERENCES public.work_recording_handoffs(id) ON DELETE CASCADE,
  work_id         UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  producer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  working_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.work_recording_handoff_nudges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handoff_id  UUID NOT NULL REFERENCES public.work_recording_handoffs(id) ON DELETE CASCADE,
  work_id     UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  sent_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_to     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_work_recording_handoff_nudges_latest
  ON public.work_recording_handoff_nudges (handoff_id, created_at DESC);

CREATE INDEX idx_work_recording_handoff_progress_work
  ON public.work_recording_handoff_progress (work_id, working_at DESC);

CREATE INDEX idx_work_recording_handoff_nudges_work
  ON public.work_recording_handoff_nudges (work_id, created_at DESC);

CREATE TABLE public.work_recording_handoff_activity (
  handoff_id   UUID NOT NULL REFERENCES public.work_recording_handoffs(id) ON DELETE CASCADE,
  work_id      UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('listened', 'compared')),
  version_id   UUID REFERENCES public.work_versions(id) ON DELETE SET NULL,
  last_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (handoff_id, actor_user_id, kind)
);

CREATE INDEX idx_work_recording_handoff_activity_work
  ON public.work_recording_handoff_activity (work_id, last_at DESC);

ALTER TABLE public.work_recording_handoff_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_recording_handoff_nudges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_recording_handoff_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_recording_handoff_progress_select
ON public.work_recording_handoff_progress FOR SELECT TO authenticated USING (
  (SELECT public.is_work_owner(work_id, auth.uid()))
  OR (SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL
);

CREATE POLICY work_recording_handoff_nudges_select
ON public.work_recording_handoff_nudges FOR SELECT TO authenticated USING (
  (SELECT public.is_work_owner(work_id, auth.uid()))
  OR (SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL
);

CREATE POLICY work_recording_handoff_activity_select
ON public.work_recording_handoff_activity FOR SELECT TO authenticated USING (
  (SELECT public.is_work_owner(work_id, auth.uid()))
  OR (SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL
);

REVOKE ALL ON public.work_recording_handoff_progress FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.work_recording_handoff_nudges FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.work_recording_handoff_activity FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.work_recording_handoff_progress TO authenticated;
GRANT SELECT ON public.work_recording_handoff_nudges TO authenticated;
GRANT SELECT ON public.work_recording_handoff_activity TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_producer_handoff_working(
  p_handoff_id UUID,
  p_producer UUID
)
RETURNS TABLE(handoff_id UUID, working_at TIMESTAMPTZ, inserted BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  handoff_row public.work_recording_handoffs%ROWTYPE;
  progress_row public.work_recording_handoff_progress%ROWTYPE;
  was_inserted BOOLEAN := FALSE;
BEGIN
  SELECT * INTO handoff_row
  FROM public.work_recording_handoffs
  WHERE id = p_handoff_id
  FOR UPDATE;

  IF handoff_row.id IS NULL
    OR p_producer IS NULL
    OR handoff_row.recipient_user_id IS DISTINCT FROM p_producer
    OR NOT (
      public.is_work_owner(handoff_row.work_id, p_producer)
      OR public.work_member_tier(handoff_row.work_id, p_producer) IS NOT NULL
    ) THEN
    RAISE EXCEPTION 'handoff_progress_requires_current_recipient' USING ERRCODE = 'P0001';
  END IF;

  -- Starting the work necessarily means the recipient received it. Keep the
  -- existing one-time receipt as the canonical Received milestone while this
  -- table adds the optional Working on it context.
  INSERT INTO public.work_recording_handoff_receipts (
    handoff_id, work_id, recipient_user_id
  ) VALUES (
    handoff_row.id, handoff_row.work_id, p_producer
  )
  ON CONFLICT (handoff_id) DO NOTHING;

  INSERT INTO public.work_recording_handoff_progress (
    handoff_id, work_id, producer_user_id
  ) VALUES (
    handoff_row.id, handoff_row.work_id, p_producer
  )
  ON CONFLICT (handoff_id) DO NOTHING
  RETURNING * INTO progress_row;

  IF progress_row.handoff_id IS NOT NULL THEN
    was_inserted := TRUE;
  ELSE
    SELECT * INTO progress_row
    FROM public.work_recording_handoff_progress progress
    WHERE progress.handoff_id = p_handoff_id;
  END IF;

  RETURN QUERY SELECT progress_row.handoff_id, progress_row.working_at, was_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.nudge_producer_handoff(
  p_handoff_id UUID,
  p_sender UUID
)
RETURNS TABLE(nudge_id UUID, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  handoff_row public.work_recording_handoffs%ROWTYPE;
  new_nudge public.work_recording_handoff_nudges%ROWTYPE;
BEGIN
  SELECT * INTO handoff_row
  FROM public.work_recording_handoffs
  WHERE id = p_handoff_id
  FOR UPDATE;

  IF handoff_row.id IS NULL
    OR p_sender IS NULL
    OR handoff_row.created_by <> p_sender
    OR handoff_row.recipient_user_id IS NULL
    OR NOT (
      public.is_work_owner(handoff_row.work_id, p_sender)
      OR public.work_member_tier(handoff_row.work_id, p_sender) IS NOT NULL
    ) THEN
    RAISE EXCEPTION 'handoff_nudge_requires_current_sender' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.work_recording_handoff_returns returned
    WHERE returned.handoff_id = handoff_row.id
  ) THEN
    RAISE EXCEPTION 'returned_handoff_does_not_need_a_nudge' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.work_recording_handoff_nudges nudge
    WHERE nudge.handoff_id = handoff_row.id
      AND nudge.created_at > now() - INTERVAL '24 hours'
  ) THEN
    RAISE EXCEPTION 'handoff_nudge_cooldown_active' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.work_recording_handoff_nudges (
    handoff_id, work_id, sent_by, sent_to
  ) VALUES (
    handoff_row.id, handoff_row.work_id, p_sender, handoff_row.recipient_user_id
  )
  RETURNING * INTO new_nudge;

  RETURN QUERY SELECT new_nudge.id, new_nudge.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_producer_handoff_activity(
  p_handoff_id UUID,
  p_actor UUID,
  p_kind TEXT,
  p_version_id UUID DEFAULT NULL
)
RETURNS TABLE(handoff_id UUID, kind TEXT, last_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  handoff_row public.work_recording_handoffs%ROWTYPE;
  activity_row public.work_recording_handoff_activity%ROWTYPE;
BEGIN
  SELECT * INTO handoff_row
  FROM public.work_recording_handoffs
  WHERE id = p_handoff_id;

  IF handoff_row.id IS NULL
    OR p_actor IS NULL
    OR p_kind NOT IN ('listened', 'compared')
    OR NOT (
      public.is_work_owner(handoff_row.work_id, p_actor)
      OR public.work_member_tier(handoff_row.work_id, p_actor) IS NOT NULL
    ) THEN
    RAISE EXCEPTION 'handoff_activity_requires_current_room_access' USING ERRCODE = 'P0001';
  END IF;

  IF p_version_id IS NOT NULL AND NOT (
    p_version_id = handoff_row.rough_version_id
    OR EXISTS (
      SELECT 1 FROM public.work_recording_handoff_returns returned
      WHERE returned.handoff_id = handoff_row.id
        AND returned.version_id = p_version_id
    )
  ) THEN
    RAISE EXCEPTION 'handoff_activity_version_mismatch' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.work_recording_handoff_activity (
    handoff_id, work_id, actor_user_id, kind, version_id, last_at
  ) VALUES (
    handoff_row.id, handoff_row.work_id, p_actor, p_kind, p_version_id, now()
  )
  ON CONFLICT (handoff_id, actor_user_id, kind) DO UPDATE SET
    version_id = EXCLUDED.version_id,
    last_at = EXCLUDED.last_at
  RETURNING * INTO activity_row;

  RETURN QUERY SELECT activity_row.handoff_id, activity_row.kind, activity_row.last_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_producer_handoff_working(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nudge_producer_handoff(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_producer_handoff_activity(UUID, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_producer_handoff_working(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.nudge_producer_handoff(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_producer_handoff_activity(UUID, UUID, TEXT, UUID) TO service_role;

COMMENT ON COLUMN public.work_recording_handoffs.feedback_snapshot IS
  'Optional immutable snapshot of selected timed production notes. Never a required checklist or approval record.';
COMMENT ON COLUMN public.work_recording_handoff_returns.feedback_responses IS
  'Optional producer context for selected notes: done, tried or discuss. No response is required to return audio.';
COMMENT ON TABLE public.work_recording_handoff_progress IS
  'Optional one-time recipient signal that production work has started. No deadline or obligation.';
COMMENT ON TABLE public.work_recording_handoff_nudges IS
  'Private sender-to-recipient reminders with an atomic 24-hour cooldown.';
COMMENT ON TABLE public.work_recording_handoff_activity IS
  'Latest-only room-private listening/comparison context. No counts, history feed or diary events.';

NOTIFY pgrst, 'reload schema';
