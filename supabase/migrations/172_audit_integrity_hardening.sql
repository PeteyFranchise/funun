-- Migration 172: security-audit integrity hardening
-- Fix-forward only. Migrations 169-171 may already exist in shared environments.

-- ─── Owner-only Writer's Room graduation linkage ─────────────────────

CREATE OR REPLACE FUNCTION public.guard_work_graduation_owner_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.graduated_project_id IS DISTINCT FROM OLD.graduated_project_id
     AND auth.uid() IS NOT NULL
     AND auth.uid() IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'only the work owner can change graduation linkage'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_work_graduation_owner_only()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_work_graduation_owner_only ON public.works;
CREATE TRIGGER guard_work_graduation_owner_only
  BEFORE UPDATE OF graduated_project_id ON public.works
  FOR EACH ROW EXECUTE FUNCTION public.guard_work_graduation_owner_only();

-- ─── Atomic split-sheet party replacement ────────────────────────────

CREATE OR REPLACE FUNCTION public.replace_split_sheet_parties_transactional(
  p_sheet_id UUID,
  p_parties JSONB,
  p_sheet_updates JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sheet public.split_sheets%ROWTYPE;
  v_party JSONB;
  v_collaborator_id UUID;
  v_total NUMERIC(9,3);
BEGIN
  IF jsonb_typeof(p_parties) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_sheet_updates) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_split_sheet_payload' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_sheet
  FROM public.split_sheets
  WHERE id = p_sheet_id
  FOR UPDATE;

  IF v_sheet.id IS NULL THEN
    RAISE EXCEPTION 'split_sheet_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(SUM((party ->> 'split_percentage')::NUMERIC), 0)
  INTO v_total
  FROM jsonb_array_elements(p_parties) AS party;

  IF jsonb_array_length(p_parties) > 0 AND v_total <> 100.000 THEN
    RAISE EXCEPTION 'split_percentages_must_total_100' USING ERRCODE = '22023';
  END IF;

  FOR v_party IN SELECT value FROM jsonb_array_elements(p_parties)
  LOOP
    IF NULLIF(BTRIM(v_party ->> 'name'), '') IS NULL THEN
      RAISE EXCEPTION 'split_party_name_required' USING ERRCODE = '22023';
    END IF;

    v_collaborator_id := NULLIF(v_party ->> 'collaborator_id', '')::UUID;
    IF v_collaborator_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.collaborators
      WHERE id = v_collaborator_id AND user_id = v_sheet.initiator_user_id
    ) THEN
      RAISE EXCEPTION 'split_party_collaborator_not_owned' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  DELETE FROM public.split_sheet_parties WHERE split_sheet_id = p_sheet_id;

  FOR v_party IN SELECT value FROM jsonb_array_elements(p_parties)
  LOOP
    v_collaborator_id := NULLIF(v_party ->> 'collaborator_id', '')::UUID;
    INSERT INTO public.split_sheet_parties (
      split_sheet_id,
      collaborator_id,
      user_id,
      name,
      email,
      pro,
      ipi,
      role,
      split_percentage,
      legal_name,
      publishing_designee,
      administrator,
      writer_designation
    ) VALUES (
      p_sheet_id,
      v_collaborator_id,
      COALESCE(
        NULLIF(v_party ->> 'user_id', '')::UUID,
        (SELECT claimed_by FROM public.collaborators WHERE id = v_collaborator_id)
      ),
      BTRIM(v_party ->> 'name'),
      NULLIF(BTRIM(v_party ->> 'email'), ''),
      NULLIF(BTRIM(v_party ->> 'pro'), ''),
      NULLIF(BTRIM(v_party ->> 'ipi'), ''),
      NULLIF(BTRIM(v_party ->> 'role'), ''),
      (v_party ->> 'split_percentage')::NUMERIC,
      NULLIF(BTRIM(v_party ->> 'legal_name'), ''),
      NULLIF(BTRIM(v_party ->> 'publishing_designee'), ''),
      NULLIF(BTRIM(v_party ->> 'administrator'), ''),
      NULLIF(BTRIM(v_party ->> 'writer_designation'), '')
    );
  END LOOP;

  UPDATE public.split_sheets
  SET song_name = CASE
        WHEN p_sheet_updates ? 'song_name' THEN NULLIF(BTRIM(p_sheet_updates ->> 'song_name'), '')
        ELSE song_name
      END,
      vault_project_id = CASE
        WHEN p_sheet_updates ? 'vault_project_id'
          THEN NULLIF(p_sheet_updates ->> 'vault_project_id', '')::UUID
        ELSE vault_project_id
      END,
      artist_name = CASE
        WHEN p_sheet_updates ? 'artist_name' THEN NULLIF(BTRIM(p_sheet_updates ->> 'artist_name'), '')
        ELSE artist_name
      END,
      album_project_title = CASE
        WHEN p_sheet_updates ? 'album_project_title'
          THEN NULLIF(BTRIM(p_sheet_updates ->> 'album_project_title'), '')
        ELSE album_project_title
      END,
      record_label = CASE
        WHEN p_sheet_updates ? 'record_label' THEN NULLIF(BTRIM(p_sheet_updates ->> 'record_label'), '')
        ELSE record_label
      END,
      status = CASE
        WHEN p_sheet_updates ? 'status' THEN p_sheet_updates ->> 'status'
        ELSE status
      END,
      last_change_summary = CASE
        WHEN p_sheet_updates ? 'last_change_summary' THEN p_sheet_updates -> 'last_change_summary'
        ELSE last_change_summary
      END
  WHERE id = p_sheet_id
  RETURNING * INTO v_sheet;

  RETURN to_jsonb(v_sheet);
