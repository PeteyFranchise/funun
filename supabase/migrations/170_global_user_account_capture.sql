-- 170_global_user_account_capture.sql
-- Structural User Account boundary for Ideas plus an atomic bridge from one
-- durable Idea recording into an accessible Writer's Room. Global Capture is
-- intentionally unavailable to Team Members, buyers, client partners, and
-- authenticated identities without a public.user_profiles row.

ALTER TABLE public.ideas
  ADD CONSTRAINT ideas_user_account_fk
  FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.idea_members
  ADD CONSTRAINT idea_members_user_account_fk
  FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT idea_members_adder_user_account_fk
  FOREIGN KEY (added_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.idea_share_links
  ADD CONSTRAINT idea_share_links_creator_user_account_fk
  FOREIGN KEY (created_by) REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT idea_share_links_claim_user_account_fk
  FOREIGN KEY (claimed_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.idea_recordings
  ADD CONSTRAINT idea_recordings_creator_user_account_fk
  FOREIGN KEY (created_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.idea_markers
  ADD CONSTRAINT idea_markers_creator_user_account_fk
  FOREIGN KEY (created_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.idea_comments
  ADD CONSTRAINT idea_comments_author_user_account_fk
  FOREIGN KEY (author_user_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.idea_references
  ADD CONSTRAINT idea_references_creator_user_account_fk
  FOREIGN KEY (created_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.idea_collections
  ADD CONSTRAINT idea_collections_user_account_fk
  FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.add_idea_recording_to_work(
  p_idea_id UUID,
  p_recording_id UUID,
  p_work_id UUID,
  p_actor UUID
)
RETURNS TABLE(version_id UUID, created BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  idea_row public.ideas%ROWTYPE;
  recording_row public.idea_recordings%ROWTYPE;
  existing_version_id UUID;
  new_version_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles profile WHERE profile.id = p_actor) THEN
    RAISE EXCEPTION 'global_capture_requires_user_account' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO idea_row FROM public.ideas idea
  WHERE idea.id = p_idea_id AND idea.user_id = p_actor;
  IF idea_row.id IS NULL THEN
    RAISE EXCEPTION 'idea_recording_not_owned' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    public.is_work_owner(p_work_id, p_actor)
    OR public.work_member_tier(p_work_id, p_actor) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'writer_room_not_accessible' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO recording_row FROM public.idea_recordings recording
  WHERE recording.id = p_recording_id
    AND recording.idea_id = p_idea_id
    AND recording.archived_at IS NULL;
  IF recording_row.id IS NULL THEN
    RAISE EXCEPTION 'idea_recording_not_available' USING ERRCODE = 'P0001';
  END IF;

  SELECT link.version_id INTO existing_version_id
  FROM public.idea_work_version_links link
  WHERE link.idea_id = p_idea_id
    AND link.recording_id = p_recording_id
    AND link.work_id = p_work_id;
  IF existing_version_id IS NOT NULL THEN
    RETURN QUERY SELECT existing_version_id, FALSE;
    RETURN;
  END IF;

  new_version_id := gen_random_uuid();
  INSERT INTO public.work_versions (
    id, work_id, user_id, source, audio_path, audio_ext, audio_size,
    duration_seconds, label, performers
  ) VALUES (
    new_version_id, p_work_id, p_actor, 'hum', recording_row.audio_path,
    recording_row.audio_ext, recording_row.audio_size,
    recording_row.duration_seconds, COALESCE(recording_row.label, idea_row.title),
    '[]'::jsonb
  );

  INSERT INTO public.idea_work_version_links (idea_id, recording_id, work_id, version_id)
  VALUES (p_idea_id, p_recording_id, p_work_id, new_version_id);

  RETURN QUERY SELECT new_version_id, TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_idea_recording_to_work(UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_idea_recording_to_work(UUID, UUID, UUID, UUID)
  TO service_role;

COMMENT ON FUNCTION public.add_idea_recording_to_work(UUID, UUID, UUID, UUID) IS
  'Service-only, idempotent bridge from one owner-captured Idea recording to an accessible Writer''s Room. Preserves audio and provenance; assigns no splits or rights.';
COMMENT ON TABLE public.idea_work_version_links IS
  'Immutable provenance from an Idea recording to a Writer''s Room take, whether carried by full promotion or Global Quick Capture.';

NOTIFY pgrst, 'reload schema';
