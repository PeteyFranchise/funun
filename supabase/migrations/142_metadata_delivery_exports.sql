-- ============================================================
-- Funūn — Delivery-safe metadata artifacts
-- Migration 142: append-only evidence for tagged MP3 copies and sidecars.
--
-- HUMAN-GATED: author and test this migration in the repository, but the
-- owner applies it to production through the established Supabase process.
-- Never mutate the uploaded source object. Every row identifies a unique
-- generated artifact and freezes its source hash, output hash, metadata
-- snapshot, manifest and export receipt.
-- ============================================================

CREATE TABLE public.metadata_delivery_exports (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID NOT NULL REFERENCES public.vault_projects(id) ON DELETE CASCADE,
  track_id           UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind               TEXT NOT NULL CHECK (kind IN ('tagged_mp3', 'metadata_sidecar')),
  source_bucket      TEXT NOT NULL,
  source_path        TEXT NOT NULL,
  source_sha256      TEXT NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  artifact_bucket    TEXT NOT NULL,
  artifact_path      TEXT NOT NULL UNIQUE,
  artifact_sha256    TEXT NOT NULL CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  metadata_snapshot  JSONB NOT NULL,
  manifest           JSONB NOT NULL,
  receipt            JSONB NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_metadata_delivery_exports_owner_track_created
  ON public.metadata_delivery_exports (user_id, project_id, track_id, created_at DESC);

ALTER TABLE public.metadata_delivery_exports ENABLE ROW LEVEL SECURITY;

-- This is an API/service-role evidence ledger. Routes must prove project and
-- track ownership using the caller's session before the service role inserts
-- or reads a row. No browser role can select or mutate the ledger directly.
REVOKE ALL ON TABLE public.metadata_delivery_exports FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.metadata_delivery_exports IS
  'Append-only server-side evidence for generated metadata delivery copies. A new correction creates a new row and artifact path; application routes never update or delete historical rows.';

NOTIFY pgrst, 'reload schema';
