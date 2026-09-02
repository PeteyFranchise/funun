-- ============================================================
-- Funūn — Phase 37.3 Song Passport, Slice 1
-- Migration 151: additive provenance, authority and snapshot foundation
--
-- HUMAN-GATED: the owner applies migrations through the established
-- Supabase process. The agent authors and verifies this file but does not
-- push it. Migration 151 is additive, changes no existing runtime table,
-- and is consumed by no artist-facing route while the server-only feature
-- boundary remains disabled by default.
-- ============================================================

-- ─── Canonical Passport: exactly one per underlying work ───────────────

CREATE TABLE public.song_passports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id         UUID NOT NULL UNIQUE REFERENCES public.works(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  schema_version  INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  lifecycle_state TEXT NOT NULL DEFAULT 'active'
                  CHECK (lifecycle_state IN ('active', 'archived', 'transfer_pending', 'deleted')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_song_passports_created_by
  ON public.song_passports (created_by, created_at DESC);

CREATE TRIGGER song_passports_updated_at
  BEFORE UPDATE ON public.song_passports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── Append-only field revisions ───────────────────────────────────────
-- target_key is deliberately stored and CHECK-bound to typed foreign keys.
-- It gives the field-head table one stable, indexable subject identifier
-- without sacrificing referential integrity on the underlying target.

CREATE TABLE public.song_passport_values (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id         UUID NOT NULL REFERENCES public.song_passports(id) ON DELETE CASCADE,
  layer               TEXT NOT NULL
                      CHECK (layer IN ('contributor', 'composition', 'recording_version', 'release')),
  field_key           TEXT NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  target_key          TEXT NOT NULL,
  subject_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  collaborator_id     UUID REFERENCES public.collaborators(id) ON DELETE SET NULL,
  work_version_id     UUID REFERENCES public.work_versions(id) ON DELETE SET NULL,
  vault_project_id    UUID REFERENCES public.vault_projects(id) ON DELETE SET NULL,
  track_id            UUID REFERENCES public.tracks(id) ON DELETE SET NULL,
  value_jsonb         JSONB NOT NULL,
  state               TEXT NOT NULL DEFAULT 'draft'
                      CHECK (state IN ('inherited', 'draft', 'confirmed', 'locked', 'outdated', 'disputed')),
  visibility          TEXT NOT NULL DEFAULT 'collaborators'
                      CHECK (visibility IN ('public', 'collaborators', 'delivery_safe', 'private_identity', 'legal_restricted')),
  source_kind         TEXT NOT NULL
                      CHECK (source_kind IN (
                        'manual', 'profile', 'collaborator', 'work', 'lyric_block',
                        'split_sheet', 'contract', 'work_version', 'release_project',
                        'track_metadata', 'registration', 'import', 'system'
                      )),
  source_record_id    UUID,
  source_revision     TEXT,
  created_by          UUID NOT NULL REFERENCES auth.users(id),
  confirmed_by        UUID REFERENCES auth.users(id),
  confirmed_at        TIMESTAMPTZ,
  approved_by         UUID REFERENCES auth.users(id),
  approved_at         TIMESTAMPTZ,
  locked_at           TIMESTAMPTZ,
  lock_reason         TEXT,
  supersedes_value_id UUID,
  conflict_group_id   UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT song_passport_values_confirmation_chk CHECK (
    (confirmed_by IS NULL AND confirmed_at IS NULL)
    OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
  ),
  CONSTRAINT song_passport_values_approval_chk CHECK (
    (approved_by IS NULL AND approved_at IS NULL)
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  ),
  CONSTRAINT song_passport_values_lock_chk CHECK (
    state <> 'locked' OR locked_at IS NOT NULL
  ),
  CONSTRAINT song_passport_values_target_chk CHECK (
    (
      layer = 'composition'
      AND subject_user_id IS NULL
      AND collaborator_id IS NULL
      AND work_version_id IS NULL
      AND vault_project_id IS NULL
      AND track_id IS NULL
      AND target_key = 'work'
    )
    OR
    (
      layer = 'contributor'
      AND work_version_id IS NULL
      AND vault_project_id IS NULL
      AND track_id IS NULL
      AND (
        (
          subject_user_id IS NOT NULL
          AND collaborator_id IS NULL
          AND target_key = 'user:' || subject_user_id::TEXT
        )
        OR
        (
          subject_user_id IS NULL
          AND collaborator_id IS NOT NULL
          AND target_key = 'collaborator:' || collaborator_id::TEXT
        )
      )
    )
    OR
    (
      layer = 'recording_version'
      AND subject_user_id IS NULL
      AND collaborator_id IS NULL
      AND work_version_id IS NOT NULL
      AND vault_project_id IS NULL
      AND track_id IS NULL
      AND target_key = 'version:' || work_version_id::TEXT
    )
    OR
    (
      layer = 'release'
      AND subject_user_id IS NULL
      AND collaborator_id IS NULL
      AND work_version_id IS NULL
      AND vault_project_id IS NOT NULL
      AND (
        (track_id IS NULL AND target_key = 'project:' || vault_project_id::TEXT)
        OR
        (track_id IS NOT NULL AND target_key = 'track:' || track_id::TEXT)
      )
    )
  ),
  UNIQUE (id, passport_id),
  UNIQUE (id, passport_id, layer, field_key, target_key),
  CONSTRAINT song_passport_values_supersedes_fk
    FOREIGN KEY (supersedes_value_id, passport_id, layer, field_key, target_key)
    REFERENCES public.song_passport_values (id, passport_id, layer, field_key, target_key)
    ON DELETE RESTRICT
);

CREATE INDEX idx_song_passport_values_field_history
  ON public.song_passport_values (passport_id, layer, field_key, target_key, created_at DESC);

CREATE INDEX idx_song_passport_values_source
  ON public.song_passport_values (source_kind, source_record_id)
  WHERE source_record_id IS NOT NULL;

CREATE INDEX idx_song_passport_values_conflicts
  ON public.song_passport_values (passport_id, conflict_group_id)
  WHERE conflict_group_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_song_passport_value_target()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.layer = 'recording_version' AND EXISTS (
    SELECT 1
    FROM public.song_passports passport
    JOIN public.work_versions version ON version.id = NEW.work_version_id
    WHERE passport.id = NEW.passport_id
      AND version.work_id <> passport.work_id
  ) THEN
    RAISE EXCEPTION 'Recording version does not belong to the Passport work'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.layer = 'release' AND NEW.track_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.tracks track
    WHERE track.id = NEW.track_id
      AND track.project_id <> NEW.vault_project_id
  ) THEN
    RAISE EXCEPTION 'Release track does not belong to the selected release project'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_song_passport_value_target()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER validate_song_passport_value_target
  BEFORE INSERT ON public.song_passport_values
  FOR EACH ROW EXECUTE FUNCTION public.validate_song_passport_value_target();

-- ─── Transactional current head per field and target ────────────────────
-- Revision rows never mutate. A server transaction inserts the successor
-- and advances this pointer only after authorization and conflict checks.

CREATE TABLE public.song_passport_field_heads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id      UUID NOT NULL REFERENCES public.song_passports(id) ON DELETE CASCADE,
  layer            TEXT NOT NULL
                   CHECK (layer IN ('contributor', 'composition', 'recording_version', 'release')),
  field_key        TEXT NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  target_key       TEXT NOT NULL,
  current_value_id UUID NOT NULL,
  updated_by       UUID NOT NULL REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, passport_id),
  UNIQUE (passport_id, layer, field_key, target_key),
  CONSTRAINT song_passport_field_heads_value_fk
    FOREIGN KEY (current_value_id, passport_id, layer, field_key, target_key)
    REFERENCES public.song_passport_values (id, passport_id, layer, field_key, target_key)
    ON DELETE RESTRICT
);

