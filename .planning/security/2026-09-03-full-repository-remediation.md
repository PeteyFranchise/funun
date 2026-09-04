# Funūn Full Repository Audit Remediation Handoff

**Remediation date:** 2026-09-03

**Source audit:** `.planning/security/2026-09-03-full-repository-audit.md`

**Status:** Implemented and locally verified; migrations 172–175 applied to the linked production Supabase project
**Scope:** 1 Critical, 12 Medium, and 4 Low findings

## Outcome

All 17 confirmed audit findings are addressed in the current working tree.
The four fix-forward migrations were applied in numeric order before the
application release. Existing migrations 169–171 were not rewritten.

The remediation deliberately preserves the legacy raw Selects telemetry tables.
New writes and readers use bounded 90-day daily aggregates, but migration 173
does not silently delete historical analytics. Retention or archival of those
legacy rows is a separate operational decision.

## Critical

### C-01 — DocuSeal numeric completion identifiers: fixed

- `lib/esign/webhook.ts` normalizes supported non-empty string and finite numeric
  submission identifiers, including nested provider payload shapes.
- `app/api/webhooks/docuseal/route.ts` returns a retryable error for a verified
  completion event with a missing identifier instead of acknowledging it as an
  ignored success.
- Provider-realistic numeric fixtures, malformed JSON, retry behavior, split
  sheet completion, and blanket-agreement completion are covered by tests.

## Medium

### M-01 — Contributor mutation of owner-only graduation linkage: fixed

- Migration 172 installs a database trigger that rejects a
  `graduated_project_id` change by anyone other than the work owner while
  retaining internal service workflows.

### M-02 — Non-transactional split replacement and writer promotion: fixed

- Migration 172 adds service-only transactional functions for split-party
  replacement and member admission plus optional writer promotion.
- Split-sheet, catalogue split import, and Writer's Room membership routes now
  use those functions and check all reads and writes before reporting success.

### M-03 — Multipart parsing before authentication and durable admission: fixed

- Audited multipart routes authenticate before parsing.
- Migration 175 and `lib/security/upload-admission.ts` enforce durable per-user
  daily count, byte, concurrency, idempotency, and declared-length controls.
- Track audio now uses an authenticated upload intent, a browser-to-storage
  signed upload, and an ownership/path/size/type-validated completion call.

### M-04 — Paid AI spend, concurrency, timeout, and idempotency controls: fixed

- Migration 173 adds a durable AI claim ledger, per-user daily/concurrency
  ceilings, a global daily ceiling, a platform kill switch, short leases, and
  idempotency keys.
- `lib/ai/admission.ts` fails closed when the ledger is unavailable and supplies
  a 45-second provider abort signal.
- Every audited Anthropic route claims and finishes usage around its provider
  call, including tools, PitchPlug, documents, campaigns, pitch drafting,
  contracts, buyer briefs, tag suggestions, and Selects drafting.

### M-05 — Unbounded Selects telemetry and application-memory rollups: fixed

- Migration 173 backfills recent data into bounded daily aggregate tables,
  serializes writes per Selects link, limits aggregate cardinality, and applies
  a rolling 90-day retention window to new aggregates.
- Public telemetry writes go through a service-only database function.
- Staff and leadership readers use SQL summaries instead of loading raw event
  history into Node memory.
- Legacy raw tables are retained as a non-growing historical archive.

### M-06 — Resend bounce failures acknowledged as success: fixed

- The Resend webhook checks both database errors and whether a recipient row was
  affected. Transient persistence failures return 5xx; unknown recipients are
  explicitly treated as idempotent ignored events.

### M-07 — Blanket-agreement completion race and partial fan-out: fixed

- Migration 172 adds lease-based claim/release functions and one transaction for
  document completion plus listing advancement.
- The webhook checks every result and includes a service-only reconciliation
  function for previously signed agreements with lagging listings.

### M-08 — Partial Ideas recording, branch, and collection writes: fixed

- Migration 172 moves recording-plus-marker completion, branching, collection
  membership, and removal into service-only transactions.
- Recording completion is serialized by recording ID; branch creation uses a
  stable request ID, source-row locking, and a post-lock duplicate check.
- Routes now return errors rather than acknowledging partial persistence.

### M-09 — Incorrect Global Capture recording provenance: fixed

- The fix-forward `add_idea_recording_to_work` function preserves the source
  recording creator and the immutable idea/recording/work/version link.

### M-10 — AI Selects draft reports non-persisted rows: fixed

- Migration 173 persists revives, inserts, notes, and the optional cover note in
  one service-only transaction.
- The route returns only the database function's persisted result.

### M-11 — Audio object deletion before durable database state: fixed

- Replacement uploads to a unique immutable path, moves the database pointer,
  then removes the prior object.
- Failed database updates remove only the new object.
- Deletion clears the database pointer before best-effort storage cleanup.

### M-12 — Vulnerable production dependency graph: fixed

- Compatible lockfile resolutions install patched `browserslist`, `fast-uri`,
  `brace-expansion`, `nanoid`, `postcss`, `qs`, and `sharp` releases without a blind major
  framework upgrade.
- Next.js is resolved to 15.5.23.
- Both the full and production-only offline npm audits report zero known
  vulnerabilities in the installed lockfile.

## Low

### L-01 — Manual HTML toast escaping: fixed

- Selects notifications now render React text nodes. The
  `dangerouslySetInnerHTML` sink and manual escaping convention were removed.

### L-02 — Arbitrary-user membership helper oracles: fixed

