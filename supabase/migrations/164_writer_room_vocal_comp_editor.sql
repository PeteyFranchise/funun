-- 164_writer_room_vocal_comp_editor.sql
-- Non-destructive comp instructions for raw microphone clips. Moving,
-- trimming and muting affect playback/render only; audio objects are immutable.

ALTER TABLE public.work_recording_clips
  ADD COLUMN trim_start_ms INTEGER NOT NULL DEFAULT 0 CHECK (trim_start_ms >= 0),
  ADD COLUMN trim_end_ms INTEGER NOT NULL DEFAULT 0 CHECK (trim_end_ms >= 0),
  ADD CONSTRAINT work_recording_clip_trim_valid
    CHECK (trim_start_ms + trim_end_ms < duration_ms);

GRANT UPDATE (start_ms, trim_start_ms, trim_end_ms, muted, removed_at, removed_by)
  ON public.work_recording_clips TO authenticated;

COMMENT ON COLUMN public.work_recording_clips.trim_start_ms IS
  'Non-destructive milliseconds skipped from the raw clip beginning during comp playback/render.';
COMMENT ON COLUMN public.work_recording_clips.trim_end_ms IS
  'Non-destructive milliseconds skipped from the raw clip end during comp playback/render.';

NOTIFY pgrst, 'reload schema';
