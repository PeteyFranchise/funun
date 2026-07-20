---
phase: 17-split-sheet-esign
plan: 06
subsystem: split-sheet-esign
tags: [docuseal, esign, split-sheets, cap, embed, legal]
status: complete
requires:
  - "17-01 (EsignProvider contract, webhook HMAC module, envelope lifecycle helpers)"
  - "17-02 (migrations 062/063 — esign_envelopes, esign_envelope_signers, legal-grade columns)"
  - "17-03 (renderSplitSheet, partyRoleTag)"
  - "17-04 (SplitApprovalView sign-phase region)"
  - "17-09 (AGREEMENT_CLAUSES, assertCounselReviewedForProduction, legal-grade PDF)"
  - "17-10 (sendSignatureInvite)"
provides:
  - "DocuSealProvider — the first live EsignProvider implementation"
  - "POST /api/split-sheets/[id]/mint-envelope — cap-enforced, counsel-gated envelope mint"
  - "POST /api/split-sheets/[id]/void — any-party void with audit-preserving archive"
  - "SplitSheetSigningEmbed — embedded mobile-first signing surface"
  - "checkNewRecipientCap / MONTHLY_NEW_RECIPIENT_CAP (AM-2c)"
affects:
  - "17-07 (webhook route consumes docusealProvider.parseWebhook + downloadSignedPdf; admin telemetry surfaces MONTHLY_NEW_RECIPIENT_CAP)"
  - "16-09 (SignWell adapter reuses this fetch-behind-the-interface pattern)"
tech-stack:
  added:
    - "@docuseal/react@1.0.75 (MIT, client embed SDK only — no server SDK)"
  patterns:
    - "Vendor adapter as plain fetch behind a shared interface; no vendor server SDK"
    - "Pre-flight gate block: every irreversible/paid action gated before the first provider call"
    - "Recipient-based rate limiting rather than document counting"
key-files:
  created:
    - lib/esign/docuseal.ts
    - lib/esign/docuseal.test.ts
    - app/api/split-sheets/[id]/mint-envelope/route.ts
    - app/api/split-sheets/[id]/void/route.ts
    - components/split-sheets/SplitSheetSigningEmbed.tsx
  modified:
    - lib/esign/provider.ts
    - lib/split-sheets/envelopes.ts
    - lib/split-sheets/envelopes.test.ts
    - components/split-sheets/SplitApprovalView.tsx
    - app/approve/[token]/page.tsx
    - package.json
    - package-lock.json
decisions:
  - "AM-2c cap is recipient-based, not document-based: MONTHLY_ENVELOPE_CAP and checkMonthlyCap retired outright"
  - "Fast-lane approval backfill applied AFTER a successful mint, not before, to remove a failure window"
  - "The full agreement input is 17-09's ACTUAL shipped shape; the plan's ESIGN-16 field list was stale"
  - "Provider archive attempted before local void writes so a provider failure leaves the sheet untouched"
metrics:
  duration: ~1 session
  completed: 2026-07-20
  tasks: 3
  tests_added: 38
requirements: [ESIGN-01, ESIGN-04, ESIGN-05, ESIGN-06, ESIGN-13, ESIGN-18]
---

# Phase 17 Plan 06: Live DocuSeal Integration Summary

DocuSeal wired end to end as a plain-fetch adapter behind `EsignProvider`, with a cap-enforced and counsel-gated mint route, an any-party void that archives without billing, and embedded mobile-first signing inside Funūn — and the AM-2 document cap replaced by AM-2c's new-recipient cap so a 12-track album no longer blocks its own artist.

## Gate status

**Baseline:** 67 suites / 759 tests → **68 suites / 797 tests, all passing.** `npx tsc --noEmit` clean, `npm run lint` clean.

The blocking provider-verification checkpoint was already satisfied (`17-PROVIDER-VERIFICATION.md`) and was not re-run. Checkpoint guard 4b verified: `VOIDED_ENVELOPES_COUNT_TOWARD_CAP` carries a comment citing the live trial on submission 9477116.

**No live DocuSeal call was made by this plan.** Every test mocks the fetch adapter. No envelope was minted, no invite was sent.

## What was built

### Task 1 — DocuSeal adapter (`b82b92e`)

`lib/esign/docuseal.ts` implements `EsignProvider` as `fetch` and nothing else. `@docuseal/react` (MIT, verified: `docusealco` org, no `postinstall`, zero runtime deps) is installed but imported **only** by the client embed component — no server SDK anywhere.

