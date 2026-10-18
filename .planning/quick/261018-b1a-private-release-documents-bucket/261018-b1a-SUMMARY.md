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

## Review fixes

Follow-up commits after the adversarial review of PR #192 (`eccb1aa2`, `3cf50a81`, `e77c6d82`, `4b660a13`). Migration 245 is still unapplied, so it was edited in place.

1. **file_url / source write guard.** Owners and co-owners could write `file_url` and `source` through PostgREST (236 returns early for full authority), so `/file` could be made to sign another user's object. 245 now adds `vault_documents_guard_file_url` (BEFORE INSERT OR UPDATE, SECURITY INVOKER, `search_path = ''`, `auth.role()` idiom from 209/231): a non-null `file_url` on INSERT, or any change to `file_url` or `source` on UPDATE, is rejected unless `auth.role()` is NULL or `service_role`. Writer audit (grep of every insert/update/upsert/delete on `vault_documents` under app, lib, components, plus SQL): the upload route and `app/api/contracts/verify` used the SESSION client for file_url, so both now write through the service client after their ownership checks (upload keeps id, project_id and user_id filters). The DocuSeal fan-out, `mint-agreement` and the webhook already use the service client. The PATCH route changes status and signed_at only, DELETE and the other inserts never set file_url, and no RPC or trigger writes either column, so no reset-to-NULL path needed handling. `/file` also refuses empty, leading-slash, `..`, `.`, backslash and empty-segment paths (404). The documents page no longer ships the path to the browser: stage3 collapses `file_url` into `has_file` and DocumentCard uses that.
2. **Policy DROP loop removed from 245.** The footer query B2 still lists any policy that mentions the bucket.
3. **PDF magic check.** `uploadSignedPdf` reads the first 5 bytes and rejects anything not starting `%PDF-` (route returns 400).
4. **Orphan cleanup.** A failed row update removes the newly stored object. After a successful update the previous object is removed, but only when its path is `{user}/{project}/{doc}-...` (written by this route for this doc). Split-sheet fan-out rows share one executed PDF across parties, so removing an arbitrary old `file_url` would delete other parties' evidence. Removal failures go to Sentry with no path and never fail the request.
5. **Missing object.** `createSignedUrl` errors with 404 status, statusCode `'404'` or an "not found" message now return 404, not 500.
6. **Stale comments.** `stage3.ts` (path, not public URL), `distribution.ts` (paths), `sync-library/page.tsx` (hub-access signs for 2 hours, not DocumentCard's idiom), 245 header (readers: `/file` 10 min, hub-access 2 h, `esign_envelopes` paths have no reader).
7. **CONTRACT_BUCKET.** `contracts/verify` uses it in all three places; a test asserts the writers and `vaultDocumentBucket` agree.
8. **Fixtures.** `distribution.test.ts` uses `initiator-1/split-sheets/sheet-1/executed-envelope-1.pdf` style paths.
9. **Tests.** Session query filters by `id` and `project_id` and not `user_id`; migration-245 text test covers the trigger (idiom, INSERT and UPDATE, file_url and source, REVOKE, no `current_user`).

Verification: `npm run security:migrations:verify` PASS (214-218); `npm test` 666 suites / 8404 tests passed, 0 failed; `npm run lint` clean; `npm run typecheck:strict` clean.

Owner-run checks added to the 245 footer: G1 to G4 (owner UPDATE and INSERT of file_url must fail 42501; service client and the pending-row insert must succeed). The trigger is text-tested only, not run against Postgres.