CREATE INDEX idx_song_passport_field_heads_current_value
  ON public.song_passport_field_heads (current_value_id);

CREATE TRIGGER song_passport_field_heads_updated_at
  BEFORE UPDATE ON public.song_passport_field_heads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── Immutable snapshots and authority actions ─────────────────────────

CREATE TABLE public.song_passport_snapshots (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id            UUID NOT NULL REFERENCES public.song_passports(id) ON DELETE CASCADE,
  purpose                TEXT NOT NULL
                         CHECK (purpose IN (
                           'confirmation', 'approval', 'release', 'export',
                           'registration', 'delivery', 'custody_transfer', 'audit'
                         )),
  schema_version         INTEGER NOT NULL CHECK (schema_version > 0),
  payload                JSONB NOT NULL,
  payload_sha256         TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_by             UUID NOT NULL REFERENCES auth.users(id),
  supersedes_snapshot_id UUID,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, passport_id),
  CONSTRAINT song_passport_snapshots_supersedes_fk
    FOREIGN KEY (supersedes_snapshot_id, passport_id)
    REFERENCES public.song_passport_snapshots (id, passport_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_song_passport_snapshots_history
  ON public.song_passport_snapshots (passport_id, purpose, created_at DESC);

CREATE TABLE public.song_passport_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id     UUID NOT NULL REFERENCES public.song_passports(id) ON DELETE CASCADE,
  value_id        UUID,
  snapshot_id     UUID,
  action          TEXT NOT NULL
                  CHECK (action IN (
                    'confirm', 'approve', 'reject', 'lock', 'mark_outdated',
                    'dispute', 'resolve_dispute', 'revoke_approval'
                  )),
  actor_user_id   UUID NOT NULL REFERENCES auth.users(id),
  authority_basis JSONB NOT NULL DEFAULT '{}',
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT song_passport_actions_subject_chk CHECK (
    value_id IS NOT NULL OR snapshot_id IS NOT NULL
  ),
  CONSTRAINT song_passport_actions_value_fk
    FOREIGN KEY (value_id, passport_id)
    REFERENCES public.song_passport_values (id, passport_id)
    ON DELETE RESTRICT,
  CONSTRAINT song_passport_actions_snapshot_fk
    FOREIGN KEY (snapshot_id, passport_id)
    REFERENCES public.song_passport_snapshots (id, passport_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_song_passport_actions_history
  ON public.song_passport_actions (passport_id, created_at DESC);

-- ─── Operational tasks: never a readiness source ───────────────────────

CREATE TABLE public.song_passport_tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id       UUID NOT NULL REFERENCES public.song_passports(id) ON DELETE CASCADE,
  field_head_id     UUID,
  conflict_group_id UUID,
  rule_key          TEXT NOT NULL CHECK (rule_key ~ '^[a-z][a-z0-9_.-]{1,95}$'),
  title             TEXT NOT NULL CHECK (LENGTH(BTRIM(title)) > 0),
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'in_progress', 'blocked', 'completed', 'dismissed')),
  assigned_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by        UUID NOT NULL REFERENCES auth.users(id),
  due_at            TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT song_passport_tasks_completed_chk CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  ),
  CONSTRAINT song_passport_tasks_field_head_fk
    FOREIGN KEY (field_head_id, passport_id)
    REFERENCES public.song_passport_field_heads (id, passport_id)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.song_passport_tasks IS
  'Task status is operational only and MUST NOT drive readiness. Readiness changes only when the underlying fact, evidence or approval reaches its qualifying state.';

