---
plan_id: 02-01
phase: 02
status: complete
completed_at: 2026-06-28
commit: 0880245
---

## Delivered

- `supabase/migrations/023_vault_documents_file_url.sql` — adds file_url TEXT and signed_by TEXT to vault_documents with partial index on signed rows. **Apply manually in Supabase SQL Editor before Wave 2 UI lands.**
- `lib/vault/documents.ts` — VaultDocument type, storage constants, uploadSignedPdf() with PDF MIME + 5MB size validation
- `app/api/vault/[projectId]/documents/[docId]/upload/route.ts` — POST handler: auth gate → triple-eq ownership check → uploadSignedPdf() → atomic update to status=signed with signed_at, file_url, signed_by
- `lib/profile/load.ts` — added genres: [] to DEMO_PROFILE to fix TypeScript build error

## Notes

- Uploading a PDF is the signing action — no manual status override accepted by this route
- DOC-03 (readiness gates on signed status) confirmed already correct in the DB trigger; this route makes the gate real
- TypeScript build passes (strict mode)

## Blocking gate for Wave 2

Migration 023 must be applied in Supabase SQL Editor before plan 02-02 is executed:
```sql
-- from supabase/migrations/023_vault_documents_file_url.sql
ALTER TABLE vault_documents
  ADD COLUMN IF NOT EXISTS file_url   TEXT,
  ADD COLUMN IF NOT EXISTS signed_by  TEXT;

CREATE INDEX IF NOT EXISTS idx_vault_docs_signed
  ON vault_documents (project_id, status)
  WHERE status = 'signed';
```
