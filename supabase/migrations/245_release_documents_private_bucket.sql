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
-- Readers of this bucket today:
--
--   - GET /api/vault/[projectId]/documents/[docId]/file, which signs a
--     vault_documents.file_url path for 10 minutes after an RLS-backed read
--     of the row;
--   - lib/sync-library/hub-access.ts, which signs the blanket agreement PDF
--     from document_data.esign.signedFileUrl for 2 hours;
--   - nothing reads esign_envelopes.executed_file_path, certificate_path or
--     audit_log_path yet. Those objects are written by the webhook and have
--     no download surface (follow-up).
--
-- Every reader uses a server-issued signed URL, so this bucket needs NO
-- storage.objects policy for anon or authenticated. That differs from
-- `vault-contracts` in migration 011, which has a session-client writer and
-- therefore per-user policies. This migration creates no storage policy and
-- grants nothing.
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

-- No storage.objects policy is created, changed or dropped here. Production
-- was read on 2026-10-18 and storage.objects carries only vault_assets_* and
-- vault_contracts_* policies, none of which mention release-documents. B2
-- below lists any policy that does, so a hand-made one is surfaced for the
-- owner to judge instead of being dropped by a catalog-driven loop.

-- Migration 023 described file_url as a public Storage URL. That has not been
-- true for the contract and split-sheet writers for some time, and it stops
-- being true for the last writer (the signed PDF upload) with this change.
COMMENT ON COLUMN public.vault_documents.file_url IS
  'Storage object PATH, not a URL. The bucket is vault-contracts when source = ''uploaded'' and release-documents otherwise (vaultDocumentBucket in lib/vault/documents.ts). Served only through GET /api/vault/[projectId]/documents/[docId]/file as a 10 minute signed URL. Migration 023 called this a public URL; that stopped being true with migration 245.';

-- ─── (2) Only the service role may write file_url or source ──────────────
--
-- GET .../documents/[docId]/file signs whatever string vault_documents.file_url
-- holds, with the service client. Owners and co-owners can write file_url and
-- source through PostgREST (236 keeps both inside the full-authority tier and
-- returns early for them). So an owner could point their own row at another
-- user's object path and receive a signed URL for it.
--
-- The fix is on the write side. The client never legitimately chooses either
-- column, because every writer goes through the service client:
--
--   - the signed PDF upload route (service client after its ownership check);
--   - app/api/contracts/verify (service client for the row insert);
--   - the DocuSeal webhook fan-out in lib/split-sheets/distribution.ts.
--
-- No session-client path sets file_url or source, and none resets file_url to
-- NULL (the PATCH route changes status and signed_at only). So the guard is
-- strict: a client may not insert a row that carries a file_url, and may not
-- change file_url or source on an existing row. A client INSERT that names
-- source = 'uploaded' without a file_url is harmless; it still cannot gain a
-- file without passing through the service role.
--
-- auth.role(), not current_user: see migrations 209 and 231. NULL means a
-- direct database session (migrations, the SQL editor); 'service_role' means
-- the service client. SECURITY INVOKER is enough because the function reads
-- only NEW, OLD and the connection's own request claims.
CREATE OR REPLACE FUNCTION public.vault_documents_guard_file_url()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT := (SELECT auth.role());
  v_privileged BOOLEAN := v_role IS NULL OR v_role = 'service_role';
  v_changing BOOLEAN :=
    (TG_OP = 'INSERT' AND NEW.file_url IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND (
      NEW.file_url IS DISTINCT FROM OLD.file_url
      OR NEW.source IS DISTINCT FROM OLD.source
    ));
BEGIN
  IF v_changing AND NOT v_privileged THEN
    RAISE EXCEPTION 'vault_documents.file_url and vault_documents.source can only be written by the service role'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.vault_documents_guard_file_url() IS
  'BEFORE INSERT OR UPDATE guard on public.vault_documents (migration 245). Rejects a non-null file_url on INSERT and any change to file_url or source on UPDATE unless auth.role() is NULL (direct database session) or service_role. Closes the path where an owner points file_url at another user''s storage object and has GET .../documents/[docId]/file sign it. Same auth.role() idiom as migrations 209 and 231.';

REVOKE EXECUTE ON FUNCTION public.vault_documents_guard_file_url() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS vault_documents_guard_file_url ON public.vault_documents;

CREATE TRIGGER vault_documents_guard_file_url
  BEFORE INSERT OR UPDATE ON public.vault_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.vault_documents_guard_file_url();

COMMENT ON TRIGGER vault_documents_guard_file_url ON public.vault_documents IS
  'Only the service role (or a direct database session) may set file_url or change source on vault_documents. Migration 245.';

NOTIFY pgrst, 'reload schema';

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
--
--   G1  MUST FAIL 42501 -- an authenticated owner runs
--         UPDATE public.vault_documents SET file_url = 'someone-else/x.pdf' ...
--       and also UPDATE ... SET source = 'uploaded' ...
--   G2  MUST FAIL 42501 -- an authenticated owner INSERTs a row with a
--       non-null file_url
--   G3  MUST SUCCEED -- the same statements through the service client, and
--       the signed PDF upload flow end to end from the app
--   G4  MUST SUCCEED -- an authenticated owner INSERTs a pending row with no
--       file_url (the "Generate document" flow)
