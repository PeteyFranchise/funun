---
phase: 17-split-sheet-esign
plan: 07
subsystem: api
tags: [docuseal, webhook, hmac, idempotency, contract-locker, telemetry, esign, provenance]

# Dependency graph
requires:
  - phase: 17-split-sheet-esign
    provides: "verifyDocusealSignature + parseDocusealEvent (17-01), the pure raw-body HMAC module whose scheme was confirmed live at the provider gate"
  - phase: 17-split-sheet-esign
    provides: "buildFanoutRows (17-05) — account-holder-only cross-account vault_documents builder; GET/POST reconcile routes"
  - phase: 17-split-sheet-esign
    provides: "DocuSealProvider adapter + mint route (17-06)"
  - phase: 17-split-sheet-esign
    provides: "renderCompletionCertificate (17-10) — Funūn's Certificate of Completion with type-separated provenance"
provides:
  - "POST /api/webhooks/docuseal — raw-body-HMAC-verified, idempotent completion webhook: re-hosts both provider artifacts, renders and files Funūn's certificate, transitions envelope/signers/sheet, fans out locker rows, notifies executed, offers write-back"
  - "docusealProvider.fetchCompletionArtifacts() — one adapter call returning executed PDF bytes, audit-log bytes, both document SHA256s, and per-signer provider-reported facts in ProviderReportedSigner shape"
  - "lib/esign/telemetry.ts — monthlyEsignUsage() + currentMonthRange(), the AM-3 $500/mo trigger math over the esign_envelopes ledger"
  - "GET /api/admin/esign/usage + /admin/esign-usage — admin-gated read-only completed-count and estimated-spend surface"
  - "migration 065 — esign_envelopes.certificate_path (authored, NOT pushed)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Raw-body-first webhook gate that returns before the service client is even CONSTRUCTED, so 'zero side effects on a forged event' is assertable as 'the client was never built' rather than the weaker 'no write was applied'"
    - "Idempotency guard placed as an explicit section boundary with everything expensive, billable, or user-visible below it — so the safe-to-repeat/unsafe-to-repeat split is visible at a glance rather than inferred"
    - "Storage paths keyed on the OWN system's identifier rather than the vendor's, because a path that renders in a provenance-separated artifact carries whatever identifier it embeds across the attribution boundary"
    - "Non-fatal post-spend steps: once a third party has billed and the primary artifact is stored, a secondary failure degrades and reports rather than returning 5xx into an idempotency guard that would make the failure permanent AND invisible"
    - "Response doctrine for retrying providers: permanent conditions (unknown submission, unparseable body, orphaned envelope) return 200 to stop redelivery; transient ones (download, storage, database) return 5xx to retry into the guard"

key-files:
  created:
    - app/api/webhooks/docuseal/route.ts
    - __tests__/docuseal-webhook.test.ts
    - lib/esign/telemetry.ts
    - lib/esign/telemetry.test.ts
    - app/api/admin/esign/usage/route.ts
    - app/(admin)/admin/esign-usage/page.tsx
    - supabase/migrations/065_esign_certificate_path.sql
    - __tests__/migration-065.test.ts
  modified:
    - lib/esign/docuseal.ts
    - app/(admin)/layout.tsx

