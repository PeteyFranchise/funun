-- 165_writer_room_take_workflow_handoff.sql
-- A working take is a reversible creative pointer, never a master or approval.
-- Producer handoffs are immutable records that bind one rendered rough take to
-- one zero-aligned dry vocal file and a current claimed room participant.

ALTER TABLE public.works
  ADD COLUMN working_version_id UUID REFERENCES public.work_versions(id) ON DELETE SET NULL;

CREATE INDEX idx_works_working_version
  ON public.works (working_version_id)
  WHERE working_version_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_work_working_version()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.working_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.work_versions version
    WHERE version.id = NEW.working_version_id
      AND version.work_id = NEW.id
      AND version.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'working_take_must_be_an_active_version_of_this_work' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_work_working_version() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_validate_work_working_version
  BEFORE INSERT OR UPDATE OF working_version_id ON public.works
  FOR EACH ROW EXECUTE FUNCTION public.validate_work_working_version();

CREATE OR REPLACE FUNCTION public.clear_archived_working_version()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
    UPDATE public.works
    SET working_version_id = NULL
    WHERE id = NEW.work_id AND working_version_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_archived_working_version() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_clear_archived_working_version
  AFTER UPDATE OF archived_at ON public.work_versions
  FOR EACH ROW EXECUTE FUNCTION public.clear_archived_working_version();

CREATE TABLE public.work_recording_handoffs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id           UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  session_id        UUID NOT NULL REFERENCES public.work_recording_sessions(id) ON DELETE CASCADE,
  rough_version_id  UUID NOT NULL REFERENCES public.work_versions(id) ON DELETE CASCADE,
  created_by        UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  vocal_path        TEXT NOT NULL UNIQUE,
  vocal_size        BIGINT NOT NULL CHECK (vocal_size > 0 AND vocal_size <= 52428800),
  note              TEXT CHECK (note IS NULL OR char_length(note) <= 1000),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rough_version_id)
);

CREATE INDEX idx_work_recording_handoffs_work
  ON public.work_recording_handoffs (work_id, created_at DESC);

ALTER TABLE public.work_recording_handoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_recording_handoffs_select ON public.work_recording_handoffs
FOR SELECT TO authenticated USING (
  (SELECT public.is_work_owner(work_id, auth.uid()))
  OR (SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL
);

REVOKE ALL ON public.work_recording_handoffs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.work_recording_handoffs TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_work_recording_handoff()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.work_recording_sessions session
    WHERE session.id = NEW.session_id
      AND session.work_id = NEW.work_id
      AND session.created_by = NEW.created_by
      AND session.rendered_version_id = NEW.rough_version_id
      AND session.status = 'saved'
  ) THEN
    RAISE EXCEPTION 'handoff_session_does_not_match_saved_rough' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.work_versions version
    WHERE version.id = NEW.rough_version_id
      AND version.work_id = NEW.work_id
      AND version.source = 'recording'
      AND version.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'handoff_rough_must_be_an_active_recording_of_this_work' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.recipient_user_id IS NULL OR NEW.recipient_user_id = NEW.created_by OR NOT (
    public.is_work_owner(NEW.work_id, NEW.recipient_user_id)
    OR public.work_member_tier(NEW.work_id, NEW.recipient_user_id) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'handoff_recipient_must_be_another_claimed_room_member' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_work_recording_handoff() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_validate_work_recording_handoff
  BEFORE INSERT ON public.work_recording_handoffs
  FOR EACH ROW EXECUTE FUNCTION public.validate_work_recording_handoff();

ALTER TABLE public.work_diary_events
  DROP CONSTRAINT IF EXISTS work_diary_events_kind_check;
ALTER TABLE public.work_diary_events
  ADD CONSTRAINT work_diary_events_kind_check CHECK (kind IN (
    'version', 'lyric_edit', 'roster', 'sheet', 'ai_entry',
    'rename', 'reorder', 'detach', 'note', 'comment', 'producer_handoff'
  ));

CREATE OR REPLACE FUNCTION public.capture_work_recording_handoff()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.work_diary_events (work_id, kind, actor_user_id, payload)
  VALUES (
    NEW.work_id,
    'producer_handoff',
    NEW.created_by,
    jsonb_strip_nulls(jsonb_build_object(
      'handoffId', NEW.id,
      'roughVersionId', NEW.rough_version_id,
      'recipientUserId', NEW.recipient_user_id,
      'note', NEW.note
    ))
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.capture_work_recording_handoff() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_capture_work_recording_handoff
  AFTER INSERT ON public.work_recording_handoffs
  FOR EACH ROW EXECUTE FUNCTION public.capture_work_recording_handoff();

COMMENT ON COLUMN public.works.working_version_id IS
  'Shared creative preference for the take the room is currently developing. Not a master, approval, rights, split, metadata or release fact.';
COMMENT ON TABLE public.work_recording_handoffs IS
  'Immutable private handoffs pairing one saved rough vocal take with a zero-aligned dry vocal stem and a current claimed room recipient.';

NOTIFY pgrst, 'reload schema';
