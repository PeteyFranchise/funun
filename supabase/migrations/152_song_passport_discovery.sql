-- ============================================================
-- Funūn — Phase 37.3 Song Passport, Slice 2
-- Migration 152: conservative legacy discovery and reconciliation
--
-- HUMAN-GATED. This additive migration is authored and verified by the
-- agent, then applied by the owner through the established Supabase flow.
-- ============================================================

-- A deterministic source fingerprint makes every legacy seed idempotent.
-- It does not identify a person by email; the application builds it only
-- from typed source table/id/field/target coordinates.
ALTER TABLE public.song_passport_values
  ADD COLUMN source_fingerprint TEXT;

ALTER TABLE public.song_passport_values
  ADD CONSTRAINT song_passport_values_source_fingerprint_chk CHECK (
    source_fingerprint IS NULL OR source_fingerprint ~ '^[a-z0-9:_-]{8,240}$'
  );

CREATE UNIQUE INDEX idx_song_passport_values_source_fingerprint
  ON public.song_passport_values (passport_id, source_fingerprint)
  WHERE source_fingerprint IS NOT NULL;

CREATE TABLE public.song_passport_backfill_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id     UUID REFERENCES public.song_passports(id) ON DELETE CASCADE,
  work_id         UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  mode            TEXT NOT NULL CHECK (mode IN ('dry_run', 'apply')),
  idempotency_key TEXT NOT NULL,
  summary         JSONB NOT NULL DEFAULT '{}',
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (work_id, mode, idempotency_key)
);

CREATE INDEX idx_song_passport_backfill_runs_work
  ON public.song_passport_backfill_runs (work_id, created_at DESC);

CREATE TABLE public.song_passport_reconciliation_issues (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id         UUID NOT NULL REFERENCES public.song_passports(id) ON DELETE CASCADE,
  issue_key           TEXT NOT NULL,
  issue_type          TEXT NOT NULL
                      CHECK (issue_type IN ('conflicting_values', 'ambiguous_identity', 'duplicate_source', 'unsupported_legacy_value')),
  layer               TEXT NOT NULL
                      CHECK (layer IN ('contributor', 'composition', 'recording_version', 'release')),
  field_key           TEXT NOT NULL,
  target_key          TEXT NOT NULL,
  source_evidence     JSONB NOT NULL DEFAULT '[]',
  status              TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution_note     TEXT,
  resolved_by         UUID REFERENCES auth.users(id),
  resolved_at         TIMESTAMPTZ,
  created_by          UUID NOT NULL REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (passport_id, issue_key),
  CONSTRAINT song_passport_reconciliation_resolution_chk CHECK (
    (status = 'open' AND resolved_by IS NULL AND resolved_at IS NULL)
    OR (status IN ('resolved', 'dismissed') AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
  )
);

CREATE INDEX idx_song_passport_reconciliation_open
  ON public.song_passport_reconciliation_issues (passport_id, created_at DESC)
  WHERE status = 'open';

CREATE TRIGGER song_passport_reconciliation_issues_updated_at
  BEFORE UPDATE ON public.song_passport_reconciliation_issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Atomic, server-only seed primitive. It can create the one Passport for a
-- work and insert one inherited revision. Existing heads are never advanced:
-- discovery must not overwrite a user proposal or confirmation.
CREATE OR REPLACE FUNCTION public.seed_song_passport_value(
  p_work_id UUID,
  p_actor_user_id UUID,
  p_layer TEXT,
  p_field_key TEXT,
  p_target_key TEXT,
  p_subject_user_id UUID,
  p_collaborator_id UUID,
  p_work_version_id UUID,
  p_vault_project_id UUID,
  p_track_id UUID,
  p_value_jsonb JSONB,
  p_visibility TEXT,
  p_source_kind TEXT,
  p_source_record_id UUID,
  p_source_revision TEXT,
  p_source_fingerprint TEXT
)
RETURNS TABLE(passport_id UUID, value_id UUID, inserted BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_passport_id UUID;
  v_value_id UUID;
  v_inserted BOOLEAN := FALSE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.works work
    WHERE work.id = p_work_id AND work.user_id = p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'Only the work owner may apply legacy discovery'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.song_passports (work_id, created_by)
  VALUES (p_work_id, p_actor_user_id)
  ON CONFLICT (work_id) DO NOTHING;

  SELECT passport.id INTO v_passport_id
  FROM public.song_passports passport
  WHERE passport.work_id = p_work_id;

  INSERT INTO public.song_passport_values (
    passport_id, layer, field_key, target_key, subject_user_id,
    collaborator_id, work_version_id, vault_project_id, track_id,
    value_jsonb, state, visibility, source_kind, source_record_id,
    source_revision, source_fingerprint, created_by
  ) VALUES (
    v_passport_id, p_layer, p_field_key, p_target_key, p_subject_user_id,
    p_collaborator_id, p_work_version_id, p_vault_project_id, p_track_id,
    p_value_jsonb, 'inherited', p_visibility, p_source_kind, p_source_record_id,
    p_source_revision, p_source_fingerprint, p_actor_user_id
  )
  ON CONFLICT (passport_id, source_fingerprint)
    WHERE source_fingerprint IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_value_id;

  IF v_value_id IS NOT NULL THEN
    v_inserted := TRUE;
  ELSE
    SELECT value.id INTO v_value_id
    FROM public.song_passport_values value
    WHERE value.passport_id = v_passport_id
      AND value.source_fingerprint = p_source_fingerprint;
  END IF;

  INSERT INTO public.song_passport_field_heads (
    passport_id, layer, field_key, target_key, current_value_id, updated_by
  ) VALUES (
    v_passport_id, p_layer, p_field_key, p_target_key, v_value_id, p_actor_user_id
  )
  ON CONFLICT (passport_id, layer, field_key, target_key) DO NOTHING;

  RETURN QUERY SELECT v_passport_id, v_value_id, v_inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_song_passport_value(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID, UUID,
  JSONB, TEXT, TEXT, UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_song_passport_value(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID, UUID,
  JSONB, TEXT, TEXT, UUID, TEXT, TEXT
) TO service_role;

ALTER TABLE public.song_passport_backfill_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_passport_reconciliation_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Passport readers view backfill runs"
  ON public.song_passport_backfill_runs FOR SELECT TO authenticated
  USING (
    passport_id IS NOT NULL
    AND public.can_read_song_passport(passport_id, auth.uid())
  );

CREATE POLICY "Passport readers view reconciliation issues"
  ON public.song_passport_reconciliation_issues FOR SELECT TO authenticated
  USING (public.can_read_song_passport(passport_id, auth.uid()));

-- Reports/issues may carry source evidence. They are rendered only through
-- the privacy-scoped server view; raw browser reads and every browser write
-- remain closed even when an RLS policy would otherwise match.
REVOKE ALL ON public.song_passport_backfill_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.song_passport_reconciliation_issues FROM PUBLIC, anon, authenticated;