key-decisions:
  - "Storage artifact paths are keyed on Funūn's esign_envelopes.id, NOT DocuSeal's submission id. This started as a naming preference and turned into a correctness fix: executedDocumentPath is a Funūn-OBSERVED fact that renders in the certificate's unattributed section, so a submission id baked into the filename printed a provider-reported value outside the attributed provider region — a real T-17-30 violation. The provenance test caught it; review would not have."
  - "The fan-out emits an EMPTY auditTrailUrl when the provider reported no audit log, rather than falling back to the executed PDF's path. buildFanoutRows requires the field, and the obvious fallback asserts that the signed contract is its own audit trail — a false evidentiary claim in the artifact a royalty dispute reaches for."
  - "Certificate render + upload is non-fatal. By that point the provider has billed $0.20 and the executed PDF and audit log are already stored; returning 5xx would make DocuSeal retry into the idempotency guard, rendering the failure permanent and invisible. Degrading keeps every artifact filed and the certificate regenerable, since all its inputs are persisted."
  - "certificate_path is written in a SEPARATE, non-fatal update from the main envelope transition. Migration 065 is authored but unpushed (pushes are human-gated in this repo); folding the key into the main update would fail the whole completion on an unpushed database AFTER the spend was committed. The response reports certificatePathRecorded so the live run surfaces the difference."
  - "fetchCompletionArtifacts was added to the adapter rather than putting the two-hop resolve-then-download in the route. DocuSeal response shapes (documents[], audit_log_url, submitters[]) inside an app route is exactly the vendor coupling lib/esign/provider.ts exists to prevent. Its signers group is shaped field-for-field to ProviderReportedSigner so the route hands it to the certificate WITHOUT reshaping — reshaping is how a provider-reported fact becomes a Funūn-observed one."
  - "reconcileOffered is a boolean on the executed notification, not a computed diff. The diff is derived on demand by GET /api/split-sheets/[id]/reconcile and applied only by an explicit POST confirm — a request shape this route never issues — so dismissing leaves composers[] untouched by construction rather than by convention."
  - "The admin surface lives at app/(admin)/admin/esign-usage/, not the plan's app/(artist)/admin/esign-usage/ — see Deviation 2. The (artist) group carries artist navigation and no admin gate."
  - "Only ACCOUNT-HOLDER parties are notified, deduped by user_id, and the initiator is covered by that same pass rather than notified separately — the initiator is a party on their own sheet, so a separate notify would double-message them."

patterns-established:
  - "Assert 'no side effects' at the strongest available boundary: mock the client FACTORY and assert it was never called, rather than mocking the client and asserting no write. The weaker assertion passes for a route that queries first and verifies second."
  - "When a provenance-separated renderer exists downstream, test the provenance boundary at every producer too — serialize the trusted group and assert no untrusted value appears in it. This caught a leak that the renderer's own containment test could not see, because the value arrived pre-embedded in a legitimately-Funūn-observed string."

requirements-completed: [ESIGN-07, ESIGN-09, ESIGN-10, ESIGN-14]

