---
phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor
plan: 02
subsystem: catalogue
tags: [waveform, web-audio, keyboard-shortcuts, media-transport, pure-functions, jest]

# Dependency graph
requires: []
provides:
  - "lib/catalogue/waveform.ts — client-side peaks decode/scale/validate/level-match, reusing waveformPeaks()"
  - "lib/catalogue/take-transport.ts — keyboard shortcut resolution, shortcut suppression, pre-roll, playback speed/pitch, active-player registry"
  - "lib/catalogue/take-spans.ts — drag-to-span normalization, span geometry, carry-forward clamp mirroring the SQL clamp"
affects: [39-03, 39-04, 39-05, 39-06, 39-07, 39-08, 39-09, 39-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One AudioContext per decode call, closed in a finally (mirrors lib/catalogue/level-match.ts)"
    - "Pure functions take DOM state (activeElement, event) as parameters instead of reading document/window, keeping the module testable under Jest's node testEnvironment"
    - "Client-side arithmetic mirrors a database clamp exactly (clampCarriedSpan mirrors migration 224's review_work_version_comment_carry() SQL) rather than re-deriving the rule independently"

key-files:
  created:
    - lib/catalogue/waveform.ts
    - lib/catalogue/waveform.test.ts
    - lib/catalogue/take-transport.ts
    - lib/catalogue/take-transport.test.ts
    - lib/catalogue/take-spans.ts
    - lib/catalogue/take-spans.test.ts
  modified: []

key-decisions:
  - "isValidPeaksPayload is dependency-free (no browser globals) so a Next.js route handler can import the exact same validator the players use — enforced by a shared-rule acceptance criterion, not just convention"
  - "clampCarriedSpan's arithmetic was derived directly from 39-01-PLAN.md's Task 1 SQL spec (since migration 224 has not landed yet in this worktree) rather than guessed, including the one-millisecond start-reservation headroom"
  - "take-transport.ts imports nothing and reads no document global — activeElement and event fields are passed in by the caller, verified by a zero-count grep on 'document.' in the acceptance criteria"

requirements-completed: [D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-14, D-15, D-16, D-17, D-18]

coverage:
  - id: D1
    description: "waveform.ts turns a decoded AudioBuffer or an upload Blob/signed URL into a bounded 0-100 peaks array, validates a payload's shape, and level-matches a drawn waveform, all built on the existing waveformPeaks() algorithm"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "lib/catalogue/waveform.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "take-transport.ts resolves keyboard shortcuts to transport actions, suppresses them under any typing surface or IME, implements pre-roll/speed/pitch-preservation, and gates keyboard dispatch to a single active player"
    requirement: "D-14"
    verification:
      - kind: unit
        ref: "lib/catalogue/take-transport.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "take-spans.ts normalizes a drag into an ordered/clamped span (or null below the minimum), computes shaded-band CSS geometry, and clamps a carried span's endpoints together exactly as the database will"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "lib/catalogue/take-spans.test.ts"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-13
status: complete
---

# Phase 39 Plan 02: Waveform, Transport, and Span Pure Modules Summary

**Three dependency-free TypeScript modules — client-side peak extraction/validation, keyboard transport, and span geometry — each fully covered by Jest unit tests, since this repo's node-environment Jest cannot exercise a keypress or a drag directly.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-13T17:52:00-04:00 (approx.)
- **Completed:** 2026-09-13T17:57:35-04:00
- **Tasks:** 3
- **Files modified:** 6 (all new)

## Accomplishments
- `lib/catalogue/waveform.ts` — imports `waveformPeaks()` from `record-over-beat.ts` (never reimplements peak-picking), exports `scalePeaksToPercent`, `isValidPeaksPayload`, `levelMatchedPeaks`, `peaksFromBuffer`, `extractPeaksFromBlob`, `extractPeaksFromUrl`. `isValidPeaksPayload` is the single shared cardinality/range rule a future route schema and both players will import.
- `lib/catalogue/take-transport.ts` — `resolveTransportAction` (space/arrows/`[`/`]`, modifier-key bailout), `shouldSuppressShortcut` (INPUT/TEXTAREA/SELECT/contenteditable/IME), `preRollStartMs`, `PLAYBACK_SPEEDS`/`applyPlaybackShape`, and a module-level active-player registry (`claimActivePlayer`/`releaseActivePlayer`/`isActivePlayer`/`activePlayerId`) that stops one spacebar from toggling every mounted take.
- `lib/catalogue/take-spans.ts` — `normalizeSpanDrag` (order + clamp + minimum-width guard), `spanGeometry` (CSS percentages, never exceeding 100%), `clampCarriedSpan` (mirrors migration 224's SQL clamp including the one-millisecond start reservation), `spanNeedsReposition`.
- All three modules pass `npm run typecheck` cleanly and add zero new dependencies.
- Full repo suite verified green after the three additions: 607 suites / 7,310 tests, `npx tsc --noEmit` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/catalogue/waveform.ts — decode, scale, validate, level-match** - `ade33275` (feat)
2. **Task 2: lib/catalogue/take-transport.ts — shortcuts, suppression, pre-roll, speed, active player** - `ee5d1aec` (feat)
3. **Task 3: lib/catalogue/take-spans.ts — drag normalization, geometry, carry clamp** - `b5123299` (feat)

_No TDD RED/GREEN split was used — tasks were written test-and-implementation-together per the plan's `tdd="true"` behavior spec, then verified against every `<behavior>` line before commit._

## Files Created/Modified
- `lib/catalogue/waveform.ts` - Client-side peak decode/scale/validate/level-match helpers, reusing `waveformPeaks()`
- `lib/catalogue/waveform.test.ts` - 7 test cases covering scaling, validation, level-matching, and buffer extraction
- `lib/catalogue/take-transport.ts` - Keyboard shortcut resolution/suppression, pre-roll, playback speed/pitch, active-player registry
- `lib/catalogue/take-transport.test.ts` - 11 test cases covering every `<behavior>` line in Task 2
- `lib/catalogue/take-spans.ts` - Drag normalization, span geometry, carry-forward clamp
- `lib/catalogue/take-spans.test.ts` - 13 test cases including the D-07 no-collapse-to-point assertion

## Decisions Made
- Followed the plan's explicit acceptance-criteria greps literally where they specified an exact import form (`from '@/lib/catalogue/record-over-beat'`) even though a sibling-file relative import (`./record-over-beat`) is the pattern used by `record-over-beat.test.ts` elsewhere in the codebase — the acceptance criterion is authoritative for this one import.
- Derived `clampCarriedSpan`'s exact arithmetic from `39-01-PLAN.md`'s Task 1 SQL description (migration 224 has not been written yet in this worktree, per the coordination note's file-ownership split with plan 39-01 running in parallel) rather than from the migration file directly, per the plan's own `<read_first>` fallback instruction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed a stray `document.` substring from a doc comment**
- **Found during:** Task 2 (`lib/catalogue/take-transport.ts`)
- **Issue:** The plan's acceptance criteria require `grep -c "document\." lib/catalogue/take-transport.ts` to return 0, proving the module reads no DOM global. A doc comment explaining `shouldSuppressShortcut`'s parameter design referenced `` `document.activeElement` `` literally, which matched the grep and would have failed the acceptance check despite the code itself never touching `document`.
- **Fix:** Reworded the comment to say "the DOM's active element" instead of the literal `document.activeElement` string, preserving the same explanation without the substring.
- **Files modified:** `lib/catalogue/take-transport.ts`
- **Verification:** `grep -c "document\." lib/catalogue/take-transport.ts` now returns 0; `npx jest lib/catalogue/take-transport.test.ts` and `npx tsc --noEmit` both still pass.
- **Committed in:** `ee5d1aec` (part of Task 2 commit — caught and fixed before the commit was made)

---

**Total deviations:** 1 auto-fixed (1 bug — a doc-comment wording collision with an acceptance-criteria grep)
**Impact on plan:** Cosmetic-only; no behavior change. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. This plan adds no dependency and touches no environment variable.

## Next Phase Readiness
- Plans 39-03 through 39-10 can now import `waveform.ts`, `take-transport.ts`, and `take-spans.ts` instead of re-deriving the same arithmetic inside components.
- `isValidPeaksPayload` is ready for 39-03's route Zod schema to import directly (same bounds, same file, no restatement).
- `clampCarriedSpan`'s arithmetic must be cross-checked against the actual migration 224 SQL once plan 39-01 lands in the merged tree — this plan derived it from 39-01's plan document since the migration file did not exist yet in this worktree at execution time. No blocker: the plan's own `<read_first>` anticipated this and named the plan file as the fallback source.
- No migration, no component, no route was touched by this plan — the coordination boundary with the parallel 39-01 worktree was respected throughout (verified no edits to `types/catalogue.ts` or any migration file).

---
*Phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor*
*Completed: 2026-09-13*

## Self-Check: PASSED

All six created source/test files confirmed present on disk, and all four commit hashes
(`ade33275`, `ee5d1aec`, `b5123299`, `edc957f5`) confirmed present in `git log --oneline`.
