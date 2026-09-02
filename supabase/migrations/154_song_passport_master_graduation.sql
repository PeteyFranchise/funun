-- ============================================================
-- Funūn — Phase 37.3 Song Passport, Slice 5
-- Migration 154: recording lineage, master designation and graduation
-- HUMAN-GATED; additive to applied migrations 150–153.
-- ============================================================

CREATE TABLE public.song_passport_recording_lineage (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id       UUID NOT NULL REFERENCES public.song_passports(id) ON DELETE CASCADE,
  child_version_id  UUID NOT NULL REFERENCES public.work_versions(id) ON DELETE RESTRICT,
  parent_version_id UUID NOT NULL REFERENCES public.work_versions(id) ON DELETE RESTRICT,
  relationship      TEXT NOT NULL CHECK (relationship IN ('derived_from', 'mix_of', 'edit_of', 'mastered_from')),
  note              TEXT,
  created_by        UUID NOT NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (passport_id, child_version_id, parent_version_id, relationship),
  CHECK (child_version_id <> parent_version_id)
);

CREATE TABLE public.song_passport_master_designations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id               UUID NOT NULL REFERENCES public.song_passports(id) ON DELETE CASCADE,
  work_version_id           UUID NOT NULL REFERENCES public.work_versions(id) ON DELETE RESTRICT,
  approval_snapshot_id      UUID NOT NULL,
  supersedes_designation_id UUID,
  designation_note          TEXT,
  designated_by             UUID NOT NULL REFERENCES auth.users(id),
  designated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, passport_id),
  CONSTRAINT song_passport_master_snapshot_fk
    FOREIGN KEY (approval_snapshot_id, passport_id)
    REFERENCES public.song_passport_snapshots(id, passport_id) ON DELETE RESTRICT,
  CONSTRAINT song_passport_master_supersedes_fk
    FOREIGN KEY (supersedes_designation_id, passport_id)
    REFERENCES public.song_passport_master_designations(id, passport_id) ON DELETE RESTRICT
);

CREATE INDEX idx_song_passport_master_history
  ON public.song_passport_master_designations (passport_id, designated_at DESC);

CREATE TABLE public.song_passport_release_links (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id           UUID NOT NULL REFERENCES public.song_passports(id) ON DELETE CASCADE,
  master_designation_id UUID NOT NULL,
  approval_snapshot_id  UUID NOT NULL,
  vault_project_id      UUID NOT NULL REFERENCES public.vault_projects(id) ON DELETE RESTRICT,
  track_id              UUID NOT NULL REFERENCES public.tracks(id) ON DELETE RESTRICT,
  mapping               JSONB NOT NULL DEFAULT '{}',
  created_by            UUID NOT NULL REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (passport_id, master_designation_id),
  UNIQUE (passport_id, vault_project_id, track_id),
  CONSTRAINT song_passport_release_master_fk
    FOREIGN KEY (master_designation_id, passport_id)
    REFERENCES public.song_passport_master_designations(id, passport_id) ON DELETE RESTRICT,
  CONSTRAINT song_passport_release_snapshot_fk
    FOREIGN KEY (approval_snapshot_id, passport_id)
    REFERENCES public.song_passport_snapshots(id, passport_id) ON DELETE RESTRICT
);

-- Append-only lineage, master and graduation facts.
CREATE TRIGGER reject_song_passport_recording_lineage_mutation
  BEFORE UPDATE OR DELETE ON public.song_passport_recording_lineage
  FOR EACH ROW EXECUTE FUNCTION public.reject_song_passport_ledger_mutation();
CREATE TRIGGER reject_song_passport_master_designations_mutation
  BEFORE UPDATE OR DELETE ON public.song_passport_master_designations
  FOR EACH ROW EXECUTE FUNCTION public.reject_song_passport_ledger_mutation();
CREATE TRIGGER reject_song_passport_release_links_mutation
  BEFORE UPDATE OR DELETE ON public.song_passport_release_links
  FOR EACH ROW EXECUTE FUNCTION public.reject_song_passport_ledger_mutation();

ALTER TABLE public.song_passport_recording_lineage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_passport_master_designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_passport_release_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Passport readers view recording lineage"
  ON public.song_passport_recording_lineage FOR SELECT TO authenticated
  USING (public.can_read_song_passport(passport_id, auth.uid()));
CREATE POLICY "Passport readers view master history"
  ON public.song_passport_master_designations FOR SELECT TO authenticated
  USING (public.can_read_song_passport(passport_id, auth.uid()));
CREATE POLICY "Passport readers view release links"
  ON public.song_passport_release_links FOR SELECT TO authenticated
  USING (public.can_read_song_passport(passport_id, auth.uid()));