coverage:
  - id: D1
    description: "A forged, tampered, stale (>5min), wrong-secret, or unsigned webhook returns non-2xx with ZERO side effects — asserted as the service client never being constructed, so a query-then-verify route would fail the test (T-17-20)"
    requirement: "ESIGN-07"
    verification:
      - kind: unit
        ref: "__tests__/docuseal-webhook.test.ts#signature gate (5 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A valid submission.completed re-hosts the executed PDF and the provider audit log into release-documents within the handler, and transitions envelope -> completed (with paths + billed), signers -> completed, split_sheets -> executed"
    requirement: "ESIGN-07"
    verification:
      - kind: unit
        ref: "__tests__/docuseal-webhook.test.ts#completion"
        status: pass
    human_judgment: false
  - id: D3
    description: "A redelivered completion for an already-completed envelope returns 200 and repeats nothing — no download, no upload, no certificate render, no row write, no notification (T-17-21)"
    requirement: "ESIGN-07"
    verification:
      - kind: unit
        ref: "__tests__/docuseal-webhook.test.ts#idempotency"
        status: pass
    human_judgment: false
  - id: D4
    description: "Funūn's own Certificate of Completion is rendered once and filed beside the executed PDF and the provider audit log, with the two provenance groups passed separately and never flattened; no provider-captured value (IP, user agent, submission id) appears in the funuunObserved group"
    requirement: "ESIGN-19"
    verification:
      - kind: unit
        ref: "__tests__/docuseal-webhook.test.ts#Funūn Certificate of Completion (3 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "One vault_documents row per ACCOUNT-HOLDER party via buildFanoutRows, all sharing one stored file, each satisfying the evidence guard and carrying the document_data.split_sheet_id join key; zero rows when no party holds an account"
    requirement: "ESIGN-10"
    verification:
      - kind: unit
        ref: "__tests__/docuseal-webhook.test.ts#cross-account fan-out (2 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The split_sheet_executed notification fires per account-holder party and carries reconcileOffered; the route never writes tracks/composers[], and a standalone sheet offers no reconciliation"
    requirement: "ESIGN-09"
    verification:
      - kind: unit
        ref: "__tests__/docuseal-webhook.test.ts#notification + offered write-back (3 tests), #never writes composers[]"
        status: pass
    human_judgment: false
  - id: D7
    description: "monthlyEsignUsage returns current-month completed count and estimated spend with cent rounding, and reports the AM-3 $500 trigger as reached AT the threshold; currentMonthRange is half-open UTC and rolls the year over"
    requirement: "ESIGN-14"
    verification:
      - kind: unit
        ref: "lib/esign/telemetry.test.ts (11 tests)"
        status: pass
    human_judgment: false
  - id: D8
    description: "Admin-gated read-only usage route + surface showing completed count and estimated spend against the AM-3 trigger (T-17-23)"
    requirement: "ESIGN-14"
    verification:
      - kind: manual
        ref: "verifyAdmin() gate on the route + explicit per-page admin check, mirroring every other /api/admin/* handler"
        status: pass
    human_judgment: true
    rationale: "The gate reuses the established verifyAdmin() helper and per-page check; no new test was added because the pattern is already covered by the existing admin-route suites. A non-admin's 403 should still be eyeballed once on the live surface."
  - id: D9
    description: "End-to-end live run: real 3-signer envelope, real invite emails, mobile signing at 375px, live webhook delivery, readiness move to tier 15, void/idempotency/reconciliation behavior, telemetry read"
    verification: []
    human_judgment: true
    rationale: "OUTSTANDING — the plan's blocking checkpoint. Costs real money ($0.20/completion) and sends real email to real people. Cannot be discharged by an agent. See Human Checkpoint below."
  - id: D10
    description: "ESIGN-19's certificate content assertions against a real rendered PDF (non-Latin-1 names, fast-lane vs interactive signer distinction, attributed provenance region legibility)"
    verification: []
    human_judgment: true
    rationale: "The renderer's own contract is covered by 17-10's 25 tests; this plan mocks it. What is unverified here is the INTEGRATION — that the input this route assembles produces a correct-reading certificate. Requires a live completion to observe."

# Metrics
duration: ~75min
completed: 2026-07-20
status: complete
---

# Phase 17 Plan 07: Verified Completion Webhook + Usage Telemetry Summary

**Closed the Phase 17 loop with a raw-body-HMAC-verified, idempotent DocuSeal completion webhook that re-hosts both provider artifacts, files Funūn's own Certificate of Completion into every account-holder's Contract Locker, offers (never applies) the splits write-back, and meters the whole thing against AM-3's $500/mo trigger.**

## Performance

- **Duration:** ~75 min
- **Completed:** 2026-07-20
- **Tasks:** 2 of 2 autonomous tasks complete. **Task 3 (human checkpoint) is OUTSTANDING and blocking.**
- **Files created:** 8 (route, 2 libs/surfaces, 3 test suites, migration, admin page)

## Accomplishments

