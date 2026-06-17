-- ============================================================
-- 011 — Contract Locker: external upload + AI verification
-- Adds source/verification fields to vault_documents and a private
-- storage bucket for uploaded contract PDFs. Lets artists bring their
-- own agreements (generated outside Funūn) and have the AI check them
-- for completeness/accuracy (NOT legal review).
-- Idempotent. Run via: supabase db push (or the management query API).
-- ============================================================

ALTER TABLE vault_documents
  ADD COLUMN IF NOT EXISTS source              TEXT NOT NULL DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS file_url            TEXT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verification_checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS verification_summary TEXT,
  ADD COLUMN IF NOT EXISTS verified_at         TIMESTAMPTZ;

-- Constrain the new enums (drop+add so re-runs are safe).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vault_documents_source_chk') THEN
    ALTER TABLE vault_documents
      ADD CONSTRAINT vault_documents_source_chk CHECK (source IN ('generated', 'uploaded'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vault_documents_verstatus_chk') THEN
    ALTER TABLE vault_documents
      ADD CONSTRAINT vault_documents_verstatus_chk
      CHECK (verification_status IN ('unverified', 'verifying', 'verified', 'failed'));
  END IF;
END $$;

-- ─── Private bucket for uploaded contract PDFs ───────────────────────
-- Path layout: {user_id}/{project_id}/{filename}. Private (no public
-- reads) — the app serves files via signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vault-contracts',
  'vault-contracts',
  false,
  20971520, -- 20 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "vault_contracts_select_own" ON storage.objects;
DROP POLICY IF EXISTS "vault_contracts_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "vault_contracts_update_own" ON storage.objects;
DROP POLICY IF EXISTS "vault_contracts_delete_own" ON storage.objects;

CREATE POLICY "vault_contracts_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'vault-contracts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "vault_contracts_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vault-contracts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "vault_contracts_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'vault-contracts' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'vault-contracts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "vault_contracts_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'vault-contracts' AND (storage.foldername(name))[1] = auth.uid()::text);
