-- 163_writer_room_recovery_take_management.sql
-- Workspace cleanup is non-destructive: completed takes are archived, never
-- erased from the creative evidence chain. Draft punch-ins may be removed
-- from the active comp while their row and object remain recoverable.

ALTER TABLE public.work_versions
  ADD COLUMN archived_at TIMESTAMPTZ,
  ADD COLUMN archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX idx_work_versions_active
  ON public.work_versions (work_id, created_at DESC)
  WHERE archived_at IS NULL;

ALTER TABLE public.work_recording_clips
  ADD COLUMN removed_at TIMESTAMPTZ,
  ADD COLUMN removed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE POLICY work_recording_clips_update ON public.work_recording_clips
FOR UPDATE TO authenticated USING (
  created_by = auth.uid() AND EXISTS (
    SELECT 1 FROM public.work_recording_sessions session
    WHERE session.id = session_id AND session.created_by = auth.uid()
  )
) WITH CHECK (
  created_by = auth.uid() AND EXISTS (
    SELECT 1 FROM public.work_recording_sessions session
    WHERE session.id = session_id AND session.created_by = auth.uid()
  )
);

GRANT UPDATE (muted, removed_at, removed_by)
  ON public.work_recording_clips TO authenticated;

COMMENT ON COLUMN public.work_versions.archived_at IS
  'Hides a completed take from the active Writer''s Room without deleting its audio, diary entry, comments, lineage, or Passport evidence.';
COMMENT ON COLUMN public.work_recording_clips.removed_at IS
  'Removes a raw punch-in from the active comp without destroying recoverable recording history.';

NOTIFY pgrst, 'reload schema';
