---
phase: 261018-b1a
plan: 01
status: complete
subsystem: vault-documents
tags: [storage, signed-urls, migrations, security]
requirements: [QUICK-261018-B1A]
key-files:
  created:
    - supabase/migrations/245_release_documents_private_bucket.sql
    - app/api/vault/[projectId]/documents/[docId]/file/route.ts
    - __tests__/migration-245-release-documents-private-bucket.test.ts
    - __tests__/vault-document-signed-link.test.ts
    - .planning/todos/pending/261018-b1a-push-and-verify-migration-245.md
  modified:
    - lib/vault/documents.ts
    - app/api/vault/[projectId]/documents/[docId]/upload/route.ts
    - components/vault/DocumentCard.tsx
    - app/(artist)/vault/[projectId]/documents/page.tsx
migration_applied: false
---

# Quick 261018-b1a: private release-documents bucket and signed document links

Migration 245 defines the missing private `release-documents` bucket (not applied), the signed-PDF upload now stores a storage path instead of a public URL, and vault documents open through an RLS-authorized route that issues a 10-minute signed URL.

## What changed

- **Migration 245**: inserts the bucket (private, 20 MB, PDF only). `ON CONFLICT` sets `public = false` as a literal, so a hand-made public bucket of the same id flips private. A DO block drops any hand-made `storage.objects` policy that mentions the bucket. No policy is created and nothing is granted. Adds a `COMMENT ON COLUMN vault_documents.file_url` saying it holds a storage path, bucket by source.
- **`lib/vault/documents.ts`**: adds `vaultDocumentBucket(source)` (`uploaded` maps to `vault-contracts`, anything else to `release-documents`), `CONTRACT_BUCKET`, `DOC_LINK_TTL_SECONDS = 600`. `uploadSignedPdf` now takes a `bucket`, uses the service client, `upsert: false`, and returns `{ path }` only.
- **Upload route**: selects `source`, uploads into `vaultDocumentBucket(existing.source)`, writes the path to `file_url`. Ownership check unchanged and still runs first.
- **`GET .../documents/[docId]/file`**: UUID-validates params, 401 without a session, reads the row with the session client so RLS decides visibility, 404 for no row / no path / legacy http(s) value, then 302 to a signed URL (service client, 600 s, `Cache-Control: no-store`). 500 with a generic message if signing fails.
- **DocumentCard / documents page**: "View PDF" points at the `/file` route; the page now selects `file_url, signed_at` (before this, the card never learned a file existed, so the link was dead).

## Column decision (label-integrity)

Kept `file_url`, did not add `file_path`. Two of the three writers already stored paths, and the column is load-bearing in the `vault_documents_status_requires_evidence_chk` check (045/049), the 236 BEFORE UPDATE guard, 193's allowlist RPCs, `lib/split-sheets/distribution.ts` and `lib/vault/stage3.ts`. A rename is not a quick task. 245's column comment states what the column carries, and `vaultDocumentBucket` is the single place that turns (source, path) into a bucket. The rename is a follow-up.

## Owner apply step for migration 245

Migration 245 is committed, NOT applied anywhere.

1. Merge or apply 243 and 244 first (they are on unmerged branches) so the ledger stays ordered.
2. `supabase db push` to apply 245, and deploy the app change in the same window (the upload route now stores paths; the card links to `/file`).
3. Run the verification in `.planning/todos/pending/261018-b1a-push-and-verify-migration-245.md` (also the trailing block of the migration): bucket row is private / 20971520 / `{application/pdf}`, zero hand-made policies, anonymous public URL returns 400 or 404, and "View PDF" 302s to a signed URL that expires in about 10 minutes.

## Verification

| Gate | Result |
|------|--------|
| `npm run security:migrations:verify` | PASS (migrations 214-218) |
| `npx jest` migration-245 test | 7 passed |
| `npx jest` vault-document-signed-link test | 26 passed |
| Upload-path regression suites (upload-route-admission, upload-intent-fail-closed-routes, adversarial-review-fixes) with the new test | 42 passed across 4 suites |
| `npm test` (full) | 666 suites passed, 8369 tests passed, 0 failed |
| `npm run lint` | clean (`--max-warnings=0`) |
| `npm run typecheck:strict` | exit 0 |
| `git diff --name-only origin/main -- supabase/migrations` | only `245_release_documents_private_bucket.sql` |

## Deviations from Plan

- Worktree HEAD was at `90a3c460` when the executor started, not the required base; reset to `fc4c71e5` per the branch check before any work.
- Added one tiny follow-up commit to spell the em dash check in the 245 test without the literal character (new lines must not carry one).
- `grep -rn getPublicUrl lib/vault app/api/vault` still matches `app/api/vault/[projectId]/assets/route.ts:106`. That route serves the public `vault-assets` bucket and is unrelated to documents; left as is. Nothing in the signed-PDF path calls `getPublicUrl`.

Otherwise the plan ran as written.

## Follow-ups

1. Rename `vault_documents.file_url` to a path-named column across 045/049's check, 236's guard, 193's RPCs, `distribution.ts` and `stage3.ts`.
2. Shorten the 2 h TTL in `lib/sync-library/hub-access.ts` (blanket agreement signed URL), or route it through `/file`.
3. A download surface for `esign_envelopes` `executed_file_path` / `certificate_path` / `audit_log_path` (token-link parties, P17-06). No app code reads them today.
4. Rename stage3's `file_url` presence flag to `hasFile`.
5. Owner applies 245 after 243/244 and runs the verification block (above).

## Known stubs

None.

## Threat flags

None beyond the plan's register. T-b1a-01 through T-b1a-06 are mitigated as specified (private bucket with literal `public = false`, RLS-gated session read before signing, ownership check before the service-client upload, http(s) values refused, 600 s TTL with `no-store`, no client storage policies).
