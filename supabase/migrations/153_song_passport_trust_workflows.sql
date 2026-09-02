-- ============================================================
-- Funūn — Phase 37.3 Song Passport, Slice 4
-- Migration 153: atomic revisions, confirmation and approval snapshots
-- HUMAN-GATED; additive to applied migrations 150–152.
-- ============================================================

-- One transaction inserts a successor and moves the current head. The
-- expected-head check turns a concurrent edit into a visible 40001 conflict
-- instead of silently overwriting either writer's proposal.
CREATE OR REPLACE FUNCTION public.append_song_passport_revision(
  p_passport_id UUID,
  p_actor_user_id UUID,
  p_layer TEXT,
  p_field_key TEXT,
  p_target_key TEXT,
  p_value_jsonb JSONB,
  p_state TEXT,
  p_visibility TEXT,
  p_expected_value_id UUID DEFAULT NULL,
  p_subject_user_id UUID DEFAULT NULL,
  p_collaborator_id UUID DEFAULT NULL,
  p_work_version_id UUID DEFAULT NULL,
  p_vault_project_id UUID DEFAULT NULL,
  p_track_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_id UUID;
  v_value_id UUID;
  v_work_id UUID;
  v_is_member BOOLEAN;
  v_is_identity_subject BOOLEAN := FALSE;
BEGIN
  IF p_state NOT IN ('draft', 'confirmed', 'disputed', 'outdated') THEN
    RAISE EXCEPTION 'Unsupported Passport revision state' USING ERRCODE = '22023';
  END IF;

  SELECT passport.work_id INTO v_work_id
  FROM public.song_passports passport
  WHERE passport.id = p_passport_id;
  IF v_work_id IS NULL THEN
    RAISE EXCEPTION 'Song Passport not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT (
    work.user_id = p_actor_user_id
    OR EXISTS (
      SELECT 1 FROM public.work_members member
      WHERE member.work_id = work.id AND member.user_id = p_actor_user_id
    )
  ) INTO v_is_member
  FROM public.works work WHERE work.id = v_work_id;
  IF NOT COALESCE(v_is_member, FALSE) THEN
    RAISE EXCEPTION 'Work membership is required' USING ERRCODE = '42501';
  END IF;

  SELECT head.current_value_id INTO v_current_id
  FROM public.song_passport_field_heads head
  WHERE head.passport_id = p_passport_id
    AND head.layer = p_layer
    AND head.field_key = p_field_key
    AND head.target_key = p_target_key
  FOR UPDATE;

  IF p_expected_value_id IS DISTINCT FROM v_current_id THEN
    RAISE EXCEPTION 'Passport field changed while you were reviewing it'
      USING ERRCODE = '40001';
  END IF;

  IF p_state = 'confirmed' THEN
    v_is_identity_subject :=
      p_layer = 'contributor'
      AND (
        p_subject_user_id = p_actor_user_id
        OR EXISTS (
          SELECT 1 FROM public.collaborators collaborator
          WHERE collaborator.id = p_collaborator_id
            AND collaborator.claimed_by = p_actor_user_id
        )
      );
    IF NOT v_is_identity_subject THEN
      RAISE EXCEPTION 'People may confirm only their own identity facts'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.song_passport_values (
    passport_id, layer, field_key, target_key, subject_user_id,
    collaborator_id, work_version_id, vault_project_id, track_id,
    value_jsonb, state, visibility, source_kind, source_revision,
    created_by, confirmed_by, confirmed_at, supersedes_value_id,
    conflict_group_id
  ) VALUES (
    p_passport_id, p_layer, p_field_key, p_target_key, p_subject_user_id,
    p_collaborator_id, p_work_version_id, p_vault_project_id, p_track_id,
    p_value_jsonb, p_state, p_visibility, 'manual', 'user-proposal',
    p_actor_user_id,
    CASE WHEN p_state = 'confirmed' THEN p_actor_user_id ELSE NULL END,
    CASE WHEN p_state = 'confirmed' THEN NOW() ELSE NULL END,
    v_current_id,
    CASE WHEN p_state = 'disputed' THEN COALESCE(
      (SELECT conflict_group_id FROM public.song_passport_values WHERE id = v_current_id),
      gen_random_uuid()
    ) ELSE NULL END
  ) RETURNING id INTO v_value_id;

  INSERT INTO public.song_passport_field_heads (
    passport_id, layer, field_key, target_key, current_value_id, updated_by
  ) VALUES (
    p_passport_id, p_layer, p_field_key, p_target_key, v_value_id, p_actor_user_id
  )
  ON CONFLICT (passport_id, layer, field_key, target_key)
  DO UPDATE SET current_value_id = EXCLUDED.current_value_id, updated_by = EXCLUDED.updated_by;

  IF p_state IN ('confirmed', 'disputed', 'outdated') THEN
    INSERT INTO public.song_passport_actions (
      passport_id, value_id, action, actor_user_id, authority_basis, reason
    ) VALUES (
      p_passport_id,
      v_value_id,
      CASE p_state
        WHEN 'confirmed' THEN 'confirm'
        WHEN 'disputed' THEN 'dispute'
        ELSE 'mark_outdated'
      END,
      p_actor_user_id,
      jsonb_build_object('work_membership_checked', TRUE, 'identity_subject_checked', v_is_identity_subject),
      p_reason
    );
  END IF;

  RETURN v_value_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.append_song_passport_revision(
  UUID, UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID,
  UUID, UUID, UUID, UUID, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_song_passport_revision(
  UUID, UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID,
  UUID, UUID, UUID, UUID, UUID, TEXT
) TO service_role;

-- Immutable snapshot creation and its approval action are one transaction.
-- Authority is checked against active scoped grants; release controllers may
-- also approve release snapshots for projects they own.
CREATE OR REPLACE FUNCTION public.create_song_passport_approval_snapshot(
  p_passport_id UUID,
  p_actor_user_id UUID,
  p_scope TEXT,
  p_payload JSONB,
  p_payload_sha256 TEXT,
  p_supersedes_snapshot_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_permission TEXT;
  v_authorized BOOLEAN := FALSE;
  v_snapshot_id UUID;
BEGIN
  IF p_scope NOT IN ('composition', 'release') THEN
    RAISE EXCEPTION 'Approval scope must be composition or release' USING ERRCODE = '22023';
  END IF;
  IF p_payload_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid snapshot hash' USING ERRCODE = '22023';
  END IF;
  v_permission := CASE WHEN p_scope = 'composition' THEN 'approve_composition' ELSE 'approve_release' END;

  SELECT EXISTS (
    SELECT 1 FROM public.song_passport_grants grant_row
    WHERE grant_row.passport_id = p_passport_id
      AND grant_row.grantee_user_id = p_actor_user_id
      AND grant_row.permission = v_permission
      AND grant_row.revoked_at IS NULL
      AND (grant_row.expires_at IS NULL OR grant_row.expires_at > NOW())
  ) INTO v_authorized;

  IF p_scope = 'release' AND NOT v_authorized THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.song_passport_field_heads head
      JOIN public.song_passport_values value ON value.id = head.current_value_id
      JOIN public.vault_projects project ON project.id = value.vault_project_id
      WHERE head.passport_id = p_passport_id
        AND value.layer = 'release'
        AND project.user_id = p_actor_user_id
    ) INTO v_authorized;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Explicit approval authority is required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_payload -> 'values', '[]'::JSONB)) item
    WHERE item ->> 'visibility' = 'legal_restricted'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.song_passport_grants grant_row
    WHERE grant_row.passport_id = p_passport_id
      AND grant_row.grantee_user_id = p_actor_user_id
      AND grant_row.permission = 'view_legal'
      AND grant_row.revoked_at IS NULL
      AND (grant_row.expires_at IS NULL OR grant_row.expires_at > NOW())
  ) THEN
    RAISE EXCEPTION 'Legal-review visibility is required for this approval snapshot'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.song_passport_snapshots (
    passport_id, purpose, schema_version, payload, payload_sha256,
    created_by, supersedes_snapshot_id
  ) VALUES (
    p_passport_id, 'approval', 1,
    p_payload || jsonb_build_object('scope', p_scope),
    p_payload_sha256, p_actor_user_id, p_supersedes_snapshot_id
  ) RETURNING id INTO v_snapshot_id;

  INSERT INTO public.song_passport_actions (
    passport_id, snapshot_id, action, actor_user_id, authority_basis, reason
  ) VALUES (
    p_passport_id, v_snapshot_id, 'approve', p_actor_user_id,
    jsonb_build_object('permission', v_permission, 'scope', p_scope), p_reason
  );

  RETURN v_snapshot_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_song_passport_approval_snapshot(
  UUID, UUID, TEXT, JSONB, TEXT, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_song_passport_approval_snapshot(
  UUID, UUID, TEXT, JSONB, TEXT, UUID, TEXT
) TO service_role;

-- Explicit authority grants use a server transaction because the active
-- uniqueness rule is a partial index and must not be approximated by a
-- read-then-insert race in application code.
CREATE OR REPLACE FUNCTION public.grant_song_passport_permission(
  p_passport_id UUID,
  p_actor_user_id UUID,
  p_grantee_user_id UUID,
  p_permission TEXT,
  p_scope JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_grant_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.song_passports passport
    JOIN public.works work ON work.id = passport.work_id
    WHERE passport.id = p_passport_id
      AND work.user_id = p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'Only the song owner may issue Passport authority grants'
      USING ERRCODE = '42501';
  END IF;
  IF p_permission NOT IN (
    'view_private_identity', 'view_legal', 'approve_composition',
    'approve_release', 'select_master', 'export_delivery_safe',
    'deliver_clean_master', 'transfer_custody', 'delete_passport'
  ) THEN
    RAISE EXCEPTION 'Unsupported Passport permission' USING ERRCODE = '22023';
  END IF;

  SELECT grant_row.id INTO v_grant_id
  FROM public.song_passport_grants grant_row
  WHERE grant_row.passport_id = p_passport_id
    AND grant_row.grantee_user_id = p_grantee_user_id
    AND grant_row.permission = p_permission
    AND grant_row.revoked_at IS NULL
  FOR UPDATE;

  IF v_grant_id IS NULL THEN
    INSERT INTO public.song_passport_grants (
      passport_id, grantee_user_id, permission, scope, granted_by
    ) VALUES (
      p_passport_id, p_grantee_user_id, p_permission,
      COALESCE(p_scope, '{}'::JSONB), p_actor_user_id
    ) RETURNING id INTO v_grant_id;
  END IF;
  RETURN v_grant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_song_passport_permission(UUID, UUID, UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_song_passport_permission(UUID, UUID, UUID, TEXT, JSONB)
  TO service_role;
