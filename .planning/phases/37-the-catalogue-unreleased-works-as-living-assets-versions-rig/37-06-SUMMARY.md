---
phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig
plan: 06
subsystem: api
tags: [typescript, nextjs, supabase, storage, zod, ddex, ai-disclosure, catalogue]

# Dependency graph
requires:
  - phase: 37-01
    provides: "migrations 135-138 (works/work_versions/lyric_blocks/ai_entries/work_members/work_diary_events), live in production this session — the RLS policies and capture triggers this plan writes against"
  - phase: 37-03
    provides: "lib/catalogue/ai-entries.ts — resolveCitation()/resolveLevel()/composeReceipt(), consumed verbatim, never reimplemented"
  - phase: 37-04
    provides: "lib/catalogue/access.ts (resolveWorkAccess/createWorkAccessDeps) and types/catalogue.ts (PerformerRef, WorkVersionSource) — the access gate and row vocabulary every route here imports"
provides:
  - "lib/catalogue/audio.ts — the MIME allow-list, size ceiling, work-scoped path builder and batch signed-URL reader every capture surface (hum + upload) shares"
  - "POST /api/works/[workId]/versions — the one route both HumCaptureButton (plan 09) and the add-audio upload flow (plan 12) post to"
  - "POST /api/works/[workId]/ai-entries — server-composed AI citation + four-statement receipt, stored on the row"
  - "POST /api/works/[workId]/notes — the one app-authored work_diary_events write"
