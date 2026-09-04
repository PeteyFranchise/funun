# Funūn Full Repository Security And Architecture Audit

> **Remediation status (2026-09-03):** All 17 findings are addressed in the
> current working tree. The fixes require migrations 172–175 before the
> application changes are deployed. See
> `.planning/security/2026-09-03-full-repository-remediation.md` for the
> finding-by-finding handoff, deployment order, reconciliation checks, and
> completed verification.

**Audit date:** 2026-09-03

**Audited commit:** `232b9e914966e2ccdbcc95ea4bba1a53d02c851f` (`main`)

**Audited state:** Current working tree, including uncommitted Ideas, Global Capture, and Lyric Lift work

**Available refs reviewed:** `main`, seven local feature/Claude branches, and three remote-tracking refs
**Method:** Read-only architecture/security review plus static checks and the full automated test suite. Application code was not changed.

## Executive Summary

The audit confirmed **1 Critical, 12 Medium, and 4 Low** findings. The most urgent defect is at the DocuSeal trust boundary: documented numeric submission IDs are discarded by the webhook parser, and the route acknowledges those completion events with HTTP 200. A real signed document can therefore remain permanently pending in Funūn with no provider retry.

The next material risks are authorization and consistency defects around Writer's Room works, split sheets, audio replacement, and webhook fan-out. Several public or authenticated endpoints also perform expensive parsing, AI calls, or unbounded event persistence without a durable quota. The current uncommitted Ideas work contains two transaction/provenance defects that should be corrected before it is committed or deployed.

Positive controls found during the audit:

- No committed production secret was found. `.env.local` is ignored; matching committed values were placeholders or test fixtures.
- No `eval`, `new Function`, or application `child_process` execution sink was found.
- Every inspected `SECURITY DEFINER` function sets an explicit `search_path`.
- Ordinary TypeScript checking, linting, and all 4,015 tests pass.
- Every available non-`main` ref is already an ancestor of `main`; no branch-only application delta was omitted.

## Critical

### C-01 — Valid DocuSeal completion webhooks are silently acknowledged and discarded

- **Confidence:** High
- **Category:** Security boundary / legal-document integrity / webhook reliability
- **Files:**
  - `lib/esign/webhook.ts:70-93`
  - `app/api/webhooks/docuseal/route.ts:361-369`
  - `lib/esign/docuseal.ts:135-143`
  - `lib/esign/webhook.test.ts:89-100`
  - `lib/esign/docuseal.test.ts:58-77,356-376`
  - `__tests__/docuseal-webhook.test.ts:178-195`
- **Problem:** The parser accepts `data.id`, `data.submission_id`, and nested submission IDs only when their JavaScript type is `string`. DocuSeal represents submission IDs as numbers in its documented payloads, and the provider adapter already converts numeric IDs to strings elsewhere. A valid completed event therefore becomes `requestId: ''`. The route then returns HTTP 200 with `{ ignored: true }`.
- **Failure scenario:** DocuSeal sends a signed split sheet or blanket-agreement completion with `data.id: 123`. Funūn verifies the webhook signature, discards the numeric ID, acknowledges the event, and never completes the corresponding document, listing, or split-sheet state. Because the provider received 200, it has no reason to retry.
- **Impact:** Legally significant signatures can remain permanently pending; executed artifacts and downstream rights/readiness state are not recorded. The failure is silent and operationally difficult to detect.
- **Brief fix:** Normalize a finite numeric or non-empty string submission ID with `String(value)`. Parse the correct nested ID for every supported DocuSeal event shape. Treat a verified completion event with a malformed/missing identifier as a retryable processing failure, not a successful ignore.
- **Required regression tests:** Use provider-realistic numeric IDs in parser, adapter, and route tests; replay the same event twice; verify both split-sheet and blanket-agreement completion; verify malformed completed events do not return a success acknowledgment.
- **Migration/deployment concern:** None for the parser itself. After deploying, reconcile or replay completion events received while the defect existed.

## Medium

### M-01 — Writer's Room contributors can mutate owner-only graduation linkage through Supabase directly

