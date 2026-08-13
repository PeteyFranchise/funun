---
phase: 30-the-crate-sync-library-catalogue-engine-sync-readiness
plan: 01
subsystem: api
tags: [readiness, sync-library, catalogue, jest, typescript]

# Dependency graph
requires:
  - phase: 18-sound-vault-readiness-wave-1
    provides: readinessItemsForProject() + READINESS_ITEMS registry (lib/vault/readiness.ts, types/index.ts)
  - phase: vault-stage3-legal-gate
    provides: computeStage3() / Stage3Result (lib/vault/stage3.ts)
  - phase: 26-sync-library-inclusion
    provides: sync_listings state machine (lib/sync-library/submission.ts) — the co-located Jest convention this plan mirrors
provides:
  - "SYNC_READINESS_KEYS — sync-relevant subset of the Wave 1 READINESS_ITEMS registry"
  - "syncReadinessForTrack() — per-track Sync Readiness derivation via a single-track readinessItemsForProject() call"
  - "missingSyncItems() / isSyncMetadataComplete() — worklist and gate helpers over Sync Readiness output"
  - "GateSignal / evaluateInclusionGate() — the pure inclusion-gate predicate (rights/quality/metadata -> admit_eligible | needs_completion)"
  - "rightsBadge() / RIGHTS_BADGE_TO_CATALOG_RIGHTS — the single ready/partial/contact definition + CatalogRights mapping"
