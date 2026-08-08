---
phase: 26-sync-library-inclusion
plan: 02
subsystem: api
tags: [typescript, jest, tdd, state-machine, capability-grants]

requires:
  - phase: 26-sync-library-inclusion (plan 01)
    provides: migration 096 draft (sync_listings table + capability_grants/vault_documents CHECK widening) — the canonical enum values this plan's types mirror
provides:
  - "lib/sync-library/submission.ts — the single authority for legal sync_listings.status transitions (isValidTransition, nextStatusOnAgreementSigned, initialStatusForEntry, isTerminal)"
  - "lib/sync-library/eligibility.ts — hasSyncLibraryCapability(grant) pure eligibility predicate"
  - "types/index.ts SyncListingStatus, SyncListingEntrySource, SyncListing types"
  - "DocumentType widened with 'blanket_agreement', with DOC_LABELS entries added everywhere it's exhaustively keyed"
affects: [26-03, 26-04, 26-05, 26-08]

tech-stack:
  added: []
  patterns:
    - "Pure predicate/transform functions accept an already-fetched shape, reject invalid input early, never throw (mirrors lib/deals/catalog.ts's isRightsReady/buildCatalogFilter)"
    - "Status-transition adjacency map (Record<Status, Status[]>) as single source of truth, unit-tested exhaustively including terminal-exit and self-loop rejection"

key-files:
  created:
    - lib/sync-library/submission.ts
    - lib/sync-library/submission.test.ts
    - lib/sync-library/eligibility.ts
    - lib/sync-library/eligibility.test.ts
  modified:
    - types/index.ts
    - lib/contracts/locker-rows.ts
    - lib/contracts/verify.ts

key-decisions:
  - "SyncListingStatus type lives in types/index.ts (not re-exported from lib/sync-library/submission.ts) to preserve the codebase's established types/index.ts-is-the-leaf-source-of-truth layering; submission.ts imports it as a type-only dependency."
  - "Rule 3 fix: lib/contracts/verify.ts's DOC_LABEL Record<DocumentType, string> (not in this plan's files_modified list) required a blanket_agreement entry too — found via grep for other exhaustive DocumentType consumers, per the plan's explicit instruction."

requirements-completed: [SYNCLIB-01, SYNCLIB-02]

coverage:
  - id: D1
    description: "Sync-listing status state machine (SYNC_LISTING_STATUSES, isValidTransition, nextStatusOnAgreementSigned, initialStatusForEntry, isTerminal) — pure, fully unit-tested authority"
    requirement: SYNCLIB-01
    verification:
      - kind: unit
        ref: "lib/sync-library/submission.test.ts (49 tests: full legal-edge table, illegal-edge table incl. terminal-exit/self-loop, unknown-string safety)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Eligibility predicate hasSyncLibraryCapability + shared types (SyncListingStatus, SyncListing) + DocumentType widened with blanket_agreement"
    requirement: SYNCLIB-02
    verification:
      - kind: unit
        ref: "lib/sync-library/eligibility.test.ts (4 tests: approved/pending/wrong-capability/null)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit (clean, confirms DocumentType widening does not break any exhaustive consumer)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-08-08
status: complete
---

# Phase 26 Plan 02: Sync-Library Domain Core (State Machine + Eligibility + Types) Summary

**Pure, fully unit-tested sync-listing status state machine and eligibility predicate — the single authority Wave 2 write routes (26-03/04/05) will import instead of re-deriving transition rules inline.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 completed (both TDD)
- **Files modified:** 6 (4 created, 2 modified for DocumentType widening pass-through)

## Accomplishments

