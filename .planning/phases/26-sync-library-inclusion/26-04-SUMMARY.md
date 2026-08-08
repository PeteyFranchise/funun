---
phase: 26-sync-library-inclusion
plan: 04
subsystem: api
tags: [docuseal, esign, react-pdf, sync-library, blanket-agreement, webhook]

# Dependency graph
requires:
  - phase: 26-sync-library-inclusion
    provides: sync_listings state machine (lib/sync-library/submission.ts), migration 096 (sync_listings table, vault_documents.type widened to include blanket_agreement)
provides:
  - Versioned, swappable blanket-agreement template module (lib/sync-library/agreement.ts)
  - Unicode-safe blanket-agreement PDF renderer (lib/vault/pdf/blanket-agreement.tsx)
  - Sign-once mint route (POST /api/sync-library/mint-agreement)
  - DocuSeal webhook dispatch-by-lookup extension for blanket-agreement completions
affects: [26-05, 26-06, 26-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Versioned/swappable legal-document content module (getCurrentBlanketAgreement()) — content and version live in one file; renderer and routes never hardcode copy"
    - "Lightweight vault_documents.document_data.esign JSONB e-sign path (readEsignState/allSigned) as an alternative to the relational esign_envelopes schema for non-split-sheet documents"
    - "Webhook dispatch-by-lookup: try the primary resolution first, fall back to a secondary lookup ONLY when the primary comes back empty, never the reverse"

key-files:
  created:
    - lib/sync-library/agreement.ts
    - lib/sync-library/agreement.test.ts
    - lib/vault/pdf/blanket-agreement.tsx
    - app/api/sync-library/mint-agreement/route.ts
    - app/api/sync-library/mint-agreement/route.test.ts
  modified:
    - app/api/webhooks/docuseal/route.ts

key-decisions:
  - "Blanket-agreement title ('Funūn Sync Library Agreement') and content live in ONE module (lib/sync-library/agreement.ts) so the DocuSeal request title, the PDF's own title, and any future signing-surface copy can never drift out of sync — swap the counsel-approved version by replacing the content constant and bumping the version, no caller change"
  - "Persisted the DocuSeal per-signer embed slug/src as extra document_data.esign keys (embedSlug/embedSrc) beyond the shared EsignState contract, so a second mint-agreement call (still-pending branch) or the future signing surface (26-07) can resolve the embed without re-minting"
  - "Sign-once idempotency treats ANY existing vault_documents(type='blanket_agreement') row for the artist — signed or pending — as reason to never mint a second one; distinguishes signed vs pending via readEsignState/allSigned rather than a second status column"
  - "Webhook dispatch fallback to vault_documents is tried ONLY when the esign_envelopes lookup returns null, preserving 'split-sheet completion runs the original path unchanged' by construction (the new code path is unreachable when an envelope row matches)"

patterns-established:
  - "getCurrentBlanketAgreement() bundle pattern: version + sections + title returned together from a single pure function, consumed by both the PDF renderer and any route needing signing-surface copy"

requirements-completed: [SYNCLIB-06, SYNCLIB-07]

coverage:
  - id: D1
    description: "Versioned, swappable blanket-agreement template (lib/sync-library/agreement.ts) with structured sections sourced from the owner-authored draft"
    requirement: SYNCLIB-06
    verification:
      - kind: unit
        ref: "lib/sync-library/agreement.test.ts — all 4 tests"
        status: pass
    human_judgment: false
  - id: D2
    description: "Unicode-safe blanket-agreement PDF renderer (lib/vault/pdf/blanket-agreement.tsx) importing registerFunuunPdfFonts() and embedding a single partyRoleTag(0) signature field"
    requirement: SYNCLIB-06
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (compiles the .tsx renderer; module-load-time registerFunuunPdfFonts() call verified via successful jest runs that import it transitively through the mint-agreement route)"
        status: pass
    human_judgment: true
    rationale: "PDF visual layout (Unicode glyph rendering, signature-field placement, section pagination) is not exercised by an automated visual test in this plan — a live DocuSeal round-trip is explicitly deferred to the phase gate per this plan's own <verification> section."
  - id: D3
    description: "POST /api/sync-library/mint-agreement — sign-once mint via the lightweight document_data.esign path, gates-before-spend (409 with no pending cohort), and cohort advance to agreement_pending"
    requirement: SYNCLIB-06
    verification:
      - kind: unit
        ref: "app/api/sync-library/mint-agreement/route.test.ts — all 6 tests (401, existing signed, existing pending, 409 no cohort, first-mint persistence shape, no esign_envelopes row created)"
        status: pass
    human_judgment: false
  - id: D4
    description: "DocuSeal webhook dispatch-by-lookup: blanket-agreement completions resolve via a vault_documents fallback and advance the artist's pre-signed cohort to pending_admit, without ever running split-sheet fanout/certificate logic; split-sheet completions run unchanged"
    requirement: SYNCLIB-07
    verification:
      - kind: unit
        ref: "__tests__/docuseal-webhook.test.ts — all 18 pre-existing tests still pass unchanged (split-sheet path, signature gate, idempotency, unknown-submission fallback all exercised)"
        status: pass
      - kind: unit
        ref: "npx jest (full suite) — 141 suites / 1688 tests pass"
        status: pass
    human_judgment: true
    rationale: "No new automated test exercises the blanket-agreement completion branch itself (only its non-interference with the existing split-sheet suite is proven). A live DocuSeal round-trip — sign, confirm the webhook advances the listing to pending_admit — is explicitly deferred to the phase gate per this plan's <verification> section."

duration: 55min
completed: 2026-08-08
status: complete
---

# Phase 26 Plan 04: Blanket-Agreement E-Sign + Webhook Dispatch Summary

**Sign-once artist->Funūn blanket agreement via the lightweight `vault_documents.document_data.esign` path, with a versioned/swappable template and a DocuSeal webhook extension that dispatches blanket-agreement completions without touching split-sheet fanout.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-08-08T00:00:00Z (approx.)
- **Completed:** 2026-08-08T00:55:00Z (approx.)
- **Tasks:** 3
- **Files modified:** 6 (5 created, 1 extended)

## Accomplishments
- `lib/sync-library/agreement.ts` — single-source-of-truth versioned template (`BLANKET_AGREEMENT_VERSION`, `BLANKET_AGREEMENT_SECTIONS`, `BLANKET_AGREEMENT_TITLE`, `getCurrentBlanketAgreement()`), content transcribed from the owner-authored draft including its non-final-draft Notice, swappable by replacing the content constant and bumping the version
- `lib/vault/pdf/blanket-agreement.tsx` — sibling PDF renderer to `split-sheet.tsx`, imports `registerFunuunPdfFonts()` (P17-08 Unicode regression guard) and embeds exactly one `{{Signature;role=Party1}}` field (single-signer, no Funūn countersignature)
- `POST /api/sync-library/mint-agreement` — sign-once mint: an existing agreement (signed or pending) short-circuits before any DocuSeal call; a fresh mint runs gates-before-spend (409 when the artist has no `applied`/`invited`/`agreement_pending` listing), renders the current template, calls `docusealProvider.createRequest()` exactly once, and persists a single `vault_documents(type='blanket_agreement')` row — never an `esign_envelopes` row
- Extended `app/api/webhooks/docuseal/route.ts` with a dispatch-by-lookup fallback: when no `esign_envelopes` row matches the completion's submission id, a second lookup against `vault_documents.document_data->esign->>requestId` resolves a blanket-agreement completion, which marks the document signed, re-hosts the executed PDF, and advances the artist's pre-signed cohort to `pending_admit` — the split-sheet path (fanout, certificate) is untouched and unreachable from this branch

## Task Commits

Each task was committed atomically:

1. **Task 1: Versioned blanket-agreement template + Unicode-safe PDF renderer** - `3626001` (feat)
2. **Task 2: POST /api/sync-library/mint-agreement — sign-once, server-only DocuSeal mint** - `49766dc` (feat)
3. **Task 3: Extend the DocuSeal webhook — dispatch by document kind** - `c367fc9` (feat)

_No plan-metadata commit — STATE.md/ROADMAP.md updates are owned by the orchestrator per this plan's execution instructions._

## Files Created/Modified
- `lib/sync-library/agreement.ts` - versioned/swappable blanket-agreement content module
- `lib/sync-library/agreement.test.ts` - version/sections/title contract tests
- `lib/vault/pdf/blanket-agreement.tsx` - Unicode-safe single-signer PDF renderer
- `app/api/sync-library/mint-agreement/route.ts` - sign-once DocuSeal mint route
- `app/api/sync-library/mint-agreement/route.test.ts` - 6 tests covering auth, sign-once, gates, and persistence shape
- `app/api/webhooks/docuseal/route.ts` - added `BlanketAgreementDocRow` type + `handleBlanketAgreementCompletion()` + the fallback lookup inside the existing `if (!envelope)` branch

## Decisions Made
- Reused `partyRoleTag()` from `lib/vault/pdf/split-sheet.tsx` in the blanket-agreement renderer and the mint route (rather than duplicating the helper) so the PDF's embedded role tag and the DocuSeal `submitters[].role` can never drift apart — both call sites derive `"Party1"` from the same function.
- Stored the DocuSeal embed `slug`/`embedSrc` as extra keys on `document_data.esign` (`embedSlug`, `embedSrc`) beyond the shared `EsignState` type. `readEsignState()`/`allSigned()` ignore the extra keys (by design — they only read the vendor-agnostic fields), so this doesn't touch the shared contract; it lets a second `mint-agreement` call (still-pending branch) return the same embed info without re-minting.
- Did not implement version-mismatch/re-sign handling (an artist who signed `draft-0.1` staying valid if a later version ships) — 26-CONTEXT.md scopes that as a future concern ("a re-sign is needed only if the agreement version materially changes"), and this plan's done-criteria list doesn't call for it.

## Deviations from Plan

None - plan executed exactly as written. All three tasks' `<action>` and `<done>` criteria were implemented as specified; no Rule 1/2/3 auto-fixes were needed and no Rule 4 architectural questions came up.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. `DOCUSEAL_API_KEY`/`DOCUSEAL_WEBHOOK_SECRET` were already configured for the Phase 17 split-sheet integration and are reused as-is; no new env vars introduced by this plan.

## Next Phase Readiness
- The mint route and webhook dispatch are ready for 26-07 (signing surface UI) to call `POST /api/sync-library/mint-agreement` and render the returned `embed.src` in a DocuSeal embed iframe.
- The counsel-approved agreement swap (when it lands) is a content-only change to `lib/sync-library/agreement.ts` plus bumping `BLANKET_AGREEMENT_VERSION` — no route or renderer change needed.
- **Deferred to the phase gate (per this plan's own `<verification>` section):** a live DocuSeal round-trip — sign the blanket agreement, confirm the webhook advances a real listing to `pending_admit` — has not been exercised against the live provider. This is explicit, planned deferral, not a gap introduced by this execution.
- No blockers for 26-05/26-06 (admin curation/admission) or 26-07 (signing surface) — both can build against the `vault_documents(type='blanket_agreement')` row shape and `mint-agreement`'s response contract established here.

---
*Phase: 26-sync-library-inclusion*
*Completed: 2026-08-08*

## Self-Check: PASSED

All 6 created/modified files confirmed present on disk; all 3 task commits (`3626001`, `49766dc`, `c367fc9`) confirmed in `git log`. Full suite (`npx jest`) green: 141 suites / 1688 tests. `npx tsc --noEmit` clean.