END;
$$;

REVOKE ALL ON FUNCTION public.replace_split_sheet_parties_transactional(UUID, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_split_sheet_parties_transactional(UUID, JSONB, JSONB)
  TO service_role;

CREATE OR REPLACE FUNCTION public.add_work_member_transactional(
  p_work_id UUID,
  p_user_id UUID,
  p_collaborator_id UUID,
  p_tier TEXT,
  p_added_by UUID,
  p_sheet_id UUID DEFAULT NULL,
  p_parties JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member public.work_members%ROWTYPE;
BEGIN
  IF p_tier NOT IN ('contribute', 'administer') THEN
    RAISE EXCEPTION 'invalid_work_member_tier' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.work_members (work_id, user_id, collaborator_id, tier, added_by)
  VALUES (p_work_id, p_user_id, p_collaborator_id, p_tier, p_added_by)
  RETURNING * INTO v_member;

  IF p_sheet_id IS NOT NULL THEN
    IF p_parties IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.split_sheets
      WHERE id = p_sheet_id
        AND work_id = p_work_id
        AND status IN ('draft', 'countered')
    ) THEN
      RAISE EXCEPTION 'living_split_sheet_not_found' USING ERRCODE = 'P0002';
    END IF;

    PERFORM public.replace_split_sheet_parties_transactional(
      p_sheet_id,
      p_parties,
      '{}'::JSONB
    );
  END IF;

  RETURN to_jsonb(v_member);
END;
$$;

REVOKE ALL ON FUNCTION public.add_work_member_transactional(UUID, UUID, UUID, TEXT, UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_work_member_transactional(UUID, UUID, UUID, TEXT, UUID, UUID, JSONB)
  TO service_role;

-- ─── Durable blanket-agreement completion claims ─────────────────────

ALTER TABLE public.vault_documents
  ADD COLUMN IF NOT EXISTS esign_completion_claim_token UUID,
  ADD COLUMN IF NOT EXISTS esign_completion_claimed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.claim_blanket_agreement_completion(
  p_document_id UUID,
  p_submission_id TEXT,
  p_claim_token UUID,
  p_lease_seconds INTEGER DEFAULT 900
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_document_id IS NULL OR p_claim_token IS NULL
     OR NULLIF(BTRIM(p_submission_id), '') IS NULL
     OR p_lease_seconds < 60 OR p_lease_seconds > 1800 THEN
    RAISE EXCEPTION 'invalid_blanket_completion_claim' USING ERRCODE = '22023';
  END IF;

  UPDATE public.vault_documents
  SET esign_completion_claim_token = p_claim_token,
      esign_completion_claimed_at = now()
  WHERE id = p_document_id
    AND type = 'blanket_agreement'
    AND status <> 'signed'
    AND document_data #>> '{esign,requestId}' = p_submission_id
    AND (
      esign_completion_claim_token IS NULL
      OR esign_completion_claimed_at < now() - make_interval(secs => p_lease_seconds)
    );

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_blanket_agreement_completion(
  p_document_id UUID,
  p_claim_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.vault_documents
  SET esign_completion_claim_token = NULL,
      esign_completion_claimed_at = NULL
  WHERE id = p_document_id
    AND esign_completion_claim_token = p_claim_token;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_blanket_agreement_completion(
  p_document_id UUID,
  p_claim_token UUID,
  p_completed_at TIMESTAMPTZ,
  p_document_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_advanced INTEGER := 0;
BEGIN
  UPDATE public.vault_documents
  SET status = 'signed',
      signed_at = p_completed_at,
      document_data = p_document_data,
      esign_completion_claim_token = NULL,
      esign_completion_claimed_at = NULL
  WHERE id = p_document_id
    AND type = 'blanket_agreement'
    AND status <> 'signed'
    AND esign_completion_claim_token = p_claim_token
  RETURNING user_id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('completed', FALSE, 'advanced', 0);
  END IF;

  WITH advanced AS (
    UPDATE public.sync_listings
    SET status = 'pending_admit',
        blanket_agreement_document_id = p_document_id,
        updated_at = now()
    WHERE artist_user_id = v_user_id
      AND status IN ('applied', 'invited', 'agreement_pending')
    RETURNING id
  )
  SELECT count(*)::INTEGER INTO v_advanced FROM advanced;

  RETURN jsonb_build_object('completed', TRUE, 'advanced', v_advanced);
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_blanket_agreement_listings(p_document_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_advanced INTEGER := 0;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.vault_documents
  WHERE id = p_document_id AND type = 'blanket_agreement' AND status = 'signed';

  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH advanced AS (
    UPDATE public.sync_listings
    SET status = 'pending_admit',
        blanket_agreement_document_id = p_document_id,
        updated_at = now()
    WHERE artist_user_id = v_user_id
      AND status IN ('applied', 'invited', 'agreement_pending')
    RETURNING id
  )
  SELECT count(*)::INTEGER INTO v_advanced FROM advanced;

  RETURN v_advanced;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_blanket_agreement_completion(UUID, TEXT, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_blanket_agreement_completion(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_blanket_agreement_completion(UUID, UUID, TIMESTAMPTZ, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_blanket_agreement_listings(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_blanket_agreement_completion(UUID, TEXT, UUID, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_blanket_agreement_completion(UUID, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_blanket_agreement_completion(UUID, UUID, TIMESTAMPTZ, JSONB)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_blanket_agreement_listings(UUID)
  TO service_role;

-- ─── Atomic Ideas writes and preserved recording provenance ──────────

ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS branch_request_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ideas_branch_request
  ON public.ideas (user_id, parent_idea_id, branch_request_id)
  WHERE parent_idea_id IS NOT NULL AND branch_request_id IS NOT NULL;

DELETE FROM public.idea_markers duplicate
USING public.idea_markers keeper
WHERE duplicate.recording_id = keeper.recording_id
  AND duplicate.timestamp_ms = keeper.timestamp_ms
  AND COALESCE(duplicate.label, '') = COALESCE(keeper.label, '')
  AND duplicate.id > keeper.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_idea_markers_recording_moment_label
  ON public.idea_markers (recording_id, timestamp_ms, COALESCE(label, ''));

CREATE OR REPLACE FUNCTION public.complete_idea_recording_transactional(
  p_idea_id UUID,
  p_recording_id UUID,
  p_actor UUID,
  p_parent_recording_id UUID,
  p_audio_path TEXT,
  p_audio_ext TEXT,
  p_audio_size BIGINT,
  p_duration_seconds INTEGER,
  p_label TEXT,
  p_kind TEXT,
  p_markers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.idea_recordings%ROWTYPE;
  v_marker JSONB;
  v_created BOOLEAN := FALSE;
BEGIN
  IF jsonb_typeof(p_markers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_idea_markers' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ideas WHERE id = p_idea_id AND user_id = p_actor
    UNION ALL
    SELECT 1 FROM public.idea_members
    WHERE idea_id = p_idea_id AND user_id = p_actor AND permission = 'contribute'
  ) THEN
    RAISE EXCEPTION 'idea_contribution_not_allowed' USING ERRCODE = '42501';
  END IF;

  IF p_parent_recording_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.idea_recordings
    WHERE id = p_parent_recording_id AND idea_id = p_idea_id
  ) THEN
    RAISE EXCEPTION 'idea_parent_recording_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- An absent row cannot be locked with SELECT ... FOR UPDATE. Serialize on
  -- the client-generated recording id so simultaneous completion retries do
  -- not race into a unique-key failure before marker reconciliation.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('idea-recording:' || p_recording_id::TEXT, 0)
  );

  SELECT * INTO v_existing
  FROM public.idea_recordings
  WHERE id = p_recording_id
  FOR UPDATE;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.idea_recordings (
      id, idea_id, created_by, parent_recording_id, audio_path, audio_ext,
      audio_size, duration_seconds, label, kind
    ) VALUES (
      p_recording_id, p_idea_id, p_actor, p_parent_recording_id, p_audio_path,
      p_audio_ext, p_audio_size, p_duration_seconds, NULLIF(BTRIM(p_label), ''), p_kind
    ) RETURNING * INTO v_existing;
    v_created := TRUE;
  ELSIF v_existing.idea_id <> p_idea_id OR v_existing.audio_path <> p_audio_path THEN
    RAISE EXCEPTION 'idea_recording_id_conflict' USING ERRCODE = '23505';
  END IF;

  FOR v_marker IN SELECT value FROM jsonb_array_elements(p_markers)
  LOOP
    INSERT INTO public.idea_markers (
      idea_id, recording_id, created_by, timestamp_ms, label
    ) VALUES (
      p_idea_id,
      p_recording_id,
      p_actor,
      (v_marker ->> 'timestampMs')::INTEGER,
      NULLIF(BTRIM(v_marker ->> 'label'), '')
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('id', v_existing.id, 'created', v_created);
END;
$$;

CREATE OR REPLACE FUNCTION public.branch_idea_transactional(
  p_idea_id UUID,
  p_actor UUID,
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source public.ideas%ROWTYPE;
  v_branch_id UUID;
  v_recording public.idea_recordings%ROWTYPE;
  v_new_recording_id UUID;
BEGIN
  SELECT id INTO v_branch_id
  FROM public.ideas
  WHERE user_id = p_actor
    AND parent_idea_id = p_idea_id
    AND branch_request_id = p_request_id;
  IF v_branch_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_branch_id, 'created', FALSE);
  END IF;

  SELECT * INTO v_source
  FROM public.ideas
  WHERE id = p_idea_id AND user_id = p_actor
  FOR UPDATE;
  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'idea_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- A concurrent request can have created the branch while this transaction
  -- waited on the source-row lock. Recheck after acquiring that lock.
  SELECT id INTO v_branch_id
  FROM public.ideas
  WHERE user_id = p_actor
    AND parent_idea_id = p_idea_id
    AND branch_request_id = p_request_id;
  IF v_branch_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_branch_id, 'created', FALSE);
  END IF;

  INSERT INTO public.ideas (
    user_id, title, note, transcript, moods, parent_idea_id, branch_request_id
  ) VALUES (
    p_actor,
    LEFT(v_source.title || ' · branch', 200),
    v_source.note,
    v_source.transcript,
    v_source.moods,
    p_idea_id,
    p_request_id
  ) RETURNING id INTO v_branch_id;

  FOR v_recording IN
    SELECT * FROM public.idea_recordings
    WHERE idea_id = p_idea_id AND archived_at IS NULL
    ORDER BY captured_at, id
  LOOP
    v_new_recording_id := gen_random_uuid();
    INSERT INTO public.idea_recordings (
      id, idea_id, created_by, parent_recording_id, audio_path, audio_ext,
      audio_size, duration_seconds, label, kind, rating, captured_at
    ) VALUES (
      v_new_recording_id,
      v_branch_id,
      v_recording.created_by,
      v_recording.id,
      v_recording.audio_path,
      v_recording.audio_ext,
      v_recording.audio_size,
      v_recording.duration_seconds,
      v_recording.label,
      v_recording.kind,
      v_recording.rating,
      v_recording.captured_at
    );

    INSERT INTO public.idea_markers (
      idea_id, recording_id, created_by, timestamp_ms, label, created_at
    )
    SELECT v_branch_id, v_new_recording_id, created_by, timestamp_ms, label, created_at
    FROM public.idea_markers
    WHERE recording_id = v_recording.id;
  END LOOP;

  RETURN jsonb_build_object('id', v_branch_id, 'created', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_idea_to_collection_transactional(
  p_idea_id UUID,
  p_actor UUID,
  p_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_collection public.idea_collections%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ideas WHERE id = p_idea_id AND user_id = p_actor) THEN
    RAISE EXCEPTION 'idea_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.idea_collections (user_id, name)
  VALUES (p_actor, BTRIM(p_name))
  ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING * INTO v_collection;

  INSERT INTO public.idea_collection_items (collection_id, idea_id)
  VALUES (v_collection.id, p_idea_id)
  ON CONFLICT (collection_id, idea_id) DO NOTHING;

  RETURN jsonb_build_object('id', v_collection.id, 'name', v_collection.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_idea_from_collection_transactional(
  p_idea_id UUID,
  p_actor UUID,
  p_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_collection_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ideas WHERE id = p_idea_id AND user_id = p_actor) THEN
    RAISE EXCEPTION 'idea_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_collection_id
  FROM public.idea_collections
  WHERE user_id = p_actor AND name = BTRIM(p_name);

  IF v_collection_id IS NULL THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.idea_collection_items
  WHERE collection_id = v_collection_id AND idea_id = p_idea_id;
  RETURN FOUND;
END;
$$;

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
    AND recording.archived_at IS NULL
  FOR UPDATE;
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
    new_version_id,
    p_work_id,
    COALESCE(recording_row.created_by, p_actor),
    'hum',
    recording_row.audio_path,
    recording_row.audio_ext,
    recording_row.audio_size,
    recording_row.duration_seconds,
    COALESCE(recording_row.label, idea_row.title),
    '[]'::JSONB
  );

  INSERT INTO public.idea_work_version_links (idea_id, recording_id, work_id, version_id)
  VALUES (p_idea_id, p_recording_id, p_work_id, new_version_id);

  RETURN QUERY SELECT new_version_id, TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_idea_recording_transactional(
  UUID, UUID, UUID, UUID, TEXT, TEXT, BIGINT, INTEGER, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.branch_idea_transactional(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_idea_to_collection_transactional(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_idea_from_collection_transactional(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_idea_recording_to_work(UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_idea_recording_transactional(
  UUID, UUID, UUID, UUID, TEXT, TEXT, BIGINT, INTEGER, TEXT, TEXT, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION public.branch_idea_transactional(UUID, UUID, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.add_idea_to_collection_transactional(UUID, UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_idea_from_collection_transactional(UUID, UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.add_idea_recording_to_work(UUID, UUID, UUID, UUID)
  TO service_role;

NOTIFY pgrst, 'reload schema';