REVOKE ALL ON public.song_passport_recording_lineage FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.song_passport_master_designations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.song_passport_release_links FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.designate_song_passport_master(
  p_passport_id UUID,
  p_work_version_id UUID,
  p_approval_snapshot_id UUID,
  p_actor_user_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_work_id UUID;
  v_prior_id UUID;
  v_designation_id UUID;
  v_head_id UUID;
  v_value_id UUID;
  v_authorized BOOLEAN;
BEGIN
  SELECT passport.work_id INTO v_work_id FROM public.song_passports passport WHERE passport.id = p_passport_id;
  IF v_work_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.work_versions version
    WHERE version.id = p_work_version_id AND version.work_id = v_work_id
  ) THEN
    RAISE EXCEPTION 'The selected recording does not belong to this song' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.song_passport_snapshots snapshot
    WHERE snapshot.id = p_approval_snapshot_id
      AND snapshot.passport_id = p_passport_id
      AND snapshot.purpose = 'approval'
  ) THEN
    RAISE EXCEPTION 'An approved Passport snapshot is required before master selection' USING ERRCODE = '23514';
  END IF;

  SELECT (
    EXISTS (
      SELECT 1 FROM public.works work
      WHERE work.id = v_work_id AND work.user_id = p_actor_user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.song_passport_grants grant_row
      WHERE grant_row.passport_id = p_passport_id
        AND grant_row.grantee_user_id = p_actor_user_id
        AND grant_row.permission = 'select_master'
        AND grant_row.revoked_at IS NULL
        AND (grant_row.expires_at IS NULL OR grant_row.expires_at > NOW())
    )
  ) INTO v_authorized;
  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Master selection authority is required' USING ERRCODE = '42501';
  END IF;

  SELECT designation.id INTO v_prior_id
  FROM public.song_passport_master_designations designation
  WHERE designation.passport_id = p_passport_id
  ORDER BY designation.designated_at DESC, designation.id DESC
  LIMIT 1 FOR UPDATE;

  INSERT INTO public.song_passport_master_designations (
    passport_id, work_version_id, approval_snapshot_id,
    supersedes_designation_id, designation_note, designated_by
  ) VALUES (
    p_passport_id, p_work_version_id, p_approval_snapshot_id,
    v_prior_id, p_note, p_actor_user_id
  ) RETURNING id INTO v_designation_id;

  SELECT head.current_value_id INTO v_head_id
  FROM public.song_passport_field_heads head
  WHERE head.passport_id = p_passport_id
    AND head.layer = 'recording_version'
    AND head.field_key = 'master_designation'
    AND head.target_key = 'version:' || p_work_version_id::TEXT
  FOR UPDATE;

  INSERT INTO public.song_passport_values (
    passport_id, layer, field_key, target_key, work_version_id,
    value_jsonb, state, visibility, source_kind, source_record_id,
    source_revision, created_by, approved_by, approved_at,
    locked_at, lock_reason, supersedes_value_id
  ) VALUES (
    p_passport_id, 'recording_version', 'master_designation',
    'version:' || p_work_version_id::TEXT, p_work_version_id,
    jsonb_build_object('designationId', v_designation_id, 'label', 'Final master'),
    'locked', 'collaborators', 'system', v_designation_id,
    'master-designation', p_actor_user_id, p_actor_user_id, NOW(), NOW(),
    'Exact recording selected against approved Passport snapshot', v_head_id
  ) RETURNING id INTO v_value_id;

  INSERT INTO public.song_passport_field_heads (
    passport_id, layer, field_key, target_key, current_value_id, updated_by
  ) VALUES (
    p_passport_id, 'recording_version', 'master_designation',
    'version:' || p_work_version_id::TEXT, v_value_id, p_actor_user_id
  ) ON CONFLICT (passport_id, layer, field_key, target_key)
    DO UPDATE SET current_value_id = EXCLUDED.current_value_id, updated_by = EXCLUDED.updated_by;

  RETURN v_designation_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.designate_song_passport_master(UUID, UUID, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.designate_song_passport_master(UUID, UUID, UUID, UUID, TEXT)
  TO service_role;

-- One explicit graduation transaction creates the Release Report and track,
-- maps approved data, links the exact master and records what moved. It never
-- overwrites an existing release: repeat calls return the existing link.
CREATE OR REPLACE FUNCTION public.graduate_song_passport_to_release(
  p_passport_id UUID,
  p_master_designation_id UUID,
  p_actor_user_id UUID,
  p_release_title TEXT
)
RETURNS TABLE(vault_project_id UUID, track_id UUID, created BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_work public.works%ROWTYPE;
  v_master public.song_passport_master_designations%ROWTYPE;
  v_version public.work_versions%ROWTYPE;
  v_project_id UUID;
  v_track_id UUID;
  v_title TEXT;
  v_release_date DATE;
  v_label TEXT;
  v_upc TEXT;
  v_isrc TEXT;
  v_lyrics TEXT;
BEGIN
  SELECT work.* INTO v_work
  FROM public.works work
  JOIN public.song_passports passport ON passport.work_id = work.id
  WHERE passport.id = p_passport_id
  FOR UPDATE OF work;
  IF v_work.id IS NULL OR v_work.user_id <> p_actor_user_id THEN
    RAISE EXCEPTION 'Only the song owner may create its Release Report' USING ERRCODE = '42501';
  END IF;

  SELECT designation.* INTO v_master
  FROM public.song_passport_master_designations designation
  WHERE designation.id = p_master_designation_id
    AND designation.passport_id = p_passport_id;
  IF v_master.id IS NULL THEN RAISE EXCEPTION 'Master designation not found' USING ERRCODE = 'P0002'; END IF;

  SELECT link.vault_project_id, link.track_id INTO v_project_id, v_track_id
  FROM public.song_passport_release_links link
  WHERE link.passport_id = p_passport_id
    AND link.master_designation_id = p_master_designation_id;
  IF v_project_id IS NOT NULL THEN
    RETURN QUERY SELECT v_project_id, v_track_id, FALSE;
    RETURN;
  END IF;

  SELECT version.* INTO v_version FROM public.work_versions version WHERE version.id = v_master.work_version_id;
  v_title := COALESCE(NULLIF(BTRIM(p_release_title), ''), v_work.title);

  SELECT value.value_jsonb #>> '{}' INTO v_release_date
  FROM public.song_passport_field_heads head JOIN public.song_passport_values value ON value.id = head.current_value_id
  WHERE head.passport_id = p_passport_id AND head.field_key = 'release_date' LIMIT 1;
  SELECT value.value_jsonb #>> '{}' INTO v_label
  FROM public.song_passport_field_heads head JOIN public.song_passport_values value ON value.id = head.current_value_id
  WHERE head.passport_id = p_passport_id AND head.field_key = 'label_name' LIMIT 1;
  SELECT value.value_jsonb #>> '{}' INTO v_upc
  FROM public.song_passport_field_heads head JOIN public.song_passport_values value ON value.id = head.current_value_id
  WHERE head.passport_id = p_passport_id AND head.field_key = 'upc' LIMIT 1;
  SELECT value.value_jsonb #>> '{}' INTO v_isrc
  FROM public.song_passport_field_heads head JOIN public.song_passport_values value ON value.id = head.current_value_id
  WHERE head.passport_id = p_passport_id AND head.field_key = 'isrc' LIMIT 1;
  SELECT value.value_jsonb #>> '{}' INTO v_lyrics
  FROM public.song_passport_field_heads head JOIN public.song_passport_values value ON value.id = head.current_value_id
  WHERE head.passport_id = p_passport_id AND head.field_key = 'lyrics' LIMIT 1;

  IF v_work.graduated_project_id IS NULL THEN
    INSERT INTO public.vault_projects (
      user_id, title, type, status, release_date, vault_readiness_score,
      upc, label, is_public
    ) VALUES (
      p_actor_user_id, v_title, 'single', 'in_progress', v_release_date,
      0, v_upc, v_label, FALSE
    ) RETURNING id INTO v_project_id;
    UPDATE public.works SET graduated_project_id = v_project_id WHERE id = v_work.id;
  ELSE
    v_project_id := v_work.graduated_project_id;
    IF NOT EXISTS (SELECT 1 FROM public.vault_projects project WHERE project.id = v_project_id AND project.user_id = p_actor_user_id) THEN
      RAISE EXCEPTION 'The linked Release Report is not controlled by this owner' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.tracks (
    project_id, user_id, title, track_number, duration_seconds, isrc,
    audio_file_url, audio_file_size, lyrics, metadata
  ) VALUES (
    v_project_id, p_actor_user_id, v_work.title,
    COALESCE((SELECT MAX(track.track_number) + 1 FROM public.tracks track WHERE track.project_id = v_project_id), 1),
    v_version.duration_seconds, v_isrc, v_version.audio_path,
    v_version.audio_size, v_lyrics,
    jsonb_build_object(
      'song_passport_id', p_passport_id,
      'song_passport_snapshot_id', v_master.approval_snapshot_id,
      'master_designation_id', v_master.id,
      'source_work_version_id', v_version.id
    )
  ) RETURNING id INTO v_track_id;

  INSERT INTO public.song_passport_release_links (
    passport_id, master_designation_id, approval_snapshot_id,
    vault_project_id, track_id, mapping, created_by
  ) VALUES (
    p_passport_id, v_master.id, v_master.approval_snapshot_id,
    v_project_id, v_track_id,
    jsonb_build_object(
      'release_title', v_title, 'release_date', v_release_date,
      'label_name', v_label, 'upc', v_upc, 'isrc', v_isrc,
      'audio_path', v_version.audio_path, 'source_unchanged', TRUE
    ),
    p_actor_user_id
  );

  RETURN QUERY SELECT v_project_id, v_track_id, TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.graduate_song_passport_to_release(UUID, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_song_passport_to_release(UUID, UUID, UUID, TEXT)
  TO service_role;