CREATE INDEX idx_song_passport_tasks_assignee
  ON public.song_passport_tasks (assigned_user_id, status, due_at)
  WHERE assigned_user_id IS NOT NULL;

CREATE INDEX idx_song_passport_tasks_passport
  ON public.song_passport_tasks (passport_id, status, created_at DESC);

CREATE TRIGGER song_passport_tasks_updated_at
  BEFORE UPDATE ON public.song_passport_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── Explicit scoped authority grants ──────────────────────────────────

CREATE TABLE public.song_passport_grants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id     UUID NOT NULL REFERENCES public.song_passports(id) ON DELETE CASCADE,
  grantee_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission      TEXT NOT NULL
                  CHECK (permission IN (
                    'view_private_identity', 'view_legal', 'approve_composition',
                    'approve_release', 'select_master', 'export_delivery_safe',
                    'deliver_clean_master', 'transfer_custody', 'delete_passport'
                  )),
  scope           JSONB NOT NULL DEFAULT '{}',
  granted_by      UUID NOT NULL REFERENCES auth.users(id),
  expires_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT song_passport_grants_expiry_chk CHECK (
    expires_at IS NULL OR expires_at > created_at
  ),
  CONSTRAINT song_passport_grants_revoke_chk CHECK (
    revoked_at IS NULL OR revoked_at >= created_at
  )
);

CREATE UNIQUE INDEX idx_song_passport_grants_active
  ON public.song_passport_grants (passport_id, grantee_user_id, permission)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_song_passport_grants_grantee
  ON public.song_passport_grants (grantee_user_id, passport_id, permission);

CREATE TRIGGER song_passport_grants_updated_at
  BEFORE UPDATE ON public.song_passport_grants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── Append-only database guard ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reject_song_passport_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; create a successor record instead', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_song_passport_ledger_mutation()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER reject_song_passport_values_mutation
  BEFORE UPDATE OR DELETE ON public.song_passport_values
  FOR EACH ROW EXECUTE FUNCTION public.reject_song_passport_ledger_mutation();

CREATE TRIGGER reject_song_passport_snapshots_mutation
  BEFORE UPDATE OR DELETE ON public.song_passport_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.reject_song_passport_ledger_mutation();

CREATE TRIGGER reject_song_passport_actions_mutation
  BEFORE UPDATE OR DELETE ON public.song_passport_actions
  FOR EACH ROW EXECUTE FUNCTION public.reject_song_passport_ledger_mutation();

-- ─── RLS and narrow visibility helpers ─────────────────────────────────