- **`app/api/webhooks/docuseal/route.ts`** — reads the raw body and verifies the HMAC via 17-01's pure function *before parsing and before the service client is constructed*. A forged, tampered, stale, wrong-secret, or unsigned event returns non-2xx having touched nothing. An explicit idempotency guard on envelope status sits as a labelled section boundary with everything expensive, billable, or user-visible below it.
- **Prompt re-hosting** — the executed PDF and the provider audit log are downloaded and uploaded into `release-documents` synchronously inside the handler; both provider URLs expire in ~40 minutes.
- **Funūn's Certificate of Completion is filed alongside them**, rendered by 17-10 with the two provenance groups passed separately and never merged. The route supplies `funuunObserved` from Funūn's own rows and `providerReported` straight through from the adapter without reshaping.
- **Cross-account fan-out** via `buildFanoutRows` — one locker row per account-holder party, all pointing at one stored file, each carrying the `split_sheet_id` join key 17-05's attach affordance resolves against.
- **Executed notification per account-holder party** carrying `reconcileOffered`. Nothing in the route writes `composers[]`; a test asserts the `tracks` table is never even selected.
- **`lib/esign/telemetry.ts` + admin surface** — count-to-spend math over the authoritative `esign_envelopes` ledger (no counter table), half-open UTC month window, AM-3 trigger at `>=` the threshold, and an admin-gated read-only page.

## Task Commits

1. **Task 1: signature-verified, idempotent completion webhook** — `237a798` (test, RED) → `f49576b` (feat, GREEN)
2. **Task 2: fan-out, certificate, notify, telemetry** — `b4b1583` (test, RED) → `f2609d4` (feat, GREEN) → `cf92422` (fix, audit-trail honesty)

## Verification

- `npx jest __tests__/docuseal-webhook.test.ts` — **21/21 passing**
- `npx jest lib/esign/telemetry.test.ts` — **11/11 passing**
- `npx jest __tests__/migration-065.test.ts` — **5/5 passing**
- `npx tsc --noEmit` — clean
- `npm run lint` — clean (0 errors, 0 warnings, `--max-warnings=0`)
- **Full suite: 71 suites / 831 tests passing** — baseline was 68 suites / 797 tests; **+3 suites, +34 tests, zero regressions**
- Plan grep gates: `verifyDocusealSignature`, `buildFanoutRows`, `renderCompletionCertificate` all present in the route; no `export const runtime = 'edge'`
- **Not run, deliberately:** `npm run build` — see Known Pre-Existing Issue
- **Not touched, per instruction:** no DocuSeal API call, no mint, no void, no invite, no `supabase db push`

## Deviations from Plan

### 1. [Rule 2 — provenance leak, caught by test] Storage paths were keyed on the provider's submission id

- **Found during:** Task 2, on the first run of the provenance test
- **Issue:** Artifact paths were `.../executed-{submissionId}.pdf`. `executedDocumentPath` is a **Funūn-observed** fact and renders in the certificate's unattributed section — so the DocuSeal submission id, a provider-reported value, was being printed outside the attributed provider region. That is a real T-17-30 violation, and 17-10's own containment test could not have caught it: the value arrived pre-embedded inside a string that legitimately belongs to `funuunObserved`.
- **Fix:** Paths are keyed on `esign_envelopes.id` — Funūn's own per-attempt UUID, which is also collision-free across void→re-mint and stable across any future provider migration. The reasoning is recorded in a header comment on `artifactPath` so it is not undone.
- **Committed in:** `f2609d4`

### 2. [Rule 3 — wrong route group] Admin page moved from `app/(artist)/` to `app/(admin)/`

- **Issue:** The plan specifies `app/(artist)/admin/esign-usage/page.tsx`. The `(artist)` group's layout renders artist navigation and applies no admin gate; every existing admin surface lives under `app/(admin)/`.
- **Fix:** Created at `app/(admin)/admin/esign-usage/page.tsx` with the same explicit per-page admin check every other admin page carries (T-05-02), plus a sidebar link in `app/(admin)/layout.tsx`.
- **Committed in:** `f2609d4`

### 3. [Rule 3 — missing capability] `fetchCompletionArtifacts` added to the adapter