- **Confidence:** High
- **Category:** Authorization / RLS
- **Files:**
  - `supabase/migrations/136_work_members.sql:190-208`
  - `supabase/migrations/135_works_core.sql:73-86`
  - `supabase/migrations/139_works_rls_hardening.sql:36-74`
  - `supabase/migrations/154_song_passport_graduation.sql:199-318`
  - `app/api/works/[workId]/route.ts:67-149`
  - `app/api/works/[workId]/passport/route.ts:169-179`
- **Problem:** The `works` UPDATE policy allows every work member to update a row and only protects `user_id`. PostgreSQL/RLS does not inherit the API route's field allowlist. A contributor using the authenticated Supabase client can update `graduated_project_id`, although the graduation API and RPC deliberately reserve graduation to the owner.
- **Failure scenario:** A contributor points `graduated_project_id` at a project they control or a known project ID. The owner's later graduation attempt fails the ownership/link checks, or the work records false release provenance until repaired.
- **Impact:** Persistent integrity violation and denial of the owner-only graduation workflow.
- **Brief fix:** Enforce column-level authorization in the database. Revoke broad UPDATE and grant only contributor-editable columns, or add a trigger/policy that permits `graduated_project_id` changes only through the owner/service graduation function.
- **Required regression tests:** With real authenticated JWTs, confirm a contributor can edit allowed creative fields but cannot change owner, archive, or graduation columns through direct PostgREST/Supabase calls.
- **Migration/deployment concern:** Requires a fix-forward migration and a query to detect existing member-authored graduation links.

### M-02 — Split-sheet replacement and writer promotion are non-transactional

- **Confidence:** High
- **Category:** Rights data integrity / concurrency
- **Files:**
  - `app/api/split-sheets/[id]/route.ts:239-262,311-321`
  - `lib/catalogue/splits-io.ts:119-138`
  - `app/api/works/[workId]/members/route.ts:159-239`
- **Problem:** Split parties are replaced with a delete followed by an insert. Status/reset metadata is updated later. Adding a Writer's Room member can also succeed before split-sheet promotion fails. These are compound state changes without a transaction or row lock.
- **Failure scenario:** An insert fails after deletion, erasing all parties. An update fails after new parties are inserted, leaving an approved/pending sheet attached to new rows with invalid approval tokens. A member invitation can be sent even though their writer/split record failed.
- **Impact:** Rights records can be lost or become internally contradictory; users may receive invitations for state that the API reported as failed.
- **Brief fix:** Move validation, party replacement, approval invalidation, and change-summary creation into a service-only transactional RPC with row locking. Make member creation plus writer promotion atomic before sending email.
- **Required regression tests:** Inject party-insert and status-update failures; run two concurrent edits; confirm rollback leaves the prior complete sheet unchanged; verify no invitation is sent for a rolled-back member.
- **Migration/deployment concern:** Requires a migration for the transactional RPC; audit pending/approved sheets whose parties were changed after approval.

### M-03 — Several upload endpoints parse large multipart bodies before authenticating

- **Confidence:** High
- **Category:** Denial of service / resource exhaustion
- **Files:**
  - `middleware.ts:77-79`
  - `app/api/contracts/verify/route.ts:39-53`
  - `app/api/vault/[projectId]/assets/route.ts:31-66`
  - `app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts:31-58`
  - `app/api/profile/avatar/route.ts:21-44`
- **Problem:** API routes are excluded from middleware authentication, and these handlers call `request.formData()` before validating the session. Limits of 10 MB, 20 MB, or 50 MB are checked only after Next.js has parsed/buffered the body.
- **Failure scenario:** An unauthenticated attacker sends many parallel multipart requests. Each request consumes body-parsing memory and CPU before returning 401.
- **Impact:** Avoidable memory pressure, latency, and serverless cost; enough concurrency can exhaust an instance.
- **Brief fix:** Authenticate and apply durable per-IP/per-user admission control before multipart parsing. For large audio, use the existing signed upload-intent pattern so application functions never buffer the file. Also enforce platform ingress limits.
- **Required regression tests:** Confirm unauthenticated requests are rejected without invoking multipart parsing/storage; load-test concurrent maximum-size attempts; verify quotas work across instances.