- Built `lib/sync-library/submission.ts` — `SYNC_LISTING_STATUSES` tuple matching migration 096's CHECK enum exactly, plus `isValidTransition`, `nextStatusOnAgreementSigned`, `initialStatusForEntry`, and `isTerminal`, all pure functions over a single `Record<SyncListingStatus, SyncListingStatus[]>` adjacency map. 49 tests cover every legal edge, every terminal-exit/self-loop rejection, and unknown-string safety (never throws).
- Built `lib/sync-library/eligibility.ts` — `hasSyncLibraryCapability(grant)`, mirroring `isRightsReady`'s pure-predicate shape. 4 tests cover approved/pending/wrong-capability/null.
- Widened `types/index.ts` with `SyncListingStatus`, `SyncListingEntrySource`, `SyncListing` (mirroring migration 096's columns), and added `'blanket_agreement'` to `DocumentType`.
- Grepped for every exhaustive `Record<DocumentType, ...>` and `switch` on document type; found and fixed two (`lib/contracts/locker-rows.ts`'s `DOC_LABELS` + `detailFor()`, and `lib/contracts/verify.ts`'s `DOC_LABEL`) so `npx tsc --noEmit` stays clean.

## Task Commits

Each task followed the RED → GREEN TDD cycle:

1. **Task 1: Sync-listing status state machine**
   - `a85672f` (test) — failing `submission.test.ts` (verified RED: import resolution failure with `submission.ts` absent)
   - `2ab1826` (feat) — `submission.ts` implementation + `types/index.ts` `SyncListingStatus` (pulled forward, see Deviations) — verified GREEN (49/49 passing)
2. **Task 2: Eligibility predicate + shared types**
   - `6fa882b` (test) — failing `eligibility.test.ts` (verified RED: module not found)
   - `8fae6a8` (feat) — `eligibility.ts` implementation, `SyncListing`/`DocumentType` widening in `types/index.ts`, and the two Rule-3 `DOC_LABEL(S)` fixes — verified GREEN (4/4 passing) + `npx tsc --noEmit` clean

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `lib/sync-library/submission.ts` — status-transition state machine (the single authority)
- `lib/sync-library/submission.test.ts` — 49 tests (full legal/illegal transition table, agreement-signed/initial-status/terminal helpers, unknown-string safety)
- `lib/sync-library/eligibility.ts` — `hasSyncLibraryCapability` pure predicate
- `lib/sync-library/eligibility.test.ts` — 4 tests
- `types/index.ts` — added `SyncListingStatus`, `SyncListingEntrySource`, `SyncListing`; widened `DocumentType` with `'blanket_agreement'`
- `lib/contracts/locker-rows.ts` — added `DOC_LABELS.blanket_agreement` + `detailFor()` case
- `lib/contracts/verify.ts` — added `DOC_LABEL.blanket_agreement` (Rule 3, out-of-plan-list fix)

## Decisions Made

- **`SyncListingStatus` defined in `types/index.ts`, not re-exported from `lib/sync-library/submission.ts`.** The plan's Task 1 (`submission.ts`) needs the type to compile before Task 2 (which is where the plan places the `types/index.ts` addition) executes. Rather than either (a) having `submission.ts` locally define its own copy of the type (drift risk — this plan's own threat model, T-26-05, calls out transition-table drift as a mitigation target) or (b) having `types/index.ts` import from `lib/sync-library/` (reversing this codebase's established leaf-source-of-truth layering, where `types/index.ts` is imported BY `lib/`, never the other way — see `lib/contracts/locker-rows.ts`'s `import type { DocumentType } from '@/types'`), the `SyncListingStatus` type declaration was pulled forward into Task 1's commit and `submission.ts` imports it from `@/types` as originally specified. Task 2 then added the remaining `SyncListing`/`SyncListingEntrySource` types and the `DocumentType` widening on top.
- **Two exhaustive `DocumentType` consumers fixed, not one.** The plan named `lib/contracts/locker-rows.ts`'s `DOC_LABELS` explicitly and instructed grepping for others. The grep found `lib/contracts/verify.ts`'s `DOC_LABEL` (used for AI contract-verification prompts) as a second exhaustive `Record<DocumentType, string>` that would have broken `tsc` — fixed per Rule 3.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking compile dependency] `SyncListingStatus` type pulled forward from Task 2 into Task 1**
- **Found during:** Task 1 (writing `submission.ts`, which per the plan's own read_first / behavior spec imports the status type)
- **Issue:** Task 1's files (`submission.ts`, `submission.test.ts`) reference `SyncListingStatus`, but the plan places that type's addition to `types/index.ts` in Task 2. Executing Task 1 standalone would not compile.
- **Fix:** Added only the `SyncListingStatus` type declaration to `types/index.ts` as part of Task 1's GREEN commit; Task 2 added the remaining `SyncListing`/`SyncListingEntrySource` types and the `DocumentType` widening.
- **Files modified:** `types/index.ts`
- **Verification:** `npx jest lib/sync-library/submission.test.ts` GREEN (49/49) after the addition.
- **Committed in:** `2ab1826` (part of Task 1's feat commit)

**2. [Rule 3 - Blocking issue, exhaustive type consumer] `lib/contracts/verify.ts`'s `DOC_LABEL` needed a `blanket_agreement` entry**
- **Found during:** Task 2, following the plan's explicit instruction to "grep for any other exhaustive Record<DocumentType or switch on document type"
- **Issue:** `lib/contracts/verify.ts` defines a second, independent `Record<DocumentType, string>` (`DOC_LABEL`, used to build AI verification prompts) not named in the plan's `files_modified` list. Widening `DocumentType` without touching it would fail `tsc --noEmit`.
- **Fix:** Added `blanket_agreement: 'sync library agreement'` to `DOC_LABEL`.
- **Files modified:** `lib/contracts/verify.ts`
- **Verification:** `npx tsc --noEmit` clean.
- **Committed in:** `8fae6a8` (part of Task 2's feat commit)

**3. [Rule 1 - Bug] `locker-rows.ts`'s `detailFor()` switch also needed a `blanket_agreement` case**
- **Found during:** Task 2
- **Issue:** `detailFor()` is a non-exhaustive-safe `switch (type)` over `DocumentType` with an explicit `string` return type and no `default` — widening the union without adding a case would make `tsc` flag a missing return path (`TS2366`).
- **Fix:** Added `case 'blanket_agreement': return \`${projectTitle} · sync library agreement\``.
- **Files modified:** `lib/contracts/locker-rows.ts`
- **Verification:** `npx tsc --noEmit` clean.
- **Committed in:** `8fae6a8` (part of Task 2's feat commit)

---

**Total deviations:** 3 auto-fixed (all Rule 3 — blocking compile dependencies surfaced by the type widening; one borderline Rule 1)
**Impact on plan:** All fixes are minimal, additive, and necessary for the plan's own stated success criterion ("DocumentType widening does not break any exhaustive consumer"). No scope creep — no new business logic, no files touched beyond what compilation required.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None — no external service configuration required. This plan ships only pure TypeScript library code, no DB, no API routes, no environment variables.

## Next Phase Readiness

`lib/sync-library/submission.ts` and `lib/sync-library/eligibility.ts` are ready to be imported by the Wave 2 write routes (26-03 submit/mint-agreement, 26-04 webhook dispatch, 26-05 admin admit/reject/invite/remove) and the dashboard spotlight card / hub gating (26-08). No blockers. Migration 096 (26-01, human-gated `supabase db push`) still needs to land before any Wave 2 route can actually persist a `sync_listings` row — this plan's domain core has no DB dependency and runs independently of that gate, per its design intent.

---
*Phase: 26-sync-library-inclusion*
*Completed: 2026-08-08*

## Self-Check: PASSED

All created files confirmed present on disk (`lib/sync-library/submission.ts`, `submission.test.ts`, `eligibility.ts`, `eligibility.test.ts`, this SUMMARY.md). All 4 commit hashes (`a85672f`, `2ab1826`, `6fa882b`, `8fae6a8`) confirmed present in `git log --oneline --all`.

## TDD Gate Compliance

Both tasks followed the correct RED → GREEN sequence, verified in git log:
- Task 1: `a85672f` (test, RED — confirmed failing via temporary file removal) → `2ab1826` (feat, GREEN — 49/49 passing)
- Task 2: `6fa882b` (test, RED — confirmed failing, module not found) → `8fae6a8` (feat, GREEN — 4/4 passing, `npx tsc --noEmit` clean)
