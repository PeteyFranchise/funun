---
phase: 19-profile-identity-model-cleanup
plan: 06
subsystem: split-sheets-identity
tags: [nextjs, react, supabase, typescript, contract-locker, r4]

# Dependency graph
requires:
  - phase: 19-profile-identity-model-cleanup
    provides: "19-03's POST /api/split-sheets/[id]/correction-flag route, split_sheet_identity_flagged notification + buildIdentityCorrectionFlagNotification()'s ?stagedFlag= deep-link, and migration 074's split_sheet_identity_flags table (authored, not yet pushed)"
affects: [19-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared FLAGGABLE_FIELDS/labels/current-value-lookup module (lib/split-sheets/identity-flags.ts) as the single TS-layer source of truth consumed by both the claimed-user flag entry and the owner's staged panel, mirroring migration 074's CHECK constraint and the correction-flag route's own allowlist"
    - "Server-derived viewer-scoped party id (viewerPartyId / ownPartyId), computed in the server component/page and threaded down as plain props -- the client-side flag form never resolves 'is this my row' itself"
    - "Client interactive controls pulled OUT of an enclosing <Link> card (AwaitingSignatureSection restructured to a wrapping <div> + inner <Link className=\"block\">) to avoid nested-interactive-element navigation hijack"

key-files:
  created:
    - lib/split-sheets/identity-flags.ts
    - components/split-sheets/StagedFlagPanel.tsx
  modified:
    - components/contracts/ContractLocker.tsx
    - lib/contracts/locker-attention.ts
    - app/(artist)/contracts/page.tsx
    - app/(artist)/split-sheets/[id]/page.tsx

key-decisions:
  - "Locker flag entry rendered once per sheet (using the viewer's own resolved party id), not per-party-row -- functionally equivalent to 'own row only' since it targets exactly the viewer's identity, and sidesteps needing to expose every other party's approval state as a click target"
  - "Executed-sheet coverage in ContractLocker is scoped to split-sheet document rows already reachable there today (standalone/unattached executed sheets, or any executed sheet the viewer happens to own the project of) -- a non-owner claimed party's document row for an ATTACHED executed sheet is not currently reachable via the Locker's project-nested query (pre-existing gap: it filters vault_projects by owner, not by the fanned-out document row's own user_id); extending that visibility is out of this plan's scope and is recorded as a known limitation, not fixed here"
  - "Owner-side executed guided-apply is a plain Link to /split-sheets/new with explanatory copy -- no prefill, no new route, no amendment/lineage mechanism, per D-08's explicit 'pointer only' instruction"

requirements-completed: [R4]

coverage:
  - id: D1
    description: "A claimed user viewing their own party row on an esign_pending sheet (Awaiting Signature attention card) gets a 'this info is wrong' affordance"
    requirement: "R4"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit; npx jest lib/contracts/locker-attention.test.ts (viewerPartyId threading, 31/31 pass)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A claimed user viewing an executed split-sheet document in VerifyPanel gets the same affordance when their own party id is resolvable"
    requirement: "R4"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit; npx jest __tests__/contracts-standalone-docs.test.ts (splitSheetId/ownPartyId merge path, pass)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The flag control submits only {partyId, field (allowlisted), suggestedValue} to the correction-flag route -- no split_percentage/role control, no free-text <textarea>, no other-party write"
    requirement: "R4"
    verification:
      - kind: unit
        ref: "grep -q correction-flag components/contracts/ContractLocker.tsx; grep -iE 'split_percentage|<textarea' components/contracts/ContractLocker.tsx (zero matches)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The owner's split-sheet view consumes ?stagedFlag= and shows the flagged field's current + suggested value, scoped to the sheet owner only"
    requirement: "R4"
    verification:
      - kind: unit
        ref: "grep -q stagedFlag 'app/(artist)/split-sheets/[id]/page.tsx'; npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D5
    description: "esign_pending routes the owner into the existing void flow; executed renders a guided pointer ONLY (Link to /split-sheets/new) -- no amendment/lineage/regeneration code exists anywhere in the panel"
    requirement: "R4"
    verification:
      - kind: unit
        ref: "grep -iE 'amends_split_sheet_id|regenerate|re-mint' 'app/(artist)/split-sheets/[id]/page.tsx' components/split-sheets/StagedFlagPanel.tsx (zero matches)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Live end-to-end round trip (flag submitted from Locker -> owner bell/email -> staged panel renders real suggested value -> void withdraws the real envelope)"
    requirement: "R4"
    verification: []
    human_judgment: true
    rationale: "Migration 074 (split_sheet_identity_flags table) is authored but not yet pushed to the remote database -- per this plan's own <verification> block, the live round trip is UAT after 19-07's human-gated push, not verifiable pre-push."

# Metrics
duration: 15min
completed: 2026-07-24
status: complete
---

# Phase 19 Plan 06: R4 Frontend — Locker Flag Entry + Owner Guided Apply Summary

**Contract Locker "this info is wrong" flag entry (esign_pending + executed) posting to the 19-03 correction-flag route, plus the owner's staged-flag panel that routes esign_pending into the existing void flow and points executed at starting a new corrected sheet — no term/other-party write, no signed-document mutation.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-24T05:27:00Z
- **Completed:** 2026-07-24T05:41:00Z
- **Tasks:** 2 completed
- **Files modified:** 6 (2 new, 4 modified — 2 files beyond the plan's declared `files_modified` list, see Deviations)

## Accomplishments
- `FlagWrongIdentityForm` in `ContractLocker.tsx`: a per-sheet structured control (closed field allowlist + single suggested-value input, no free text) that posts `{ partyId, field, suggestedValue }` to `POST /api/split-sheets/[id]/correction-flag`, wired into both the `esign_pending` case (Awaiting Signature attention card) and the `executed` case (VerifyPanel, for split-sheet documents already reachable in the Locker)
- `StagedFlagPanel.tsx`: the owner's `?stagedFlag=` deep-link target — shows the flagged field's current vs. suggested value, then branches by sheet status: `esign_pending` gets a "Withdraw signature request" button routed into the existing void route; `executed` gets a guided-pointer-only Link to start a new split sheet, with zero new amendment/lineage mechanism
- `lib/split-sheets/identity-flags.ts` (new): the single shared TS source of truth for `FLAGGABLE_FIELDS`/labels/current-value lookup, consumed by both the flag entry and the owner panel, kept in lockstep with migration 074's CHECK constraint and the correction-flag route's own allowlist by construction
- Threaded the viewer's own `split_sheet_parties.id` through `lib/contracts/locker-attention.ts` and `app/(artist)/contracts/page.tsx` (server-derived, never client-supplied) so the Locker can target exactly the viewer's own row without a second client-side lookup

## Task Commits

Each task was committed atomically:

1. **Task 1: Contract Locker "this info is wrong" flag entry (claimed user, frozen, own row)** - `8ce5b9e` (feat)
2. **Task 2: Owner-side guided apply — staged flag + correct lifecycle next step** - `1997731` (feat)

_Note: no TDD tasks in this plan; single commit per task._

## Files Created/Modified
- `lib/split-sheets/identity-flags.ts` - New: `FLAGGABLE_FIELDS`/`FLAGGABLE_FIELD_LABELS`/`currentValueForFlaggedField()`, the shared allowlist both tasks import
- `components/contracts/ContractLocker.tsx` - `FlagWrongIdentityForm` component; wired into `AwaitingSignatureSection` (esign_pending, restructured off the enclosing `<Link>`) and `VerifyPanel` (executed); `ContractRow.ownPartyId` field added
- `lib/contracts/locker-attention.ts` - `AttentionPartyInput.partyId`, `ViewerContext.partyId`, `AwaitingSignatureRow.viewerPartyId` — threads the viewer's own party id through `resolveViewerContext()`
- `app/(artist)/contracts/page.tsx` - Threads `partyId: p.id` into `toAttentionSheets()`; batch-resolves `ownPartyId` for split-sheet document rows already reachable in the Locker
- `components/split-sheets/StagedFlagPanel.tsx` - New: owner-side staged-correction panel (void-first / guided-pointer branch)
- `app/(artist)/split-sheets/[id]/page.tsx` - Reads `searchParams.stagedFlag`, resolves the flag row + current value (defense in depth beyond RLS: the flagged party must belong to this sheet), renders `StagedFlagPanel` in the owner-only branch

## Decisions Made
- The Locker flag entry renders once per sheet card (via the viewer's server-resolved own party id), not per individual party row in a list — functionally satisfies "own row only" without needing to expose every other party's state as a separate click target.
- Executed-sheet coverage in ContractLocker is scoped to document rows already reachable there today; a non-owner claimed party's document row for an ATTACHED (not standalone) executed sheet is not currently visible in the Locker because `fetchContractRows`'s project-nested query filters `vault_projects` by owner, not by the fanned-out document row's own `user_id`. This is a pre-existing Locker data-visibility gap (predates this plan, not introduced by it) — documented here rather than silently expanded into a broader query/RLS redesign that this plan's scope did not call for.
- Owner-side executed guided-apply is a plain `Link` to `/split-sheets/new` with explanatory copy only — no prefill, no new route, matching D-08's explicit "pointer only, no amendment mechanism this phase" instruction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Built the data plumbing the plan's UI instructions assumed existed**
- **Found during:** Task 1 planning — `ContractLocker.tsx` had no existing "credit view" carrying per-party identity fields or party ids; `AttentionPartyInput`/`AwaitingSignatureRow` (esign_pending path) and `ContractRow` (executed/document path) had no field to resolve "is this the viewer's own row."
- **Issue:** Without server-derived party-id plumbing, the flag affordance would either be a non-functional stub (no `partyId` to submit) or would require a client-side guess at ownership — a Rule 2 correctness gap, not a stylistic one.
- **Fix:** Extended `lib/contracts/locker-attention.ts` (`partyId`/`viewerPartyId`, threaded through `resolveViewerContext()`) and `app/(artist)/contracts/page.tsx` (thread `partyId` into `toAttentionSheets()`; batch-resolve `ownPartyId` for split-sheet document rows via a single `split_sheet_parties` query scoped to the server-authenticated viewer). Both values are server-derived, never client-supplied.
- **Files modified:** `lib/contracts/locker-attention.ts`, `app/(artist)/contracts/page.tsx` (outside the plan's declared `files_modified: [ContractLocker.tsx, split-sheets/[id]/page.tsx]`)
- **Verification:** `npx tsc --noEmit`; `npx jest lib/contracts/locker-attention.test.ts __tests__/contracts-standalone-docs.test.ts` (31 tests, all pass, no existing assertions changed since the new fields are additive/optional)
- **Committed in:** `8ce5b9e` (Task 1 commit)

**2. [Rule 2 - Missing critical functionality] Added the shared field-allowlist module the plan's D-07 (P18-13) required but didn't name a home for**
- **Found during:** Task 1 — the plan required "field selector limited to the closed set" identical to the 19-03 route's `FLAGGABLE_FIELDS`, and Task 2 independently needed the same set (plus current-value lookup) for the owner panel.
- **Issue:** Duplicating the allowlist in two client-facing files risked exactly the drift the correction-flag route's own comment warns against ("Keep this list identical to that CHECK if either is ever extended").
- **Fix:** Added `lib/split-sheets/identity-flags.ts` as the single shared source, imported by both.
- **Files modified:** `lib/split-sheets/identity-flags.ts` (new)
- **Verification:** `npx tsc --noEmit`; both consuming files compile against the shared `FlaggableField` type
- **Committed in:** `8ce5b9e` (Task 1 commit)

**3. [Rule 1 - Bug] Restructured `AwaitingSignatureSection`'s per-sheet card to avoid a nested-interactive-element bug**
- **Found during:** Task 1, while wiring the flag form into the existing `<Link href=".../split-sheets/[id]">` card
- **Issue:** The existing card was a single `<Link className="block">` wrapping all of its content. Nesting the new flag form's `<select>`/`<input>`/`<button>` controls inside that anchor is invalid HTML and would have made every click on the form navigate away instead of interacting with it.
- **Fix:** Wrapped the card in a plain `<div>` carrying the chrome classes, moved the `<Link>` to wrap only the (still fully clickable) informational content, and rendered the new `FlagWrongIdentityForm` as a sibling after it.
- **Files modified:** `components/contracts/ContractLocker.tsx`
- **Verification:** Visual structure unchanged (same classes, same content); `npx tsc --noEmit` / `npx next lint` clean
- **Committed in:** `8ce5b9e` (Task 1 commit)

**4. [Rule 3 - Blocking] Added a client component the plan's file list didn't name, since the owner page is a server component**
- **Found during:** Task 2 — `app/(artist)/split-sheets/[id]/page.tsx` is a server component (async, uses `createServiceClient()`), so the void-request button required for the `esign_pending` branch could not live inline in that file.
- **Issue:** Without a separate `'use client'` component, the interactive void-trigger button described in the plan's action text (`link/trigger the existing void route`) could not be built.
- **Fix:** Added `components/split-sheets/StagedFlagPanel.tsx`, following the existing precedent (`components/split-sheets/AttachSheetPanel.tsx`) of a small client component imported into this server page.
- **Files modified:** `components/split-sheets/StagedFlagPanel.tsx` (new, outside the plan's declared `files_modified`)
- **Verification:** `npx tsc --noEmit`; `npx next lint` clean
- **Committed in:** `1997731` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (2 Rule 2, 1 Rule 1, 1 Rule 3)
**Impact on plan:** All four were required to make the plan's own acceptance criteria (a genuinely working, non-stub flag affordance and owner panel) achievable rather than a UI shell with nothing behind it. No architectural changes, no new tables/routes beyond what 19-03/19-CONTEXT already specified, no scope creep into the pre-existing Locker visibility gap noted above.

## Issues Encountered
None beyond the deviations above.

## User Setup Required
None — no external service configuration required. The live round trip (flag submitted → owner notified → staged panel shows the real flag → void/guided-pointer) is UAT after 19-07's human-gated push of migration 074 (`split_sheet_identity_flags` table), consistent with this plan's own `<verification>` block.

## Next Phase Readiness
R4's frontend surfaces are fully wired against the 19-03 backend and migration 074's schema; 19-07 (the human-gated live push of migrations 071-074 + live UAT) is unblocked to proceed. Full suite (89 suites / 1109 tests), `tsc --noEmit`, and `next lint` all clean.

## Self-Check: PASSED

All created files confirmed present on disk; both task commit hashes confirmed in `git log`.

---
*Phase: 19-profile-identity-model-cleanup*
*Completed: 2026-07-24*
