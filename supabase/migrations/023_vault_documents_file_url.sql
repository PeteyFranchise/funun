-- ─── Migration 023: Add file_url and signed_by to vault_documents ────────────
--
-- signed_at already exists from 001_initial_schema.sql — this migration only
-- adds the two new columns for upload-backed signing:
--
--   file_url  — the public Supabase Storage URL of the uploaded signed PDF.
--               NULL until an artist uploads a file via the upload route.
--               Set by POST /api/vault/[projectId]/documents/[docId]/upload.
--
--   signed_by — denormalized text snapshot of who performed the upload action,
--               recorded as the auth user's email at upload time.
--               NULL until an artist uploads a file. Not a FK — kept simple
--               so the record survives auth user deletion.
--
-- No RLS changes needed:
--   vault_documents already has USING (auth.uid() = user_id) policy.
--
-- No trigger changes needed:
--   calculate_vault_readiness already gates on status = 'signed'.
--   The upload route is what makes that gate meaningful — it replaces
--   the manual status dropdown for upload-backed documents.
--
-- Run via: Supabase SQL Editor → paste this file → Run

ALTER TABLE vault_documents
  ADD COLUMN IF NOT EXISTS file_url   TEXT,
  ADD COLUMN IF NOT EXISTS signed_by  TEXT;

-- Partial index: efficient query for signed documents per project.
CREATE INDEX IF NOT EXISTS idx_vault_docs_signed
  ON vault_documents (project_id, status)
  WHERE status = 'signed';