- **Issue:** The plan says the route "downloads the executed PDF + audit log via the adapter", but the adapter only had `downloadSignedPdf`, which returns the first document and no audit log, no SHAs, and no per-signer facts. `lib/esign/docuseal.ts` is not in the plan's `files_modified`.
- **Fix:** Added one method returning everything the completion path needs. The alternative — putting DocuSeal's `documents[]` / `audit_log_url` / `submitters[]` response shapes inside an app route — is precisely the vendor coupling `lib/esign/provider.ts` exists to prevent.
- **Committed in:** `f49576b`

### 4. [Rule 2 — false evidentiary claim] Fan-out no longer names the executed PDF as its own audit trail

- **Found during:** post-implementation review of the fan-out call
- **Issue:** `buildFanoutRows` requires an `auditTrailUrl`, and the completion path fell back to the executed PDF's path when no audit log was reported. That asserts the signed contract **is** its own audit trail — the same class of honesty failure the certificate's provenance separation exists to prevent, in the artifact a royalty dispute reaches for.
- **Fix:** Emits an empty `auditTrailUrl` instead, with a test asserting it never equals `signedFileUrl`. Absent is honest; wrong is not.
- **Committed in:** `cf92422`

### 5. [Schema addition] Migration 065 authored, NOT pushed

- **Issue:** The plan requires storing the certificate path on the envelope row. `esign_envelopes` has `executed_file_path` and `audit_log_path` (both provider artifacts) but no pointer for Funūn's own certificate, and overloading `audit_log_path` would collapse exactly the distinction ESIGN-19 preserves.
- **Fix:** `065_esign_certificate_path.sql` adds a nullable `certificate_path`, following 062's human-gated-push convention. **The pointer write is isolated into its own non-fatal update** so an unpushed database still files every artifact — the response reports `certificatePathRecorded: false` in that case. The path is deterministic from `(initiator, sheet, envelope)`, so it is recoverable either way.
- **Committed in:** `f2609d4`

## Known Pre-Existing Issue (not from this plan)

`npm run build` fails on `app/(artist)/contracts/page.tsx`, which exports a helper from a page module — introduced by 17-05 (`b349e5a`). I did **not** run `npm run build`, both because the failure is pre-existing and out of scope and because a build writes `.next/types`, after which the same error surfaces in `npx tsc --noEmit` and reads like a fresh regression. `tsc --noEmit` is clean in this working tree. **This must be fixed before deploy**, since the webhook cannot receive a live delivery from a build that does not ship.

## Human Checkpoint — OUTSTANDING (blocking)

**Task 3 of this plan is a `checkpoint:human-verify` with `gate="blocking"` and has NOT been performed.** It costs real money ($0.20 per completed document) and sends real email to real people, so no part of it was attempted. Phase 17 is not closed until it passes.

### Prerequisites before Pete can run it