### M-04 — Paid AI routes lack a shared durable budget, concurrency ceiling, and consistent timeout

- **Confidence:** High
- **Category:** Abuse prevention / cost / availability
- **Files:**
  - `app/api/tools/[slug]/route.ts:36-99`
  - `app/api/tools/pitchplug/route.ts:43-107`
  - `app/api/vault/[projectId]/documents/generate/route.ts:49-120`
  - `app/api/launchpad/[projectId]/campaigns/route.ts:40-186`
  - `app/api/pitches/draft/route.ts:31-96`
  - `app/api/contracts/verify/route.ts:70-103`
  - `lib/security/rate-limit.ts:11-15,42-53`
- **Problem:** Multiple authenticated endpoints can issue high-token Anthropic requests repeatedly without a shared user/org allowance, concurrency limit, or spend kill switch. Most calls have no explicit timeout. The common in-memory limiter is per-instance and fails open, so it is not a durable control for paid operations.
- **Failure scenario:** One account loops campaign, document, pitch, contract, and tool endpoints in parallel, consuming model quota and keeping functions open. Horizontal scaling bypasses instance-local counters.
- **Impact:** Unbounded provider spend, quota exhaustion, and request saturation affecting other users.
- **Brief fix:** Add an atomic database-backed AI allowance keyed by user/org and operation, a global daily spend ceiling, per-user concurrency limits, explicit provider timeouts, and idempotency keys. Paid operations should fail closed if the durable budget service is unavailable.
- **Required regression tests:** Parallel requests across simulated instances; budget exhaustion; timeout/abort behavior; duplicate idempotency key; provider error without credit loss.

### M-05 — Public Selects telemetry can grow without bound and is aggregated in application memory

- **Confidence:** High
- **Category:** Performance / storage abuse / concurrency
- **Files:**
  - `app/api/selects/[token]/engagement/route.ts:39-120`
  - `supabase/migrations/132_selects_engagement.sql:58-120`
  - `lib/selects/engagement-rollup.ts:57-138`
  - `app/api/admin/client-partners/selects/[id]/engagement/route.ts:52-84`
- **Problem:** A public client supplies `viewerKey`; rotating it creates new per-viewer event capacity. Open events have no database cap or retention. The cap trigger uses count-then-insert without a lock, so concurrent inserts can exceed it. Leadership rollups load raw event rows into Node and aggregate them in arrays/maps.
- **Failure scenario:** A caller continuously rotates viewer keys and emits events at the public rate allowance. Raw tables grow indefinitely. Eventually an admin/leadership dashboard loads enough rows to time out or exhaust memory.
- **Impact:** Database growth, slower dashboards, higher query/function cost, and a practical availability attack against staff views.
- **Brief fix:** Issue a signed server viewer identifier, enforce a total per-token allowance and retention policy, serialize or aggregate writes, and move rollups to SQL/materialized daily aggregates with pagination.
- **Required regression tests:** Concurrent writes at the cap, viewer-key rotation, retention, and dashboard behavior with millions of synthetic events.
- **Migration/deployment concern:** Add indexes/retention or partitioning before backfilling aggregate tables; batch cleanup to avoid long locks.

### M-06 — Resend hard-bounce persistence failures are acknowledged as successful

- **Confidence:** High
- **Category:** Webhook reliability / email compliance
- **File:** `app/api/webhooks/resend/route.ts:30-49`
- **Problem:** The hard-bounce handler does not inspect the Supabase update result and returns HTTP 200 for every verified event. A transient database error permanently loses the bounce signal because Resend will not retry a successful delivery.
- **Failure scenario:** Supabase is unavailable while a hard bounce arrives. `email_valid` remains true, future sends continue, and the webhook is not replayed.
- **Impact:** Repeated delivery to known-invalid addresses, sender-reputation damage, and misleading account state.
- **Brief fix:** Check the database error and affected-row count; return a retryable 5xx for transient persistence failure. Prefer an idempotent webhook inbox/outbox so receipt and processing are independently recoverable.
- **Required regression tests:** Database failure, duplicate event, unknown recipient, soft bounce, and successful hard-bounce transition.