- Migration 174 binds direct authenticated helper calls to `auth.uid()` while
  preserving service-role and trigger-time internal relationship checks needed
  by RLS and notifications.

### L-03 — Avatar and cover-art false success/orphan objects: fixed

- Uploads use unique object paths, check affected database rows, remove new
  objects on database failure, and clean old profile images only after the new
  pointer is durable.
- Cover-art project attachment is checked; a failed attachment rolls back the
  asset row and new object.

### L-04 — Strict TypeScript dead-code failures: fixed

- All audited unused imports, props, parameters, and constants were removed or
  corrected.
- `.github/workflows/quality.yml` now enforces strict TypeScript, lint, the full
  Jest suite, and a production dependency audit.

## Deployment Order

The database prerequisite was completed against linked project
`wgfjakfiyeewzfuxkgyo` before the application commit was pushed.

```bash
cd /Users/peterzora/Desktop/funun
npm run db:push
npm run typecheck:strict
npm run lint
npm test -- --runInBand
npm run build
npm audit --omit=dev
```

Audit remediation migrations:

1. `supabase/migrations/172_audit_integrity_hardening.sql`
2. `supabase/migrations/173_ai_and_selects_abuse_controls.sql`
3. `supabase/migrations/174_membership_helper_privacy.sql`
4. `supabase/migrations/175_upload_admission.sql`

Production migration record on 2026-09-03: migration 171 and remediation
migrations 172–175 applied successfully. A follow-up dry run should report the
remote schema as current before the application release.

## Post-Deployment Reconciliation

Run the following read-only checks in the target Supabase SQL editor.

### Graduation links whose project owner does not match the work owner

```sql
SELECT
  work.id AS work_id,
  work.user_id AS work_owner_id,
  work.graduated_project_id,
  project.user_id AS project_owner_id
FROM public.works AS work
JOIN public.vault_projects AS project
  ON project.id = work.graduated_project_id
WHERE work.graduated_project_id IS NOT NULL
  AND project.user_id IS DISTINCT FROM work.user_id;
```

Expected result: zero rows. Investigate any result before changing data.

### Signed blanket agreements with listings still awaiting agreement completion

```sql
SELECT
  document.id AS document_id,
  document.user_id,
  count(listing.id) AS listings_needing_reconciliation
FROM public.vault_documents AS document
JOIN public.sync_listings AS listing
  ON listing.artist_user_id = document.user_id
WHERE document.type = 'blanket_agreement'
  AND document.status = 'signed'
  AND listing.status IN ('applied', 'invited', 'agreement_pending')
GROUP BY document.id, document.user_id
ORDER BY listings_needing_reconciliation DESC;
```

Expected result: zero rows. For a reviewed row, a privileged operator can call
`reconcile_blanket_agreement_listings(document_id)` rather than manually editing
individual listings.

### Historical DocuSeal completions

Review provider delivery logs for signed completion events received before this
fix. Replay numeric-ID events where the matching Funūn document or split sheet
is still pending. If provider replay is unavailable, compare provider submission
IDs with `document_data.esign.requestId` and reconcile under an operator-approved
runbook; do not mark legal documents signed from an unverified event.

### Legacy Selects telemetry

Migration 173 does not delete the raw tables. Decide separately whether rows
older than 90 days should be exported, retained, or deleted under the product's
analytics/privacy policy.

## Runtime Controls To Confirm

- Keep `NEXT_PUBLIC_VAULT_DEMO` disabled in production.
- Confirm `ai_usage_policy.enabled = true` and set an intentional
  `global_daily_unit_limit` before opening AI generation to users.
- Confirm Supabase Storage bucket MIME/size policies and the platform's ingress
  request-size controls agree with application limits.
- Verify one real DocuSeal numeric-ID completion and one Resend hard-bounce in a
  staging or controlled production smoke test.

## Verification Completed Locally

- `npm run typecheck:strict` — pass
- `npm run lint` — pass, zero warnings
- `npm test -- --runInBand` — pass, 424 suites / 4,077 tests
- `npm run build` — pass, Next.js 15.5.23, 122 pages generated
- `npm audit --offline --omit=dev --json` — pass, 0 vulnerabilities
- `npm audit --offline --json` — pass, 0 vulnerabilities
- npm 10 and npm 11 clean-install lockfile validation — pass
- `git diff --check` — pass

Database migration tests in this repository are structural contract tests. The
transaction, RLS, and concurrency behavior still requires a staging smoke test
against a real migrated Supabase project.

## Next-Session Copy/Paste Handoff

> Read `.planning/security/2026-09-03-full-repository-audit.md`,
> `.planning/security/2026-09-03-full-repository-remediation.md`, and
> `.planning/quick/260903-full-audit-remediation/SUMMARY.md` completely. All 17
> audit findings have been remediated in the working tree. Preserve unrelated
> Writer's Room, Ideas, Global Capture, Lyric Lift, navigation, cron, and jobs
> changes. First confirm migrations 172–175 are present and applied in order;
> do not rewrite applied migrations. Run strict TypeScript, lint, full Jest,
> build, and dependency audit. Then perform staging smoke tests for direct
> contributor graduation denial, split/member transactional rollback, signed
> track-audio intent/completion, AI daily and concurrency denial, Selects
> telemetry capacity, numeric-ID DocuSeal completion/replay, Resend retry on
> persistence failure, and the read-only reconciliation queries. Do not deploy,
> mutate historical legal state, commit, or push without explicit approval.