affects: [30-04-inclusion-gate-wiring, 30-05-worklist, 30-07-catalog-rights-live-data, 30-08-role-aware-crate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure lib/ modules composing existing engines instead of re-deriving them (readinessItemsForProject, computeStage3) — no parallel readiness/rights systems"
    - "Structured, non-rejecting verdicts (admit_eligible | needs_completion) instead of booleans for gate-style predicates"
    - "Co-located *.test.ts unit tests with real RED-then-GREEN TDD commits, mirroring lib/sync-library/submission.test.ts"

key-files:
  created:
    - lib/sync-library/readiness.ts
    - lib/sync-library/readiness.test.ts
    - lib/sync-library/gate.ts
    - lib/sync-library/gate.test.ts
  modified: []

key-decisions:
  - "syncReadinessForTrack() achieves per-track granularity by calling readinessItemsForProject() with tracks:[track] rather than slicing project-level output — resolves 30-RESEARCH.md Pitfall 2 (song-level vs project-level mismatch)"
  - "rightsBadge() is derived purely from Stage3Result (requiredComplete/requiredTotal/canContinue/sampleBlock) — the exact signal the gate's rightsClear also consumes, so the badge and the gate can never disagree"
  - "CatalogRightsCode ('ok'|'part'|'req') is redeclared locally in gate.ts rather than imported from components/buyer/CatalogBrowserLight.tsx, to keep lib/ a leaf dependency (components depend on lib, never the reverse); a later plan (30-07/30-08) can point the component's CatalogRights type at this module's mapping"

requirements-completed: [CRATE-01, CRATE-02]

coverage:
  - id: D1
    description: "Per-track Sync Readiness derivation (SYNC_READINESS_KEYS + syncReadinessForTrack) reuses the Wave 1 readiness engine without redefining any item's status logic"
    requirement: CRATE-01
    verification:
      - kind: unit
        ref: "lib/sync-library/readiness.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Inclusion-gate predicate (evaluateInclusionGate) returns a structured admit_eligible/needs_completion verdict, never rejected; rightsBadge shares the gate's rights signal"
    requirement: CRATE-02
    verification:
      - kind: unit
        ref: "lib/sync-library/gate.test.ts"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-08-13
status: complete
---

# Phase 30 Plan 01: Sync Readiness + Inclusion Gate Summary

**Pure, testable per-track Sync Readiness derivation and inclusion-gate predicate — both composing (not duplicating) the Wave 1 readiness engine and the Stage 3 legal-doc gate.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-13T00:00:00Z (approx.)
- **Completed:** 2026-08-13
- **Tasks:** 2/2 completed
- **Files modified:** 4 (all new)

## Accomplishments
- Built `lib/sync-library/readiness.ts`, exporting `SYNC_READINESS_KEYS` (the sync-relevant subset of `READINESS_ITEMS`) and `syncReadinessForTrack()`, which achieves per-track granularity by delegating entirely to the existing `readinessItemsForProject()` — no parallel item registry, no re-derived status logic.
- Built `lib/sync-library/gate.ts`, exporting `GateSignal`/`evaluateInclusionGate()` (a structured `admit_eligible | needs_completion` verdict, never `rejected`) and `rightsBadge()`, which derives the `ready | partial | contact` badge from the same `Stage3Result` the gate's `rightsClear` input consumes.
- Both modules are pure (no I/O, verified by grep for Supabase/fetch/fs calls) and fully unit-tested with real RED-then-GREEN TDD commits (21 new tests total).

## Task Commits

Each task was executed as a genuine RED -> GREEN TDD cycle (test file committed first, confirmed failing via `npx jest`, then implementation committed to make it pass):

1. **Task 1: Per-track Sync Readiness derivation**
   - `c04c5c4` test(30-01): add failing test for per-track Sync Readiness derivation
   - `7203ff0` feat(30-01): implement per-track Sync Readiness derivation
2. **Task 2: Inclusion-gate predicate + rights badge**
   - `d310662` test(30-01): add failing test for inclusion gate + rights badge
   - `00413a5` feat(30-01): implement inclusion gate predicate + rights badge

## Files Created/Modified
- `lib/sync-library/readiness.ts` — `SYNC_READINESS_KEYS`, `syncReadinessForTrack()`, `missingSyncItems()`, `isSyncMetadataComplete()`
- `lib/sync-library/readiness.test.ts` — 10 Jest tests (subset exclusion, per-track completeness, delegation-equivalence check against `readinessItemsForProject()`)
- `lib/sync-library/gate.ts` — `GateSignal`, `evaluateInclusionGate()`, `RightsBadge`, `rightsBadge()`, `CatalogRightsCode`, `RIGHTS_BADGE_TO_CATALOG_RIGHTS`
- `lib/sync-library/gate.test.ts` — 11 Jest tests (verdict truth table, badge tri-state thresholds, badge-to-CatalogRights mapping)

## Decisions Made
- Per-track granularity is achieved by constructing a single-track `ReadinessInput` (`tracks: [track]`) and calling the existing project-level function, rather than writing a new track-level scorer — matches 30-RESEARCH.md's recommended resolution to the Pitfall 2 granularity mismatch and the Phase 18 `coverageTier()` precedent style (compose, don't duplicate).
- `rightsBadge()` reads only `Stage3Result` fields (`requiredComplete`, `requiredTotal`, `canContinue`, `sampleBlock`) — never raw documents — so it can never drift from the `rightsClear` signal the gate itself uses, per 30-RESEARCH.md Pitfall 3.
- Declared a local `CatalogRightsCode` type/map in `gate.ts` instead of importing `CatalogRights` from `components/buyer/CatalogBrowserLight.tsx`. Rationale: this repo's layering rule is `lib/` is a leaf dependency that pages/components depend on, never the reverse (CLAUDE.md "Circular imports: None detected. lib/ modules are leaf nodes"). A `'use client'` component importing from `lib/sync-library/gate.ts` is fine and expected in a later plan (30-07/30-08); `gate.ts` importing from a component would invert that. The value shapes are identical (`'ok'|'part'|'req'`) so no behavior drift results — a follow-up plan should point `CatalogBrowserLight.tsx`'s `CatalogRights` type at this module's `CatalogRightsCode`/`RIGHTS_BADGE_TO_CATALOG_RIGHTS` to make it the single definition in practice, not just in type shape.

## Deviations from Plan

None - plan executed exactly as written. Both tasks followed the RED-first TDD flow specified in the plan (`tdd="true"`), and no Rule 1-4 auto-fixes were needed.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. No migration in this plan.

## Next Phase Readiness
- `lib/sync-library/readiness.ts` and `lib/sync-library/gate.ts` are ready to be composed by 30-04 (gate wiring into `POST /api/sync-library/admin/[listingId]`), 30-05 (worklist), and 30-08 (role-aware Crate rights badge display).
- Full test suite (`npm test`) verified green at 173 suites / 2069 tests after this plan's changes; `npx tsc --noEmit` clean.
- Follow-up note for 30-07/30-08: point `components/buyer/CatalogBrowserLight.tsx`'s `CatalogRights` type/usages at `lib/sync-library/gate.ts`'s `CatalogRightsCode`/`RIGHTS_BADGE_TO_CATALOG_RIGHTS` so there is exactly one definition, not two identically-shaped ones.

---
*Phase: 30-the-crate-sync-library-catalogue-engine-sync-readiness*
*Completed: 2026-08-13*

## Self-Check: PASSED
All created files and commit hashes verified present on disk / in git log.