affects: [37-09, 37-10, 37-12, 37-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MIME normalization before allow-list lookup: baseMimeType() strips a MediaRecorder's ;codecs=... parameter so a codec-qualified hum Blob and a bare uploaded file resolve through the same lookup, and storageContentType() guarantees the bucket only ever sees one of its own bare allowed types"
    - "Own rate-limit keyspace per write route (work-version:, ai-entry:, work-note:), reusing lib/security/rate-limit.ts's shared durable limiter rather than a new mechanism"
    - "Verify every client-supplied id against the current work_id before it can influence a decision — applied to versionId/blockId/humanSourceVersionId in the ai-entries route so a cross-work reference cannot smuggle in a citation"

key-files:
  created:
    - lib/catalogue/audio.ts
    - lib/catalogue/audio.test.ts
    - app/api/works/[workId]/versions/route.ts
    - app/api/works/[workId]/ai-entries/route.ts
    - app/api/works/[workId]/notes/route.ts
  modified: []

key-decisions:
  - "storageContentType() added beyond the plan's literal spec: the Content-Type handed to storage.upload() is always the bucket's own bare allowed type (e.g. 'audio/webm'), even when the browser's file.type arrived codec-qualified ('audio/webm;codecs=opus') — MediaRecorder's resolved mimeType is exactly what a hum Blob's .type carries, and migration 004's bucket allow-list has no codec-qualified entries, so forwarding the raw file.type risked a storage-level rejection the route's own MIME check would not have caught"
  - "EXT_BY_MIME includes audio/ogg (mapped to 'ogg'), one entry beyond the task's literal WebM/MP4/AAC/MPEG/WAV/FLAC list — migration 004's bucket allow-list already includes it, and a narrower map here would 415 an upload the bucket itself would accept"
  - "Rate limiting added to all three routes (work-version:, ai-entry:, work-note: keyspaces, via the existing shared lib/security/rate-limit.ts limiter) — not named in this plan's task text, but the threat model's T-37-36 (DoS via oversized/repeated uploads) only names the size ceiling; the versions route in particular performs a storage write plus a DB insert per request and is the same shape as the existing earnings/import route, which already rate-limits an authenticated multipart upload this way (Rule 2 — missing critical functionality)"
  - "The work_versions and ai_entries inserts use the caller's own session-scoped client (createApiClient()), not the service role — migration 136 gives both tables real owner-or-member RLS write policies (135's header: 'these rows must be visible to their owner and to a work's members through RLS and not through a service-role escape hatch'), so the session client gets double enforcement (resolveWorkAccess() in the route, RLS at the DB) rather than relying on the route's own check alone. Storage access is the one place a service-role client is required — migration 004's storage.objects policies are folder-owner-scoped and would reject a collaborator's write, per RESEARCH Pitfall 2 — and notes is the one place work_diary_events itself requires it, since migration 138 REVOKEs client INSERT on that table entirely"
  - "ai-entries' stored citation is composeReceipt()'s .citation field, not resolveCitation()'s own return shape directly — resolveCitation()'s three outcome kinds (cited/reauthor/unowned) carry the string on differently-named fields (citation vs. reason), while composeReceipt() renders all three through one citationLine() helper into a single consistent sentence, which is also exactly what the client is shown in the receipt block. Both functions are still called explicitly in the route (resolveCitation() for the refusal's re-author guidance returned separately, resolveLevel() for the version_id/level CHECK-constraint validation) rather than deriving everything from composeReceipt() alone"

patterns-established:
  - "A route that both writes to a shared-membership table's session client AND to the private track-audio bucket splits its client usage: session client (RLS-backed) for the row, service-role client (bypasses folder-owner storage RLS) for the object — same route, two clients, for two different trust boundaries"

requirements-completed: [S-01, S-02]

coverage:
  - id: D1
    description: "POST /api/works/[workId]/versions accepts a multipart body from either capture path (hum or upload), validates MIME + size before any storage write, derives a work-scoped path with no owner-id prefix, uploads via the service-role client, inserts the work_versions row via the session client, and rolls back the storage object on a failed insert"
    requirement: S-01
    verification:
      - kind: unit
        ref: "lib/catalogue/audio.test.ts (12 tests: extensionForMime, storageContentType, buildVersionPath, MAX_BYTES)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit / npm run lint --max-warnings=0 / grep checks for resolveWorkAccess + createServiceClient in the route file"
        status: pass
    human_judgment: true
    rationale: "No integration test exercises the route against a live Supabase instance (this repo has no jsdom/Supabase test harness) — the multipart parse, storage upload, and RLS-backed insert have not been exercised against the live database migrations 135-138 confirmed applied this session. Needs a manual hum-capture + upload smoke test once plan 09/12's UI lands."
  - id: D2
    description: "POST /api/works/[workId]/ai-entries composes the citation and receipt server-side via resolveCitation()/resolveLevel()/composeReceipt(), verifies every referenced version/block id belongs to the work, rejects any client-supplied citation/receipt field via a strict zod schema, and stores zero percentage anywhere"
    requirement: S-01
    verification:
      - kind: other
        ref: "npx tsc --noEmit / npm run lint --max-warnings=0 / grep checks for resolveCitation, composeReceipt, .strict() in the route file"
        status: pass
    human_judgment: true
    rationale: "The when-in-doubt structural guarantee is proven at the lib/catalogue/ai-entries.ts unit-test level (37-03); this route's own id-verification and CHECK-constraint-satisfying insert logic have not been exercised against the live database. Needs a manual filed-entry smoke test once plan 09's AiEntryFlow UI lands."
  - id: D3
    description: "POST /api/works/[workId]/notes writes exactly one work_diary_events row through the service role, with resolveWorkAccess() gating who may annotate, and never imports emitActivity or references activity_events"
    requirement: S-02
    verification:
      - kind: other
        ref: "npx tsc --noEmit / npm run lint --max-warnings=0 / grep check for work_diary_events; grep for emitActivity across all three route files returns 0 real imports"
        status: pass
    human_judgment: true
    rationale: "Needs a manual smoke test against the live database (service-role insert past migration 138's REVOKE) once a UI surface calls this route."

# Metrics
duration: ~25min
completed: 2026-08-30
status: complete
---

# Phase 37 Plan 06: The Capture API Summary

**One validated route serves both hum-capture and upload; AI entries compose and store their citation server-side from `lib/catalogue/ai-entries.ts`'s when-in-doubt logic; notes are the single app-authored diary write — all gated first by `resolveWorkAccess()`, none of them writing a diary row a migration-138 trigger already owns.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3 of 3 complete
- **Files modified:** 5 created

## Accomplishments

- `lib/catalogue/audio.ts` holds the `track-audio` bucket's MIME allow-list, its 50MB ceiling, the work-scoped `{workId}/{versionId}.{ext}` path builder (no owner-id prefix, per RESEARCH Pitfall 2), and a batch `signVersionUrls()` reader matching the existing vault page's two-hour-TTL pattern. `extensionForMime()`/`storageContentType()` normalize a MediaRecorder's codec-qualified MIME string (`audio/webm;codecs=opus`) down to the bucket's own bare allowed type before either the allow-list check or the storage upload's Content-Type header — so a hummed take and an uploaded file both clear the same gate and never trip the bucket's own `allowed_mime_types` on a parameter it was never asked to allow.
- `POST /api/works/[workId]/versions` — one route for both capture paths. Validates size and MIME before any byte reaches storage, generates the version id server-side, uploads through the service-role client (storage RLS is folder-owner-scoped and would reject a collaborator's write otherwise), inserts the `work_versions` row through the caller's own session client, and removes the uploaded object if that insert fails. Seeds `performers` from the work's current vocal plan (`primary` copies the declared performer forward; anything else seeds nothing) — a plan, never a fabricated record.
- `POST /api/works/[workId]/ai-entries` — a strict zod schema accepts only the flow's answers; any `citation`/`receipt`/`disclosure` key in the body is a 400 by construction. Every referenced `versionId`, `blockId` and `humanSourceVersionId` is verified to belong to this work before it can influence anything. `resolveCitation()`/`resolveLevel()`/`composeReceipt()` (plan 03) do the composing; the row stores `composeReceipt().citation`, and the response returns the same four receipt statements plus, on a refusal, the re-author guidance text.
- `POST /api/works/[workId]/notes` — the one place in the codebase that inserts into `work_diary_events` from application code, through the service role (migration 138 revokes client INSERT entirely), gated by `resolveWorkAccess()` at the `contribute` tier. Header comment records why a second app-authored kind would weaken CAT-Q1's guarantee.

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/catalogue/audio.ts and POST versions** — `7ec0127` (feat)
2. **Task 2: POST ai-entries** — `4c64fba` (feat)
3. **Task 3: POST notes** — `e496b0b` (feat)

## Files Created/Modified

- `lib/catalogue/audio.ts` — bucket constant, `MAX_BYTES`, `EXT_BY_MIME`, `extensionForMime()`, `storageContentType()`, `buildVersionPath()`, `signVersionUrls()`
- `lib/catalogue/audio.test.ts` — 12 tests: extension lookup (bare + codec-qualified + case-insensitive), unmapped-type rejection, the MediaRecorder codec-candidate cross-check, storage content-type normalization, path scoping, size ceiling
- `app/api/works/[workId]/versions/route.ts` — POST: hum + upload, one validated path
- `app/api/works/[workId]/ai-entries/route.ts` — POST: server-composed citation + receipt
- `app/api/works/[workId]/notes/route.ts` — POST: the one app-authored diary write

## Decisions Made

- **`storageContentType()` — a function beyond the plan's literal spec.** The plan names `extensionForMime()` explicitly but doesn't specify what Content-Type the upload call itself should use. A hum Blob's `file.type` is MediaRecorder's *resolved* mime type, which on Chrome/Firefox/Edge is `audio/webm;codecs=opus` — not a bare type. Migration 004's bucket `allowed_mime_types` has no codec-qualified entries. Forwarding `file.type` unmodified to `storage.upload({contentType: file.type})` risked a storage-level rejection this route's own MIME allow-list check would have already passed. `storageContentType()` normalizes to the bucket's bare type before the upload call, so the two checks (route-level allow-list, bucket-level allow-list) agree.
- **`audio/ogg` included in `EXT_BY_MIME`.** The task text names WebM/MP4/AAC/MPEG/WAV/FLAC explicitly and doesn't mention OGG, but migration 004's bucket already allows it. Leaving it out would 415 an upload the bucket itself would accept — narrower than the underlying storage layer for no stated reason.
- **Rate limiting on all three routes**, each with its own keyspace (`work-version:`, `ai-entry:`, `work-note:`) via the existing shared `lib/security/rate-limit.ts` limiter. Not named in this plan's task text. Added under Rule 2 (missing critical functionality): the threat register's T-37-36 names only the size ceiling as DoS mitigation, and the versions route in particular performs a storage write plus a DB insert per request — the same cost shape as the existing `app/api/earnings/import/route.ts`, which already rate-limits an authenticated multipart upload this exact way.
- **Session-scoped client for the `work_versions` and `ai_entries` writes, service-role only for storage and for `work_diary_events`.** Migration 136 gives `work_versions`/`ai_entries` real owner-or-member RLS write policies, and migration 135's own header states the doctrine for this phase: content tables stay visible and writable through RLS, not a service-role escape hatch. Storage is the one place a service-role client is structurally required (migration 004's folder-owner-scoped policies would reject a collaborator's write), and `work_diary_events` is the other (migration 138 revokes client INSERT outright). Using the session client for `work_versions`/`ai_entries` gives defense-in-depth: `resolveWorkAccess()` in the route AND RLS at the database, rather than the route's own check being the only barrier.

## Deviations from Plan

### Auto-fixed Issues

None that changed a locked decision. The four items above (storageContentType, ogg inclusion, rate limiting, session-client choice) are documented as decisions rather than deviations because none of them contradicts an explicit plan instruction — the plan's task text left each one underspecified and the choice made is the one consistent with this plan's own threat model, RESEARCH.md's storage findings, and migration 135/136's stated RLS doctrine.

**Total deviations:** 0 requiring correction. 4 judgment calls recorded above under Decisions Made.
**Impact on plan:** None — all four are additive correctness/security choices within the plan's own stated boundaries (RESEARCH Pitfall 2, T-37-36, 135's RLS doctrine). No scope creep; no architectural change.

## Issues Encountered

**Concurrent sibling commits during this plan's execution.** Two sibling plans (37-05, 37-07) were executing in the same working tree at the same time, both creating files under `app/api/works/`. `git add` picked up only this plan's own files each time (verified via `git status --short` before every commit), but between staging and committing Task 2, a sibling's commit landed and cleared this plan's staged index entry (the file itself was untouched on disk — confirmed via `wc -l` before re-staging). Re-staged and re-verified (`npx tsc --noEmit`, `npm run lint`) before each commit; every commit's `git show --stat` was checked immediately after and contains exactly this plan's own file(s), nothing from a sibling. One transient `npx tsc --noEmit` error was observed early in the session in `app/api/works/route.ts` (37-05's file, not in this plan's scope) — it resolved itself once that sibling plan finished its own task, with no action taken here.

## User Setup Required

None — no external service configuration required. Migrations 135–138 were already confirmed live in production before this plan started (verified this session, per 37-01's Task 4 checkpoint).

## Next Phase Readiness

`POST /api/works/[workId]/versions` is ready for plan 09's `HumCaptureButton` and plan 12's add-audio upload flow to post to. `signVersionUrls()` is ready for plan 12's page to call for diary playback. `POST /api/works/[workId]/ai-entries` is ready for plan 09's `AiEntryFlow` to call, and its response shape (`{ data, receipt, guidance }`) carries everything sketch 002-A/003-A need to render the receipt block and the inline re-author prompt. `POST /api/works/[workId]/notes` is ready for whichever plan wires the diary's note-composer input.

No blockers. All three routes are unexercised against the live database (no Supabase/jsdom test harness in this repo) — each coverage item above is flagged `human_judgment: true` for that reason and should get a manual smoke test once its consuming UI plan lands.

## Self-Check: PASSED

All five created files exist on disk at their stated paths. All three commits (`7ec0127`, `4c64fba`, `e496b0b`) exist in `git log` on `feat/phase-37-songwriter`, and `git show --stat` for each contains only this plan's own file(s) — verified individually, immediately after each commit.