### M-07 — Blanket-agreement DocuSeal completion is neither claimed nor fanned out atomically

- **Confidence:** High
- **Category:** Concurrency / legal-document integrity
- **File:** `app/api/webhooks/docuseal/route.ts:124-211,437-452`
- **Problem:** The blanket-agreement branch uses a status check as idempotency, then fetches/uploads the artifact, marks the document signed, and sequentially updates eligible listings. Listing update errors are ignored while the advanced count is incremented. Concurrent deliveries can both perform the expensive work. If a listing update fails after the document is signed, a retry exits early and never repairs the listing. The split-sheet branch already uses an atomic claim pattern, but the blanket branch does not.
- **Failure scenario:** Two duplicate webhooks race, or one listing update fails halfway through. The route returns success with a signed document and only some listings advanced; future retries are suppressed by the signed status.
- **Impact:** Inconsistent deal/listing workflow state around an executed agreement and duplicate provider/storage work.
- **Brief fix:** Atomically claim the event, persist the executed document, and enqueue durable per-listing transitions. Check every write; only mark the aggregate complete after fan-out is durable, with a reconciliation path for partial prior events.
- **Required regression tests:** Duplicate concurrent webhook, artifact-fetch failure, storage failure, mid-listing failure, and retry/reconciliation.
- **Migration/deployment concern:** Likely requires an event inbox/outbox or claim columns plus a reconciliation query for signed blanket documents with eligible listings still pending.

### M-08 — New Ideas recording, branch, and collection workflows acknowledge partial compound writes

- **Confidence:** High
- **Category:** Data integrity / idempotency
- **Files:**
  - `app/api/ideas/[ideaId]/recordings/complete/route.ts:33-63`
  - `app/api/ideas/[ideaId]/branch/route.ts:16-49`
  - `app/api/ideas/[ideaId]/collections/route.ts:19-42`
- **Problem:** These uncommitted routes perform related writes independently and ignore several read/insert/delete errors. Recording completion inserts the recording, ignores marker-insert failure, and then treats retries as already complete. Branching can create a branch with a partial copy and produces a new duplicate branch on retry. Collection creation can leave an orphan collection if item insertion fails; delete ignores failure.
- **Failure scenario:** Marker insertion fails once. The API returns 201, and all future retries return the existing recording without recreating markers. A branch copy fails halfway and the user retries, creating two incomplete branches.
- **Impact:** Permanent missing timeline data, duplicate branches, and UI success responses that do not match persisted state.
- **Brief fix:** Use transactional RPCs for recording-plus-markers and full branch cloning. Check every database result and add stable idempotency/deduplication keys. Roll back empty collections.
- **Required regression tests:** Marker failure followed by retry, source-read failure, concurrent duplicate branch request, item-insert failure, and delete failure.
- **Migration/deployment concern:** This code is currently uncommitted. Correct it before commit/deploy; if migrations 169-170 are already applied, ship fix-forward functions rather than editing applied migration history.

### M-09 — Global Capture attributes a collaborator's recording to the idea owner during quick add

- **Confidence:** High
- **Category:** Authorship provenance / rights integrity
- **Files:**
  - `supabase/migrations/135_works_core.sql:128-132`
  - `supabase/migrations/169_ideas_inbox.sql:280-293`
  - `supabase/migrations/170_global_user_account_capture.sql:45-111`
  - `app/api/ideas/[ideaId]/recordings/[recordingId]/add-to-work/route.ts:23-42`
- **Problem:** `work_versions.user_id` represents the take creator. Full idea promotion correctly preserves `recording.created_by`, but the single-recording quick-add RPC writes `p_actor` instead. An idea owner quick-adding a collaborator's recording is stored as its creator.
- **Failure scenario:** A collaborator records the vocal; the owner presses Add to Writer's Room. The resulting take states that the owner created it.
- **Impact:** False creative provenance in a product whose core purpose includes contributor and rights accountability.
- **Brief fix:** Write `COALESCE(recording_row.created_by, p_actor)` consistently and preserve the source recording ID as an immutable provenance link.
- **Required regression tests:** Owner adds own recording; owner adds collaborator recording; collaborator with and without access; promotion and quick-add produce identical creator metadata.
- **Migration/deployment concern:** Migration 170 is uncommitted. If it has been applied anywhere, use a new fix-forward migration and repair affected versions from their source recording IDs.

