---
created: 2026-10-18T00:00:00Z
title: Apply and verify migration 245 (private release-documents bucket)
area: ops
files:
  - supabase/migrations/245_release_documents_private_bucket.sql
  - lib/vault/documents.ts
  - app/api/vault/[projectId]/documents/[docId]/file/route.ts
---

## Status

Migration 245 is authored and committed, not applied. Production has no `release-documents` bucket, so DocuSeal webhook writes and the signed PDF upload fail until it is applied.

Apply order: 243 and 244 exist on unmerged branches. Merge or apply them first so the migration ledger stays ordered, then push 245 (`supabase db push`). Deploy the app change in the same window: the upload route now stores a storage path in `vault_documents.file_url`, and the card's "View PDF" link goes through the new `/file` route.

## Verify after applying

1. Bucket row:
   `SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'release-documents';`
   Expect `public = false`, `20971520`, `{application/pdf}`.
2. No hand-made policies left:
   `SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND (coalesce(qual, '') ILIKE '%release-documents%' OR coalesce(with_check, '') ILIKE '%release-documents%');`
   Expect 0 rows.
3. Anonymous read is refused:
   `curl -s -o /dev/null -w '%{http_code}\n' '<SUPABASE_URL>/storage/v1/object/public/release-documents/any/path.pdf'`
   Expect 400 or 404, not 200.
4. Signed link through the app: upload a signed PDF on a vault document, click "View PDF", confirm a 302 to a signed URL that stops working after about 10 minutes.