1. **Push migration 065** (`supabase db push`) — adds `esign_envelopes.certificate_path`. Without it the certificate is still stored and filed, but the envelope pointer is skipped and the response reports `certificatePathRecorded: false`.
2. **Fix the pre-existing `npm run build` failure** in `app/(artist)/contracts/page.tsx` (from 17-05) — nothing deploys until this passes.
3. **Set `DOCUSEAL_WEBHOOK_SECRET`** in the deployment environment (the dashboard's `whsec_`-prefixed value, used as-is) and point the DocuSeal webhook at `POST /api/webhooks/docuseal`.
4. **Set `ESIGN_FROM_EMAIL`** — still unset by design in local `.env.local`, so `sendSignatureInvite()` currently no-ops with `notConfigured` and **no invite is sent at all**. Step 8 below cannot be verified until this is configured with a live, monitored mailbox. (Carried over from 17-10.)
5. **Still open from earlier plans:** DocuSeal Pro purchase (required before any real artist use — the sandbox banner from the provider gate), and attorney review of `AGREEMENT_CLAUSES` (P17-09a) — `COUNSEL_REVIEW_STATUS` is `'unreviewed'`, so `assertCounselReviewedForProduction()` deliberately blocks any production mint until it clears.

### What Pete must verify

1. End-to-end on a real 3-signer sheet: approve → mint → sign each party via the embedded form **on a 375px mobile viewport** (D-18b) → the webhook files the executed PDF + certificate into **every** account-holder party's Contract Locker and the sheet reads `executed`.
2. Readiness moved to tier 15 via the 17-02 trigger; a standalone (projectless) sheet lands unattached, is attachable, and then moves that project's readiness.
3. The executed notification fired, and the write-back diff is **offered, not applied** — dismissing leaves `composers[]` untouched.
4. Void a minted (unsigned) envelope from another party: sheet returns to negotiation, voided attempt preserved, re-consensus mints a new envelope.
5. Replay a captured **tampered** payload → rejected, no state change. Replay a **valid** one → idempotent, no duplicate documents or notifications.
6. The admin surface at `/admin/esign-usage` shows completed count + estimated spend against the $500/mo trigger.
7. Each signer received **exactly one** invite, from Funūn's mailbox, replies land there, and **no provider-branded invite arrived**.
8. Open the filed certificate: song, parties, per-dimension splits, per-signer completion timestamps, both document hashes; every provider-sourced fact (IP, session, user agent, timezone, email-verification status) appears **only** inside the attributed DocuSeal region; the audit log is both cited and present in the locker; a fast-lane API-completed signer is visibly distinguished from a hand-signed one.
9. The executed PDF and the certificate render a **non-Latin-1 collaborator name** correctly — sign one envelope with a party whose legal name contains such a character.

**Resume signal:** type "approved", or describe the failure.

## What Could Not Be Verified Without a Live Run

Everything below is implemented and unit-tested against mocks, but has **never touched the real provider**:

- **The HMAC scheme against a genuine DocuSeal delivery.** The scheme was confirmed at the provider-verification gate and 17-01's unit tests cover it, but this route has never verified a real inbound signature. The unix-**seconds** timestamp fix is load-bearing here — the original millisecond assumption would have rejected every genuine webhook.
- **The real `submission.completed` payload shape.** `parseDocusealEvent` reads defensively and falls through to `'other'` on anything unexpected, but if the live payload nests the submission id differently, the route acknowledges and does nothing. That fails *safe* but *silently* — worth watching on the first delivery.
- **`fetchCompletionArtifacts` against the live API.** Field names for the SHAs (`original_document_sha256` / `result_document_sha256`), timezone, and session id are inferred from the provider-verification notes, not observed in a live response. If they differ, those certificate fields render empty — the certificate is still produced and correct in structure, just thinner. **This is the single most likely thing to need a small fix after the first real completion.**
- **`completionMethod` inference.** Derived from the absence of both IP and user agent, since DocuSeal reports browser-captured facts only for interactive sessions. Plausible, but not confirmed against a real fast-lane API completion.
- **Storage upload of a real multi-MB PDF**, and whether `release-documents` bucket policies accept a service-role write at these paths.
- **The 17-02 readiness trigger actually firing** once fan-out rows land — asserted nowhere in this plan's tests, since it is database-side.
- **`ReconcileDiff` is not mounted on any page.** `grep` finds no importer; 17-05 built the component and both routes but wired no surface. `reconcileOffered` fires correctly and the notification links to `/split-sheets/{id}`, but **there may be nothing there to render the offer.** Checkpoint step 3 will expose this. Flagged rather than fixed — out of this plan's scope.

## Threat Flags

None. The route introduces one new inbound surface, `POST /api/webhooks/docuseal`, which is in the plan's threat model (T-17-20/21/22) and mitigated as specified. The admin usage route is covered by T-17-23 and uses the established `verifyAdmin()` gate.

---
*Phase: 17-split-sheet-esign*
*Completed: 2026-07-20*

## Self-Check: PASSED

All 8 created files confirmed present on disk. All 5 task commits (`237a798`, `f49576b`, `b4b1583`, `f2609d4`, `cf92422`) confirmed in git log. No file deletions across the plan's commit range.