### M-10 — AI Selects drafting reports database writes as successful when they failed

- **Confidence:** High
- **Category:** AI state management / data integrity
- **File:** `app/api/admin/selects/[id]/ai-draft/route.ts:205-252`
- **Problem:** Existing-row reads, revive/update calls, inserts, and cover-note updates have unchecked Supabase errors. Tracks are pushed into the `persisted` response even if persistence failed.
- **Failure scenario:** A constraint, RLS, or transient database error occurs for one generated track. Staff sees an apparently successful AI draft containing an item that is not in the database; retry behavior can revive or duplicate a different subset.
- **Impact:** Hallucinated persisted state, staff confusion, and inconsistent client/server selection lists.
- **Brief fix:** Make the mutation atomic or check every result and return only rows read back from the database. Use deterministic upserts/idempotency for generated selections.
- **Required regression tests:** Existing-read error, one failed insert, one failed revive, failed cover-note update, and retry after a partial provider response.

### M-11 — Track audio replacement and deletion destroy storage before database state is durable

- **Confidence:** High
- **Category:** Data loss / consistency
- **File:** `app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts:80-118,152-170`
- **Problem:** Replacement removes the previous object before uploading the new file; deletion removes storage before clearing the database pointer. A later upload or database failure leaves the track pointing at a missing object. There is no rollback.
- **Failure scenario:** Storage deletion succeeds, then the new upload or track update fails. The old audio is gone, the operation returns an error, and the database can still reference the deleted path.
- **Impact:** User audio loss and broken catalogue records during ordinary replace/delete operations.
- **Brief fix:** Upload replacements to a unique new path, atomically update the database, then best-effort delete the old object. For deletion, clear/soft-delete database state transactionally before asynchronous storage cleanup. Retain recoverable versions for a short window.
- **Required regression tests:** Failure after each operation boundary, extension change, duplicate replacement, and cleanup retry.

### M-12 — Production dependency graph contains eight reported vulnerabilities

- **Confidence:** High for dependency presence; Medium for application reachability
- **Category:** Supply chain / dependency hygiene
- **Files:**
  - `package.json:17-57`
  - `package-lock.json:6499-6500,8338-8339,12130-12131,13145-13146,13335-13336,13947-13948`
- **Problem:** `npm audit --omit=dev` reports seven high and one moderate vulnerability in the installed production graph. Affected packages include `brace-expansion`, `browserslist`, `fast-uri`, `nanoid`, `postcss`/`next`, `qs` through Stripe, and `sharp`. The full graph reports ten total findings. The audit did not prove that every advisory is reachable in Funūn; some are build/transitive paths, and no Next Image import was found.
- **Impact:** Known denial-of-service, parser/host-confusion, and tooling/image-processing risk remains in deployed or build dependencies; blanket automated remediation proposes a major Next upgrade and is not safe without compatibility work.
- **Brief fix:** Triage each advisory by runtime reachability, apply compatible transitive lockfile upgrades/overrides first, then plan and test the required Next major upgrade. Do not run a blind force audit fix.
- **Required regression tests:** Full typecheck/lint/tests, production build in the normal build workflow, image/upload smoke tests, Stripe webhook/payment tests, and dependency audit after each upgrade set.

## Low

### L-01 — Selects toast rendering relies on manual HTML escaping and has an unescaped error path

- **Confidence:** High for unsafe pattern; Low for current exploitability
- **Category:** Cross-site scripting hardening
- **Files:**
  - `components/selects-player/SelectsPlayer.tsx:308-317,432,985`
  - `app/api/selects/[token]/respond/route.ts:61`
