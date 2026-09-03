-- 162_writer_room_record_over_beat.sql
-- Non-destructive punch-in sessions. The backing version never changes;
-- each microphone interval is retained as a raw clip and the audible result
-- is saved as a new work_version with source='recording'. These rows are
-- creative evidence only and never infer writing shares or recording rights.

ALTER TABLE public.work_versions DROP CONSTRAINT work_versions_source_check;
ALTER TABLE public.work_versions
  ADD CONSTRAINT work_versions_source_check
  CHECK (source IN ('hum', 'upload', 'recording'));

CREATE TABLE public.work_recording_sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id              UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  base_version_id      UUID NOT NULL REFERENCES public.work_versions(id) ON DELETE RESTRICT,
  created_by           UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  rendered_version_id  UUID REFERENCES public.work_versions(id) ON DELETE SET NULL,
  status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'saved')),
  beat_gain             NUMERIC(4,3) NOT NULL DEFAULT 0.85 CHECK (beat_gain BETWEEN 0 AND 1.5),
  vocal_gain            NUMERIC(4,3) NOT NULL DEFAULT 1 CHECK (vocal_gain BETWEEN 0 AND 1.5),
  timing_offset_ms      INTEGER NOT NULL DEFAULT 0 CHECK (timing_offset_ms BETWEEN -2000 AND 2000),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.work_recording_clips (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES public.work_recording_sessions(id) ON DELETE CASCADE,
  created_by        UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  audio_path        TEXT NOT NULL UNIQUE,
  audio_ext         TEXT NOT NULL,
  audio_size        BIGINT NOT NULL CHECK (audio_size > 0),
  start_ms          INTEGER NOT NULL CHECK (start_ms BETWEEN 0 AND 86400000),
  duration_ms       INTEGER NOT NULL CHECK (duration_ms BETWEEN 1 AND 86400000),
  position          INTEGER NOT NULL CHECK (position >= 0),
  muted             BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, position)
);

CREATE INDEX idx_work_recording_sessions_work
  ON public.work_recording_sessions (work_id, created_at DESC);
CREATE INDEX idx_work_recording_clips_session
  ON public.work_recording_clips (session_id, position);

ALTER TABLE public.work_recording_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_recording_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_recording_sessions_select ON public.work_recording_sessions
FOR SELECT TO authenticated USING (
  public.is_work_owner(work_id, auth.uid())
  OR public.work_member_tier(work_id, auth.uid()) IS NOT NULL
);

CREATE POLICY work_recording_sessions_insert ON public.work_recording_sessions
FOR INSERT TO authenticated WITH CHECK (
  created_by = auth.uid() AND (
    public.is_work_owner(work_id, auth.uid())
    OR public.work_member_tier(work_id, auth.uid()) IS NOT NULL
  )
);

CREATE POLICY work_recording_sessions_update ON public.work_recording_sessions
FOR UPDATE TO authenticated USING (
  created_by = auth.uid() OR public.is_work_owner(work_id, auth.uid())
) WITH CHECK (
  created_by = auth.uid() OR public.is_work_owner(work_id, auth.uid())
);

CREATE POLICY work_recording_clips_select ON public.work_recording_clips
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.work_recording_sessions session
    WHERE session.id = session_id AND (
      public.is_work_owner(session.work_id, auth.uid())
      OR public.work_member_tier(session.work_id, auth.uid()) IS NOT NULL
    )
  )
);

CREATE POLICY work_recording_clips_insert ON public.work_recording_clips
FOR INSERT TO authenticated WITH CHECK (
  created_by = auth.uid() AND EXISTS (
    SELECT 1 FROM public.work_recording_sessions session
    WHERE session.id = session_id
      AND session.created_by = auth.uid()
      AND session.status = 'draft'
  )
);

REVOKE ALL ON public.work_recording_sessions, public.work_recording_clips FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.work_recording_sessions, public.work_recording_clips TO authenticated;
GRANT INSERT (work_id, base_version_id, created_by)
  ON public.work_recording_sessions TO authenticated;
GRANT UPDATE (rendered_version_id, status, beat_gain, vocal_gain, timing_offset_ms, updated_at)
  ON public.work_recording_sessions TO authenticated;
GRANT INSERT (id, session_id, created_by, audio_path, audio_ext, audio_size, start_ms, duration_ms, position, muted)
  ON public.work_recording_clips TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_work_recording_session()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.work_versions
    WHERE id = NEW.base_version_id AND work_id = NEW.work_id
  ) THEN
    RAISE EXCEPTION 'recording_base_version_not_in_work' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.rendered_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.work_versions
    WHERE id = NEW.rendered_version_id AND work_id = NEW.work_id
  ) THEN
    RAISE EXCEPTION 'recording_rendered_version_not_in_work' USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_work_recording_session
BEFORE INSERT OR UPDATE ON public.work_recording_sessions
FOR EACH ROW EXECUTE FUNCTION public.validate_work_recording_session();

COMMENT ON TABLE public.work_recording_sessions IS
  'Editable Writer''s Room punch-in session linked to one immutable backing version. No rights, split, approval, or ownership inference.';
COMMENT ON TABLE public.work_recording_clips IS
  'Raw microphone clips positioned on a recording-session timeline and retained after the rough mix is rendered.';
