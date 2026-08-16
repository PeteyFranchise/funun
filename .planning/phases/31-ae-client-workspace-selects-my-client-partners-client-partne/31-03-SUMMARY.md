---
phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
plan: 03
subsystem: selects
tags: [typescript, jest, state-machine, tdd]

# Dependency graph
requires: []
provides:
  - "lib/selects/types.ts — SelectsStatus union + Selects/SelectsTrack row types mirroring migration 111's planned columns"
  - "lib/selects/stage-machine.ts — isLegalSelectsTransition(from, to), the single pure legality authority for the Selects status pipeline"
  - "lib/selects/stage-machine.test.ts — RED-first legality suite (12 cases)"
affects: [31-04, 31-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure I/O-free state-machine module (lib/<domain>/stage-machine.ts) mirroring lib/deals/stage-machine.ts's shape — a Record<Status, Set<Status>> edge table plus a fail-closed isKnownStatus guard"

key-files:
  created: [lib/selects/types.ts, lib/selects/stage-machine.ts, lib/selects/stage-machine.test.ts]
  modified: []

key-decisions:
  - "isLegalSelectsTransition implemented as a Record<SelectsStatus, Set<SelectsStatus>> edge table rather than an ordered-pipeline array (lib/deals' FORWARD_PIPELINE approach) — Selects' graph isn't strictly linear (sent fans out to two legal targets, changes_requested loops back to sent), so an explicit adjacency map is the more direct pure representation of the same forward-only/no-skip/no-backward/no-self-transition contract."

patterns-established:
  - "lib/selects/ as the module home for all Selects domain logic (types.ts for shared shapes, stage-machine.ts for pure legality), matching the existing lib/deals/ convention 31-04 and 31-13 will extend."

requirements-completed: [R11]

coverage:
  - id: D1
    description: "Selects status legality (draft->sent, sent->approved, sent->changes_requested, changes_requested->sent) is a pure, unit-tested, single-authority validator; no backward move, no skip, no same-stage self-transition is possible."
    requirement: "R11"
    verification:
      - kind: unit
        ref: "lib/selects/stage-machine.test.ts#isLegalSelectsTransition"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-08-16
status: complete
---

# Phase 31 Plan 03: Selects Status State Machine Summary

**Pure, unit-tested `isLegalSelectsTransition` validator for the Selects status pipeline (draft/sent/approved/changes_requested), shipped RED-first and mirroring the shipped `lib/deals/stage-machine.ts` shape.**

## Performance

- **Duration:** 8 min
- **Tasks:** 2
- **Files modified:** 3 (all new)

## Accomplishments
- `lib/selects/types.ts` establishes the `SelectsStatus` union and the shared `Selects`/`SelectsTrack` row types the API layer (31-04, 31-13) will reuse, matching migration 111's planned column shape.
- `lib/selects/stage-machine.ts` exports a pure `isLegalSelectsTransition(from, to): boolean` — no Supabase, no I/O, no throw — that is the single legality authority for every writer.
- Genuine RED confirmed before implementation (module didn't exist; `npx jest` failed with "Cannot find module"), then GREEN with all 12 test cases passing and `npx tsc --noEmit` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — Selects status legality suite** - `17c513a` (test)
2. **Task 2: GREEN — implement isLegalSelectsTransition** - `87f8b1c` (feat)

_TDD plan: RED commit precedes GREEN commit; REFACTOR not needed (implementation was already minimal and clean)._

## Files Created/Modified
- `lib/selects/types.ts` - `SelectsStatus` union (draft/sent/approved/changes_requested) + `Selects`/`SelectsTrack` row types mirroring migration 111's columns
- `lib/selects/stage-machine.ts` - pure `isLegalSelectsTransition(from, to)` state machine
- `lib/selects/stage-machine.test.ts` - 12-case legality suite (forward moves, illegal skips, backward moves, terminal state, self-transitions, unknown-value fail-closed behavior)

## Decisions Made
- Implemented the edge table as `Record<SelectsStatus, ReadonlySet<SelectsStatus>>` rather than an ordered forward-pipeline array (the `lib/deals/stage-machine.ts` precedent). The Selects graph branches (sent → two legal targets) and loops (changes_requested → sent), so a direct adjacency map expresses the same guarantees (no skip/no backward/no self-transition) more directly than an index-based forward-pipeline comparison would for a non-linear graph.

## TDD Gate Compliance

RED gate (`test(31-03): ...`, commit `17c513a`) confirmed with a genuine module-not-found failure before any implementation existed. GREEN gate (`feat(31-03): ...`, commit `87f8b1c`) confirmed with `npx jest lib/selects/stage-machine.test.ts` (12/12 passing) and `npx tsc --noEmit` clean. Both gate commits present in git log in the correct order.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`lib/selects/types.ts` and `lib/selects/stage-machine.ts` are ready for 31-04 (send route) and 31-13 (respond route) to import `isLegalSelectsTransition` as their single status-legality gate instead of an inline check. No blockers.

---
*Phase: 31-ae-client-workspace-selects-my-client-partners-client-partne*
*Completed: 2026-08-16*

## Self-Check: PASSED

- FOUND: lib/selects/types.ts
- FOUND: lib/selects/stage-machine.ts
- FOUND: lib/selects/stage-machine.test.ts
- FOUND: 17c513a (test commit)
- FOUND: 87f8b1c (feat commit)