- **Problem:** Toast content is passed to `dangerouslySetInnerHTML` under a manual escaping convention. Most dynamic titles call `escapeHtml`, but the API error body at line 432 is passed directly. No currently proven attacker-controlled payload reaches that response, but one future/raw database error containing markup would become an executable sink.
- **Brief fix:** Render plain React text nodes by default and use a typed rich-toast component for the few intentional links. Never allow server error strings to become HTML.
- **Required regression tests:** Error strings containing tags, quotes, and event attributes must render literally.

### L-02 — Membership helper RPCs expose arbitrary-user relationship and role checks

- **Confidence:** High
- **Category:** Privacy / authorization hardening
- **Files:**
  - `supabase/migrations/078_catalogue_rls_helpers.sql:100-130`
  - `supabase/migrations/080_catalogue_groups.sql:175-192`
  - `supabase/migrations/136_work_members.sql:124-154`
  - `supabase/migrations/169_ideas_inbox.sql:146-162`
- **Problem:** Authenticated callers can supply an arbitrary `p_uid` to several `SECURITY DEFINER` access helpers and learn whether that UUID owns/belongs to a resource and, in some cases, its access tier. UUID entropy limits discovery but does not prevent querying known user/resource pairs.
- **Brief fix:** Bind public helper checks to `auth.uid()` and keep arbitrary-subject checks in service-only/internal functions. Avoid returning more role detail than the caller needs.
- **Required regression tests:** An authenticated user cannot query another user's relationship while normal RLS policy evaluation still works.

### L-03 — Avatar and cover-art upload paths can report success while leaking or desynchronizing objects

- **Confidence:** High
- **Category:** Storage lifecycle / error handling
- **Files:**
  - `app/api/profile/avatar/route.ts:46-63`
  - `app/api/vault/[projectId]/assets/route.ts:109-116`
- **Problem:** Avatar upload uses timestamped object names, does not delete the previous avatar, and ignores the profile update result. Cover-art upload similarly ignores the project update result. A failed database write can return success with an orphan object and stale UI/database pointer.
- **Brief fix:** Check affected-row results, delete the newly uploaded object on database failure, and enqueue old-object cleanup only after the new pointer is durable. Use a bounded stable key or explicit object lifecycle policy.
- **Required regression tests:** Database failure after upload, repeated avatar changes, stale ownership row, and cleanup retry.

### L-04 — The stricter TypeScript gate fails on eleven unused symbols

- **Confidence:** High
- **Category:** Dead code / AI-generated-code hygiene
- **Files:**
  - `app/(artist)/vault/[projectId]/metadata/page.tsx:57`
  - `app/api/admin/client-partners/[orgId]/game-plan/route.ts:49`
  - `app/api/admin/client-partners/selects/[id]/engagement/route.ts:43`
  - `app/api/admin/deals/[id]/executed/route.ts:14`
  - `app/api/admin/plays/[id]/completions/route.ts:23`
  - `components/ideas/IdeasInbox.tsx:3`
  - `components/split-sheets/SplitApprovalView.tsx:474`
  - `components/vault/MetadataStudio.tsx:109-110,812`
  - `lib/storage/index.ts:9`
- **Problem:** `npm run typecheck:strict` fails with 11 TS6133 errors for unused parameters, imports, props, or constants (`artistName`, four `request` parameters, `Link`, `partyName`, `genre`, `subGenre`, `collaborators`, and `MAX_DOC_SIZE`). Ordinary typecheck does not enforce this gate.
- **Brief fix:** Remove truly dead symbols or connect intentionally declared values to the behavior they were meant to implement. Add the strict check to CI so generated code cannot silently accumulate dead paths.
- **Required regression tests:** `npm run typecheck:strict` must pass without weakening compiler settings.

## Accepted Risks / Intentional Trust Boundaries