- `createRequest` posts the Funūn-rendered PDF to `/templates/pdf`, then `/submissions` with `order: 'random'` (parallel async signing).
- `send_email: false` at **both** submission and submitter level. Belt-and-braces is deliberate: a submission-level default change upstream then cannot silently put provider-branded mail in a collaborator's inbox.
- Per-submitter `reply_to`, **omitted entirely when unset** — never defaulted to a no-reply.
- `expire_at` at 45 days, deliberately outlasting Funūn's 30-day approval token so Funūn's token is always the binding constraint (RESEARCH A4).
- `X-Auth-Token` read at call time, never returned to a caller (asserted by test).
- `parseWebhook` delegates HMAC verification to 17-01's `lib/esign/webhook.ts` — not reimplemented.
- `archiveSubmission` (DELETE) for the void path.

26 tests, fetch mocked throughout.

### Cap rework — AM-2c (`551c829`)

`MONTHLY_ENVELOPE_CAP` and `checkMonthlyCap` **retired, not deprecated**, replaced by:

- `MONTHLY_NEW_RECIPIENT_CAP = 25` — a single named constant.
- `checkNewRecipientCap` — counts distinct **new recipient emails** per calendar month; known collaborators are free forever.
- `envelopeCountsTowardCap` — the sole reader of `VOIDED_ENVELOPES_COUNT_TOWARD_CAP`.
- `normalizeRecipient` — case-insensitive identity, so capitalization never burns an artist's quota.

The batch comparison is `projectedCount <= cap`, not the `<` a per-document counter uses, because a mint introduces all its new recipients at once. The load-bearing consequence: **a mint whose recipients are all known adds zero and succeeds even when the initiator is already at or over the cap.** A regression test mints the same three bandmates twelve times over; any future edit that makes that fail has reintroduced the document cap AM-2c removed.

Tests 10 → 22, including an assertion that the retired symbols are no longer exported.

### Task 2 — mint + void routes (`d68fc84`)

Both gates sit in one visibly adjacent pre-flight block **before the first DocuSeal call**, because once `createRequest` returns the spend is committed:

1. `assertCounselReviewedForProduction()` (P17-09a) — still hard-blocks production minting, as intended.
2. The AM-2c cap, deriving recipient history from the initiator's envelopes filtered through `envelopeCountsTowardCap`.

Then: render the full legal-grade agreement input, mint, persist **one `esign_envelopes` row per attempt** (a re-mint never overwrites a void), advance the sheet, and send Funūn's own per-signer invites.

Submitter roles come from `partyRoleTag(index)`, matching the `{{Signature;role=PartyN}}` tags the renderer embedded by the same index — that binding is what puts each signature in the right box.

Void: any party on the sheet (not only the initiator) can object. The provider archive is attempted **first**, so a provider failure leaves the sheet untouched rather than showing a party a voided sheet whose signing form is still live and signable. The envelope row is marked `voided` with `billed: false` and never deleted.

### Task 3 — embedded signing (`d17a8f1`)

`SplitSheetSigningEmbed` wraps `@docuseal/react`'s `DocusealForm`. Signature capture stays the vendor's (spike 006a validated draw/type/camera at 375px) — no hand-rolled canvas pad, which would have to re-solve touch smoothing and undo, and would produce a signature image the provider's audit log did not witness.

Mounted into `SplitApprovalView`'s sign region, replacing 17-04's placeholder. `/approve/[token]` resolves **this party's own** `signer_slug` server-side and passes only the scoped `/s/{slug}`. `onComplete` is a UI hint only; authoritative state comes from the HMAC-verified webhook (17-07), since browser events can be forged.

## Deviations from Plan

### 1. [Amendment applied] The cap was built as AM-2c, superseding the plan's document-count language

Instructed and expected. Recorded here because the plan body still reads "~10 documents" in places that `<cap_semantics_amended>` supersedes.

### 2. [Rule 3 — Blocking] `EsignProvider` extended with optional fields

`lib/esign/provider.ts` is not in the plan's `files_modified`, but the contract had no way to express a signer's **role** (required to bind a submitter to their PDF field), no `replyTo`, and no per-signer result carrying `submitterId`/`slug` — all of which the mint route must persist into `esign_envelope_signers`.

All additions are **optional**, so nothing existing breaks. `role` and `replyTo` are genuine cross-vendor concepts (SignWell binds by role too), so this keeps the seam vendor-agnostic rather than leaking DocuSeal specifics.

### 3. [Deviation — plan text was stale] The "full SplitSheetAgreementInput" is 17-09's shipped shape, not the plan's field list

The plan's ESIGN-16 amendment lists `rights_scope`, sample disclosure, ISWC/ISRC, and per-party `publisher_name` / `publisher_pro` / `publisher_ipi` / `writer_share` / `publisher_share` / `master_share`.

**None of those exist.** 17-09 shipped a different, Pete-approved shape per `17-SPLIT-SHEET-TEMPLATE-SPEC.md`, and migration 063 adds only `legal_name`, `publishing_designee`, `administrator` (parties) and `artist_name`, `album_project_title`, `record_label` (sheets). `SplitSheetAgreementInput` is `SplitSheetDocProps`.