ALTER TABLE public.song_passports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_passport_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_passport_field_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_passport_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_passport_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_passport_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_passport_grants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_read_song_passport(
  p_passport_id UUID,
  p_uid UUID
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_uid IS NOT NULL
    AND p_uid = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.song_passports passport
      JOIN public.works work ON work.id = passport.work_id
      WHERE passport.id = p_passport_id
        AND (
          work.user_id = p_uid
          OR EXISTS (
            SELECT 1
            FROM public.work_members member
            WHERE member.work_id = work.id
              AND member.user_id = p_uid
          )
        )
    )
$$;

CREATE OR REPLACE FUNCTION public.has_song_passport_grant(
  p_passport_id UUID,
  p_uid UUID,
  p_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_uid IS NOT NULL
    AND p_uid = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.song_passport_grants grant_row
      WHERE grant_row.passport_id = p_passport_id
        AND grant_row.grantee_user_id = p_uid
        AND grant_row.permission = p_permission
        AND grant_row.revoked_at IS NULL
        AND (grant_row.expires_at IS NULL OR grant_row.expires_at > NOW())
    )
$$;

CREATE OR REPLACE FUNCTION public.can_view_song_passport_value(
  p_passport_id UUID,
  p_visibility TEXT,
  p_subject_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (
      p_visibility = 'private_identity'
      AND p_subject_user_id = auth.uid()
    )
    OR (
      public.can_read_song_passport(p_passport_id, auth.uid())
      AND (
        p_visibility IN ('public', 'collaborators', 'delivery_safe')
        OR (
          p_visibility = 'private_identity'
          AND public.has_song_passport_grant(
            p_passport_id,
            auth.uid(),
            'view_private_identity'
          )
        )
        OR (
          p_visibility = 'legal_restricted'
          AND public.has_song_passport_grant(
            p_passport_id,
            auth.uid(),
            'view_legal'
          )
        )
      )
    )
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_song_passport(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_song_passport(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_song_passport_grant(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_song_passport_grant(uuid, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_view_song_passport_value(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_song_passport_value(uuid, text, uuid) TO authenticated;

CREATE POLICY "song_passports_select_owner_or_member"
  ON public.song_passports
  FOR SELECT TO authenticated
  USING (public.can_read_song_passport(id, auth.uid()));

CREATE POLICY "song_passport_values_select_scoped"
  ON public.song_passport_values
  FOR SELECT TO authenticated
  USING (
    public.can_view_song_passport_value(
      passport_id,
      visibility,
      subject_user_id
    )
  );

CREATE POLICY "song_passport_field_heads_select_scoped"
  ON public.song_passport_field_heads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.song_passport_values current_value
      WHERE current_value.id = current_value_id
        AND public.can_view_song_passport_value(
          current_value.passport_id,
          current_value.visibility,
          current_value.subject_user_id
        )
    )
  );

CREATE POLICY "song_passport_grants_select_own"
  ON public.song_passport_grants
  FOR SELECT TO authenticated
  USING (grantee_user_id = auth.uid());

-- Browser sessions may read only the scoped current model and their own
-- grant rows. All writes and all evidence/task reads are server-mediated.
REVOKE ALL ON TABLE public.song_passports FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.song_passport_values FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.song_passport_field_heads FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.song_passport_snapshots FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.song_passport_actions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.song_passport_tasks FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.song_passport_grants FROM PUBLIC, anon;

REVOKE INSERT, UPDATE, DELETE ON public.song_passports FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.song_passport_values FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.song_passport_field_heads FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.song_passport_snapshots FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.song_passport_actions FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.song_passport_tasks FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.song_passport_grants FROM authenticated, anon;

GRANT SELECT ON public.song_passports TO authenticated;
GRANT SELECT ON public.song_passport_values TO authenticated;
GRANT SELECT ON public.song_passport_field_heads TO authenticated;
GRANT SELECT ON public.song_passport_grants TO authenticated;

REVOKE SELECT ON public.song_passport_snapshots FROM authenticated, anon;
REVOKE SELECT ON public.song_passport_actions FROM authenticated, anon;
REVOKE SELECT ON public.song_passport_tasks FROM authenticated, anon;

COMMENT ON TABLE public.song_passports IS
  'One canonical Song Passport per underlying work. Phase 37.3 Slice 1 foundation; no artist-facing runtime reads or writes until the disabled feature boundary is deliberately enabled.';

COMMENT ON TABLE public.song_passport_values IS
  'Append-only field revision ledger. Current values are selected through song_passport_field_heads; confirmed, locked and delivered history is never updated in place.';

COMMENT ON TABLE public.song_passport_snapshots IS
  'Immutable canonical JSON snapshots for confirmation, approval, release, export, registration, delivery, custody transfer and audit.';

NOTIFY pgrst, 'reload schema';