- Staff/leadership TMS routes use service-role authority across client organizations. This is an intentional operational boundary, not a finding, provided staff role assignment remains tightly controlled and audited.
- Public Selects links intentionally allow token-bearing recipients to respond without an account. M-05 addresses the unbounded persistence/aggregation behavior, not the existence of the token workflow.
- `NEXT_PUBLIC_VAULT_DEMO=true` intentionally bypasses normal authentication for preview/demo mode. Production configuration must keep this disabled.
- A browser-visible Sentry DSN is not a secret. No committed service-role, Stripe secret, Resend, Anthropic, OpenAI, or webhook signing secret was found.

## Owner Clarification Required

- Confirm that deployment configuration has a hard guard preventing `NEXT_PUBLIC_VAULT_DEMO=true` in production.
- Confirm whether migrations 169-171 have been applied to any shared environment. If applied, M-08/M-09 require new fix-forward migrations; do not rewrite applied migration files.
- Confirm retention expectations for raw Selects opens/events and whether legal/audit policy requires indefinite storage. That determines the appropriate aggregation and deletion window.
- Confirm whether DocuSeal can replay historical completion events from the provider dashboard; otherwise a manual reconciliation job is required after C-01 is fixed.

## Needs Verification Outside This Checkout

- Remote branches not present in the existing local/remote-tracking refs were not discoverable. No network fetch was performed.
- Production migration state, RLS grants, storage policies/quotas, environment values, webhook delivery logs, AI-provider billing limits, and provider dashboard configuration were not inspected.
- Dependency advisories were verified against the installed lockfile, but exploit reachability and Next 16 compatibility require a dedicated dependency-upgrade session.
- DocuSeal webhook behavior should be verified with a captured live numeric-ID payload after the parser fix.
- Transaction and concurrency fixes require integration tests against a real/local Supabase database; this repository currently relies mostly on mocked route tests.

## Verification Performed

- `npm run typecheck` — **PASS**
- `npm run lint` — **PASS**
- `npx jest --runInBand` — **PASS**, 412 suites / 4,015 tests
- `npm run typecheck:strict` — **FAIL**, 11 unused-symbol errors documented in L-04
- `git diff --check` — **PASS** before report creation
- `npm audit --omit=dev --json` — **8 production findings**: 7 high, 1 moderate
- `npm audit --json` — **10 total findings**: 8 high, 1 moderate, 1 low
- Secret-pattern scan — no confirmed committed production secret
- Dangerous-code scan — no `eval`, `new Function`, or application `child_process`; one HTML sink documented in L-01
- Migration scan — 73 migrations contain `SECURITY DEFINER`; no inspected definition lacked an explicit `search_path`
- Branch topology — all available non-`main` refs are ancestors of `main`; `main` matches the available `origin/main` ref

Per the repository audit rules, no production build, development server, migration, deployment, commit, or push was run.

## Recommended Remediation Order

1. Fix C-01, add numeric webhook fixtures, deploy, and reconcile/replay missed DocuSeal completions.
2. Close M-01 with a database-level column/trigger guard and inspect existing graduation links.
3. Make M-02 split-sheet and member/promotion changes transactional.
4. Correct M-11 audio storage ordering, then move M-03 uploads behind authenticated signed intents/admission control.
5. Add M-04 durable AI budgets, concurrency controls, timeouts, and idempotency.
6. Add durable webhook processing for M-06 and M-07, then reconcile partial historical records.
7. Bound and aggregate Selects telemetry for M-05 before raw event volume grows further.
8. Correct M-08 and M-09 before committing/deploying the current Ideas/Global Capture work.
9. Make M-10 AI Selects persistence truthful and atomic.
10. Triage and upgrade M-12 dependencies, then clear L-01 through L-04 and enforce the strict gate in CI.

## Next-Session Handoff Prompt

Copy and paste the following into a fresh Codex or Claude coding session:

> Read `.planning/security/2026-09-03-full-repository-audit.md` completely. Start with C-01 only. Reconfirm the cited code and current git state before editing. Use the repository's GSD workflow, preserve unrelated dirty changes, implement provider-realistic numeric DocuSeal ID normalization and retry-safe malformed-event handling, add parser plus end-to-end webhook regression tests for split sheets and blanket agreements, run focused tests followed by typecheck/lint/full Jest, and stop for review before beginning M-01. Do not rewrite any migration already applied to a shared database.
