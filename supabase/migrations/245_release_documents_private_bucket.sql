-- 245_release_documents_private_bucket.sql
--
-- Provision the private `release-documents` Storage bucket.
--
-- Production storage.buckets has no `release-documents` row (checked
-- 2026-10-18), so every write to DOC_BUCKET fails today. The writers are:
--
--   - the DocuSeal webhook (executed PDFs, certificate of completion, audit
--     log, split-sheet executed PDF), all through the service client;
--   - lib/vault/documents.ts uploadSignedPdf, which this same change moves
--     from the session client to the service client, after the upload
--     route's ownership check.
--
-- Every reader goes through a server-issued signed URL
-- (GET /api/vault/[projectId]/documents/[docId]/file, 10 minute lifetime).
-- So this bucket needs NO storage.objects policy for anon or authenticated.
-- That differs from `vault-contracts` in migration 011, which has a
-- session-client writer and therefore per-user policies. This migration
-- creates no policy and grants nothing.
--
-- Limits:
--   - file_size_limit 20971520 (20 MB) matches vault-contracts in 011. It is
--     4x the 5 MB cap the upload route enforces in lib/vault/documents.ts, and
--     it is the only cap on DocuSeal-produced executed PDFs and audit logs,
--     which Funun does not size.
--   - allowed_mime_types is PDF only. Every writer passes
--     contentType 'application/pdf', including the audit log.
--
-- ON CONFLICT forces `public = false` as a literal. If someone created a
-- public bucket of this id by hand, applying this migration flips it private.
--
-- No row needs migrating: esign_envelopes and vault_documents both have 0
-- rows in production.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'release-documents',
  'release-documents',
  false,
  20971520, -- 20 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No migration on this branch ever created a storage.objects policy for this
-- bucket (062 and 065 mention it in comments only). Anything found here was
-- made by hand, and the signed-link design does not use it, so drop it.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        coalesce(qual, '') ILIKE '%release-documents%'
        OR coalesce(with_check, '') ILIKE '%release-documents%'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname);
    RAISE NOTICE 'dropped hand-made storage.objects policy: %', r.policyname;
  END LOOP;
END;
$$;

-- Migration 023 described file_url as a public Storage URL. That has not been
-- true for the contract and split-sheet writers for some time, and it stops
-- being true for the last writer (the signed PDF upload) with this change.
COMMENT ON COLUMN public.vault_documents.file_url IS
  'Storage object PATH, not a URL. The bucket is vault-contracts when source = ''uploaded'' and release-documents otherwise (vaultDocumentBucket in lib/vault/documents.ts). Served only through GET /api/vault/[projectId]/documents/[docId]/file as a 10 minute signed URL. Migration 023 called this a public URL; that stopped being true with migration 245.';

-- ─── OWNER-RUN VERIFICATION ───────────────────────────────────────────────
--
--   B1  SELECT id, public, file_size_limit, allowed_mime_types
--         FROM storage.buckets WHERE id = 'release-documents';
--       expect: public = false, 20971520, {application/pdf}
--
--   B2  SELECT policyname FROM pg_policies
--        WHERE schemaname = 'storage' AND tablename = 'objects'
--          AND (coalesce(qual, '') ILIKE '%release-documents%'
--               OR coalesce(with_check, '') ILIKE '%release-documents%');
--       expect: 0 rows
--
--   B3  curl -s -o /dev/null -w '%{http_code}\n' \
--         '<SUPABASE_URL>/storage/v1/object/public/release-documents/any/path.pdf'
--       expect: 400 or 404, NOT 200
--
--   B4  After a document exists: open it from the vault documents page
--       ("View PDF") and confirm a 302 to a signed URL that expires after
--       about 10 minutes.
