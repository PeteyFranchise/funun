-- ============================================================
-- Funūn — Phase 37.3 Song Passport, Slice 6
-- Migration 155: snapshot-bound artifacts, custody and retention history
-- HUMAN-GATED; additive to applied migrations 150–154.
-- ============================================================

CREATE TABLE public.song_passport_artifacts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id           UUID NOT NULL REFERENCES public.song_passports(id) ON DELETE CASCADE,
  snapshot_id           UUID NOT NULL,
  master_designation_id UUID,
  kind                  TEXT NOT NULL CHECK (kind IN ('passport_json', 'metadata_sidecar', 'tagged_mp3', 'custody_package')),
  purpose               TEXT NOT NULL CHECK (purpose IN ('professional_handoff', 'distributor_upload', 'registration', 'archive', 'custody_transfer')),
  source_bucket         TEXT,
  source_path           TEXT,
  source_sha256         TEXT CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$'),
  artifact_bucket       TEXT NOT NULL,
  artifact_path         TEXT NOT NULL,
  artifact_sha256       TEXT NOT NULL CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  artifact_size_bytes   BIGINT NOT NULL CHECK (artifact_size_bytes >= 0),
  audience              JSONB NOT NULL DEFAULT '{}',
  manifest              JSONB NOT NULL,
  receipt               JSONB NOT NULL,
  created_by            UUID NOT NULL REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, passport_id),
  UNIQUE (artifact_bucket, artifact_path),
  CONSTRAINT song_passport_artifact_snapshot_fk
    FOREIGN KEY (snapshot_id, passport_id)
    REFERENCES public.song_passport_snapshots(id, passport_id) ON DELETE RESTRICT,
  CONSTRAINT song_passport_artifact_master_fk
    FOREIGN KEY (master_designation_id, passport_id)
    REFERENCES public.song_passport_master_designations(id, passport_id) ON DELETE RESTRICT,
  CONSTRAINT song_passport_artifact_source_chk CHECK (
    (source_bucket IS NULL AND source_path IS NULL AND source_sha256 IS NULL)
    OR (source_bucket IS NOT NULL AND source_path IS NOT NULL AND source_sha256 IS NOT NULL)
  )
);

CREATE INDEX idx_song_passport_artifacts_history
  ON public.song_passport_artifacts (passport_id, created_at DESC);

CREATE TABLE public.song_passport_custody_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id           UUID NOT NULL REFERENCES public.song_passports(id) ON DELETE CASCADE,
  master_designation_id UUID,
  artifact_id           UUID,
  event_type            TEXT NOT NULL CHECK (event_type IN (
    'uploaded_original', 'designated_master', 'delivery_copy_generated',
    'access_granted', 'delivery_prepared', 'delivery_downloaded',
    'custody_transfer_proposed', 'custody_transferred', 'controller_corrected',
    'retention_requested', 'deletion_completed'
  )),
  controller_before     JSONB,
  controller_after      JSONB,
  recipient             JSONB,
  details               JSONB NOT NULL DEFAULT '{}',
  actor_user_id         UUID NOT NULL REFERENCES auth.users(id),
  occurred_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, passport_id),
  CONSTRAINT song_passport_custody_master_fk
    FOREIGN KEY (master_designation_id, passport_id)
    REFERENCES public.song_passport_master_designations(id, passport_id) ON DELETE RESTRICT,
  CONSTRAINT song_passport_custody_artifact_fk
    FOREIGN KEY (artifact_id, passport_id)
    REFERENCES public.song_passport_artifacts(id, passport_id) ON DELETE RESTRICT
);

CREATE INDEX idx_song_passport_custody_history
  ON public.song_passport_custody_events (passport_id, occurred_at DESC);

CREATE TABLE public.song_passport_retention_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id       UUID NOT NULL REFERENCES public.song_passports(id) ON DELETE CASCADE,
  request_type      TEXT NOT NULL CHECK (request_type IN ('portable_copy', 'archive', 'delete_personal_data', 'delete_passport')),
  status            TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'under_review', 'blocked_legal_hold', 'completed', 'denied')),
  reason            TEXT,
  requested_by      UUID NOT NULL REFERENCES auth.users(id),
  resolved_by       UUID REFERENCES auth.users(id),
  resolution_note   TEXT,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT song_passport_retention_resolution_chk CHECK (
    (status IN ('requested', 'under_review', 'blocked_legal_hold') AND resolved_at IS NULL)
    OR (status IN ('completed', 'denied') AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
  )
);

CREATE TRIGGER song_passport_retention_requests_updated_at
  BEFORE UPDATE ON public.song_passport_retention_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER reject_song_passport_artifacts_mutation
  BEFORE UPDATE OR DELETE ON public.song_passport_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.reject_song_passport_ledger_mutation();
CREATE TRIGGER reject_song_passport_custody_events_mutation
  BEFORE UPDATE OR DELETE ON public.song_passport_custody_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_song_passport_ledger_mutation();

ALTER TABLE public.song_passport_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_passport_custody_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_passport_retention_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Passport readers view artifact evidence"
  ON public.song_passport_artifacts FOR SELECT TO authenticated
  USING (public.can_read_song_passport(passport_id, auth.uid()));
CREATE POLICY "Passport readers view custody history"
  ON public.song_passport_custody_events FOR SELECT TO authenticated
  USING (public.can_read_song_passport(passport_id, auth.uid()));
CREATE POLICY "Passport readers view retention requests"
  ON public.song_passport_retention_requests FOR SELECT TO authenticated
  USING (public.can_read_song_passport(passport_id, auth.uid()));

-- Manifests, custody evidence and retention reasons are server-mediated.
-- The artist UI receives an explicitly scoped projection, not raw rows.
REVOKE ALL ON public.song_passport_artifacts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.song_passport_custody_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.song_passport_retention_requests FROM PUBLIC, anon, authenticated;