The mint route therefore builds the complete **actual** input — every field the renderer accepts, nothing omitted. The plan's intent (don't mint the reduced pre-063 table) is satisfied; its field list was written before 17-09 executed.

**Worth a look:** the spec's composition-vs-master scope statement is handled by `GUIDANCE_NOTES[2]` rather than a structured `rights_scope` field. If a structured field was actually wanted, that is a 17-09 follow-up, not a mint-route gap.

### 4. [Deviation — ordering] Fast-lane backfill applied after the mint, not before

The plan says the fast lane "first applies `buildFastLaneBackfill` … before minting." Writing approval state ahead of a call that can fail would leave a sheet claiming consensus with no envelope behind it.

The backfill is applied immediately after a successful `createRequest`, alongside envelope persistence. The semantics ("the signature backfills approval") are identical; this ordering has no failure window.

### 5. [Rule 1 — Bug] `/approve/[token]` always showed "An artist" instead of the sender's name

Found while wiring the embed. Both `artist_profiles` queries on that page filtered `.eq('user_id', …)` and selected `display_name` — but `artist_profiles` is keyed by `id` and has no `user_id`; `display_name` lives on `industry_profiles`. Both queries always errored, silently degrading to the fallback.

This is the page asking a collaborator to sign a legal document, where the sender's name is the primary trust signal. Fixed to `.select('artist_name').eq('id', …)`. Same bug class the mint route avoids by keying on `id`.

### 6. [Rule 2 — Missing critical functionality] `/approve/[token]` wired to supply the embed's `src`

Task 3 lists only the two component files, but an embed with no data source is a stub — and the plan's own human-check requires the form to actually render for an `esign_pending` party. The page now resolves the signer slug server-side, scoped to that party's row on the pending envelope.

## Could not verify without a live API call

Reported rather than attempted, per the spending and outbound-email limits:

1. **The 375px human-check (Task 3's `<human-check>`).** Rendering the sign phase needs an `esign_pending` sheet with a real `signer_slug`, which requires minting a real envelope ($0.20 on completion) and would send real invites. The embed's props, mount, and slug plumbing are verified by typecheck and by webpack compiling the component successfully; the visual/tactile check at 375px is genuinely outstanding.
2. **Live request/response shapes.** Adapter payloads are built from the official DocuSeal API reference and asserted against mocks. The provider gate already proved the integration end to end (submission 9477115), so shape drift is unlikely — but no request from this code has actually hit the API.
3. **Invite delivery.** `ESIGN_FROM_EMAIL` remains unset in `.env.local`, so `sendSignatureInvite` no-ops with `notConfigured`. Preserved deliberately — no fallback sender was added. The route surfaces `notConfigured` in its response.

## Blocked

**`.env.example` was not updated.** The plan requires documenting `DOCUSEAL_API_KEY` and `DOCUSEAL_WEBHOOK_SECRET` there. A permission rule denies reading `.env*`, and the Write tool requires a prior read. I did not circumvent it via shell, since that rule is a deliberate guard on env files.

**Pete: please add to `.env.example`** (both server-only — never `NEXT_PUBLIC_*`):

```
# DocuSeal — split-sheet e-signature (17-06). SERVER-SIDE ONLY.
# Dashboard → API → X-Auth-Token
DOCUSEAL_API_KEY=
# Dashboard → Webhooks. Used as-is (whsec_-prefixed) as the HMAC-SHA256 key
# over `{unixSeconds}.{rawBody}` — see lib/esign/webhook.ts.
DOCUSEAL_WEBHOOK_SECRET=
```

## Known Stubs

None. The signing embed is fully wired to its data source.

## Deferred Issues

`npm run build` fails on `app/(artist)/contracts/page.tsx` — pre-existing from 17-05 (`b349e5a`), untouched by this plan and out of scope. Logged in `deferred-items.md` with the fix and an explanation of why `tsc` and lint stayed green while the build was red. Webpack compilation itself succeeds, so `@docuseal/react` bundling is confirmed.

## Threat Flags

None. All new surface maps to the plan's existing threat register (T-17-15 through T-17-19, T-17-35, T-17-36, T-17-SC).

## Commits

| Commit | Scope |
|---|---|
| `b82b92e` | DocuSeal fetch adapter + 26 tests |
| `551c829` | AM-2c new-recipient cap replacing the document cap |
| `d68fc84` | Mint + void routes |
| `d17a8f1` | Embedded signing surface + approve-page wiring |

## Self-Check: PASSED

All five created source files and both planning artifacts verified present on disk; all four commit hashes verified in `git log`.
