---
phase: 17-split-sheet-esign
plan: 01
subsystem: api
tags: [docuseal, hmac, webhook, readiness, split-sheets, notifications, jest, tdd]

# Dependency graph
requires: []
provides:
  - "EsignState.provider union extended with 'docuseal'; readEsignState round-trips it"
  - "verifyDocusealSignature + parseDocusealEvent (lib/esign/webhook.ts) — pure, credential-free HMAC verification + event mapping"
  - "SPLIT_SHEET_TIER_MAP + deriveSheetTier + projectSplitTier + isRenegotiating (lib/vault/readiness-tiers.ts) — single source of truth for 5/10/15 tiering"
  - "MONTHLY_ENVELOPE_CAP + VOIDED_ENVELOPES_COUNT_TOWARD_CAP + checkMonthlyCap + buildFastLaneBackfill + buildVoidReset (lib/split-sheets/envelopes.ts)"
  - "reconcileSplits (lib/split-sheets/reconciliation.ts) — never-silent diff between split_sheet_parties and composers[]"
  - "5 new split-sheet notification builders in lib/social/notifications.ts"
affects: [17-02, 17-03, 17-04, 17-05, 17-06, 17-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-named-flag pattern for unresolved provider-billing questions (VOIDED_ENVELOPES_COUNT_TOWARD_CAP) instead of scattered hard-coded assumptions"
    - "Single canonical status->tier map (SPLIT_SHEET_TIER_MAP) consumed by both a future SQL trigger and its TS twin to prevent drift"
    - "Pure diff-only reconciliation (reconcileSplits) — no mutation, write-back always offered/confirmed by caller"

key-files:
  created:
    - lib/esign/webhook.ts
    - lib/esign/webhook.test.ts
    - lib/vault/readiness-tiers.ts
    - lib/vault/readiness-tiers.test.ts
    - lib/split-sheets/envelopes.ts
    - lib/split-sheets/envelopes.test.ts
    - lib/split-sheets/reconciliation.ts
    - lib/split-sheets/reconciliation.test.ts
    - lib/social/notifications.test.ts
  modified:
    - lib/esign/provider.ts
    - lib/social/notifications.ts

key-decisions:
  - "Webhook signature format defined as {timestampMs}.{hexHmac} (HMAC-SHA256 over '{timestampMs}.{rawBody}') since DocuSeal's exact byte format isn't verified pre-provider-gate; documented in webhook.ts's header comment so 17-07's live route can correct it against the real payload if needed."
  - "checkMonthlyCap's input field named voidedCount (plan behavior block listed both 'voidedCount' and 'voidsCount' in the same destructure — treated as an authoring duplicate, picked the clearer name)."
  - "Split-sheet notification builders use partyId as actorId since split_sheet_parties rows aren't guaranteed a Funūn user_id (parties may not have accounts)."
  - "Notification link target is the anticipated /split-sheets/[id] detail route (not yet built — lands in a later Phase 17 plan), matching the existing precedent of linking to not-yet-built routes (e.g. /messages?thread=)."

patterns-established:
  - "Pure webhook verification module (no fetch/Supabase) fully testable with Node's own crypto against fixture secrets — reused by 17-07's live route with no re-implementation."

requirements-completed: [ESIGN-01, ESIGN-05, ESIGN-07, ESIGN-08, ESIGN-09, ESIGN-12, ESIGN-13]

coverage:
  - id: D1
    description: "EsignProvider contract carries a 'docuseal' provider id and readEsignState round-trips a persisted DocuSeal state"
    requirement: "ESIGN-01"
    verification:
      - kind: unit
        ref: "lib/esign/webhook.test.ts (parseDocusealEvent suite proves provider-shape compatibility); provider.ts change verified via tsc + full suite green"
        status: pass
    human_judgment: false
  - id: D2
    description: "DocuSeal webhook HMAC verification + payload parsing reject tampered/stale/malformed signatures without any live account"
    requirement: "ESIGN-07"
    verification:
      - kind: unit
        ref: "lib/esign/webhook.test.ts#verifyDocusealSignature and #parseDocusealEvent (14 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Single canonical split-sheet readiness tier map (draft=0/pending_approval=5/countered=5/approved=10/esign_pending=10/executed=15) with pessimistic-MIN project derivation"
    requirement: "ESIGN-08"
    verification:
      - kind: unit
        ref: "lib/vault/readiness-tiers.test.ts (16 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Monthly envelope cap check honors a single named void-counting flag at the boundary; fast-lane and void produce correct P17-01/P17-02 state shapes"
    requirement: "ESIGN-13"
    verification:
      - kind: unit
        ref: "lib/split-sheets/envelopes.test.ts (14 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "reconcileSplits matches by normalized name, flags mismatches, and never mutates composers[]"
    requirement: "ESIGN-12"
    verification:
      - kind: unit
        ref: "lib/split-sheets/reconciliation.test.ts (8 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Five new initiator-facing split-sheet notification builders (approved/signed/countered-highest-urgency/executed/view-nudge-with-resend) follow the Phase 10 catalog shape"
    requirement: "ESIGN-09"
    verification:
      - kind: unit
        ref: "lib/social/notifications.test.ts (6 tests)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Any-party void-of-envelope pure state transition (buildVoidReset) resets to countered/pending_approval and marks envelope voided (not deleted)"
    requirement: "ESIGN-05"
    verification:
      - kind: unit
        ref: "lib/split-sheets/envelopes.test.ts#buildVoidReset (3 tests)"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-07-20
status: complete
---

# Phase 17 Plan 01: E-Sign Foundation Summary

**DocuSeal added to the dual-provider e-sign contract, plus four new pure/tested helper modules (webhook HMAC verification, single-source split-sheet readiness tiers, envelope lifecycle helpers with cap/fast-lane/void, and never-silent splits reconciliation) and five new initiator notification builders — zero DocuSeal credentials required.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-07-20
- **Tasks:** 3 of 3 completed
- **Files modified:** 11 (2 modified, 9 created)

## Accomplishments
- `lib/esign/provider.ts` now speaks DocuSeal: `EsignState.provider` includes `'docuseal'` and `readEsignState()` round-trips it instead of coercing to `dropbox_sign`.
- `lib/esign/webhook.ts`: pure `verifyDocusealSignature` (HMAC-SHA256, `crypto.timingSafeEqual`, 5-minute staleness window) and `parseDocusealEvent` (maps `submission.completed`/`form.completed`/`form.declined` to the shared `EsignWebhookEvent` shape, unknown events fall through to `'other'`).
- `lib/vault/readiness-tiers.ts`: `SPLIT_SHEET_TIER_MAP` (the single canonical status→tier mapping), `deriveSheetTier`, `projectSplitTier` (pessimistic MIN across a project's sheets), `isRenegotiating`.
- `lib/split-sheets/envelopes.ts`: `MONTHLY_ENVELOPE_CAP` (10), `VOIDED_ENVELOPES_COUNT_TOWARD_CAP` (single named flag), `checkMonthlyCap`, `buildFastLaneBackfill` (P17-01), `buildVoidReset` (P17-02).
- `lib/split-sheets/reconciliation.ts`: `reconcileSplits` — normalized-name matching, matched/unmatched/extra diff rows, `needsWriteBack` flag, never mutates its `composers[]` input.
- `lib/social/notifications.ts`: 5 new catalog entries + builders (`split_sheet_party_approved`, `split_sheet_party_signed`, `split_sheet_countered`, `split_sheet_executed`, `split_sheet_view_nudge`) plus the module's first co-located test file.

## Task Commits

Each task was committed atomically (RED→GREEN per task, no separate commits since RED failures were caught before commit):

1. **Task 1: Extend EsignProvider contract for DocuSeal + pure webhook verification** - `4a44fe5` (feat)
2. **Task 2: Readiness tier map + envelope lifecycle helpers** - `3fd1fae` (feat)
3. **Task 3: Splits reconciliation diff + initiator notification builders** - `d1efd02` (feat)

_Note: each task's RED tests were written and confirmed failing (module-not-found) before the corresponding implementation was written and confirmed green, then committed as a single feat commit per this codebase's convention of one commit per completed task._

## Files Created/Modified
- `lib/esign/provider.ts` - Added `'docuseal'` to the provider union; round-trip fix in `readEsignState`
- `lib/esign/webhook.ts` - `verifyDocusealSignature`, `parseDocusealEvent`, `WEBHOOK_STALENESS_WINDOW_MS`
- `lib/esign/webhook.test.ts` - 14 tests covering valid/tampered/stale/malformed/wrong-secret/near-miss-signature cases + event mapping
- `lib/vault/readiness-tiers.ts` - `SPLIT_SHEET_TIER_MAP`, `deriveSheetTier`, `projectSplitTier`, `isRenegotiating`
- `lib/vault/readiness-tiers.test.ts` - 16 tests covering every tier, MIN-across-sheets, unknown-status fallback
- `lib/split-sheets/envelopes.ts` - `MONTHLY_ENVELOPE_CAP`, `VOIDED_ENVELOPES_COUNT_TOWARD_CAP`, `checkMonthlyCap`, `buildFastLaneBackfill`, `buildVoidReset`
- `lib/split-sheets/envelopes.test.ts` - 14 tests covering cap boundary, both void-counting states, fast-lane and void shapes
- `lib/split-sheets/reconciliation.ts` - `reconcileSplits`, `normalizeName`/`round2` internals
- `lib/split-sheets/reconciliation.test.ts` - 8 tests covering match/mismatch/unmatched/extra + no-mutation guard
- `lib/social/notifications.ts` - 5 new catalog entries + builders
- `lib/social/notifications.test.ts` - 6 tests (new file) covering all 5 new builders

## Decisions Made
- Defined the DocuSeal webhook signature format as `{timestampMs}.{hexHmac}` (HMAC-SHA256 over `{timestampMs}.{rawBody}`) since the exact byte-level format wasn't independently verified against a live account pre-provider-gate; documented inline in `webhook.ts` so 17-07's live route implementer can adjust the parsing if the real payload differs, without touching the verification algorithm itself (which is spec-correct regardless of the exact delimiter/encoding chosen).
- `checkMonthlyCap`'s cap-boundary input field is named `voidedCount` — the plan's behavior block listed both `voidedCount` and `voidsCount` in the same destructured signature, which reads as an authoring duplicate rather than two distinct fields; picked the clearer, singular name.
- Split-sheet notification builders use the party's row id as `actorId` (not a Funūn user id), since `split_sheet_parties` rows aren't guaranteed a `user_id` — collaborators may not have Funūn accounts. This keeps the builders honest about "who acted" without inventing a fake user identity.
- Notification `link` targets `/split-sheets/[id]`, a route not yet built (lands in a later Phase 17 plan) — this mirrors existing precedent (`buildNewDmNotification` already links to `/messages?thread=` for a route built alongside it) rather than blocking the notification shape on route existence.

## Deviations from Plan

None — plan executed exactly as written. The two interpretive choices above (webhook format, `checkMonthlyCap` field naming) were necessary because the plan's behavior block left those specifics to implementation discretion (explicitly noted in RESEARCH as unverified pending the provider gate, or containing an apparent duplicate field name) — no Rule 1-4 auto-fix was needed since nothing was broken; these were judgment calls within the plan's own "Claude's Discretion" scope (17-CONTEXT.md).

## Issues Encountered
- Initial webhook test included a `jest.spyOn(crypto, 'timingSafeEqual')` assertion to directly verify constant-time comparison; Node's native `crypto` module exports are non-configurable, so `Object.defineProperty` (which `jest.spyOn` uses internally) threw `TypeError: Cannot redefine property`. Replaced with a behavioral regression test (a signature correct in every byte but the last is rejected identically to a wildly wrong one) that exercises the same guarantee without depending on spy-ability of a native binding.
- Caught and fixed a `cd` command that drifted the working directory from the isolated worktree into the shared main-repo checkout partway through initial state-gathering (before any file edits were made) — re-verified `pwd`/`git rev-parse --show-toplevel` pointed at the worktree before any Edit/Write/commit, and re-ran the baseline `npx jest` from the correct root. No edits were made from the wrong location.

## User Setup Required
None - no external service configuration required. This plan is explicitly credential-free (no DocuSeal API calls, no network, no migrations).

## Next Phase Readiness
- `SPLIT_SHEET_TIER_MAP`, `checkMonthlyCap`, `buildFastLaneBackfill`, `buildVoidReset`, and `reconcileSplits` are ready for 17-02 (schema + DB trigger) and 17-06 (mint/void routes) to consume without re-deriving any of this logic.
- `verifyDocusealSignature`/`parseDocusealEvent` are ready for 17-07's live webhook route to wire I/O around.
- The five new notification builders are ready for whichever plan wires the initiator-notification call sites (approve/counter/mint/void/webhook routes).
- No blockers. Execution of subsequent Phase 17 plans that touch a real DocuSeal account remains gated on Pete's provider-verification trial per `17-CONTEXT.md`'s Provider Verification Gate — this plan did not require or touch that gate.

---
*Phase: 17-split-sheet-esign*
*Completed: 2026-07-20*

## Self-Check: PASSED

All 9 created files verified present on disk; all 3 task commit hashes (4a44fe5, 3fd1fae, d1efd02) verified present in git log.
