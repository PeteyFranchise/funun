---
phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor
plan: 06
subsystem: ui
tags: [react, nextjs, audio-decoding, waveform, tailwind, jest]

# Dependency graph
requires:
  - phase: 39-02
    provides: "lib/catalogue/waveform.ts — PEAKS_BAR_COUNT, REST_BAR_HEIGHT_PERCENT, isValidPeaksPayload, extractPeaksFromUrl"
  - phase: 39-03
    provides: "work_versions.peaks persisted on every version-creation path, and the PATCH /versions/[versionId] route accepting { peaks }"
provides:
  - "VersionCardData.peaks and TimedTrackPlayerProps.peaks — the plumbing from work_versions.peaks to the player"
  - "TimedTrackPlayer draws the take's real stored waveform instead of the hardcoded WAVE_BARS decorative strip"
  - "A take with no peaks renders a structurally-distinct rest state (flat, uniform, pulsing, no progress fill) and self-heals once via a client-side decode + PATCH write-back"
  - "TimedTrackPlayer's visible comment-thread copy uses 'comment' vocabulary instead of 'note', matching the phase's terminology decision (D-08/D-09)"
affects: [39-07, 39-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level Set<string> in-flight guard (backfillsInFlight) to admit at most one client-side decode per version id across remounts/refreshToken changes/multiple mounted players"
    - "isValidPeaksPayload as the single shared gate between server schema and client render — an invalid/corrupt array is always treated as 'not extracted yet', never partially drawn"

key-files:
  created: []
  modified:
    - "app/(artist)/vault/works/[workId]/page.tsx"
    - "components/catalogue/WorkPage.tsx"
    - "components/catalogue/WorkPage.test.tsx"
    - "components/catalogue/TimedTrackPlayer.tsx"
    - "components/catalogue/TimedTrackPlayer.test.tsx"

key-decisions:
  - "TimedTrackPlayerProps.peaks was declared in the Task 1 commit (not deferred to Task 2) because WorkPage.tsx already needed to pass the prop to typecheck cleanly — Task 2 then destructures and consumes it. This is a sequencing choice within Task 1's own stated scope ('...to the player props'), not an architectural deviation."
  - "The composer placeholder copy assertion (Task 3) uses a source-content (text-lock) check via fs.readFileSync rather than renderToStaticMarkup, because the composer only renders once `open` is true, and `open` is only ever set from a click handler or a URL-linked-comment effect — neither reachable from this repo's jsdom-free (testEnvironment: 'node') static-markup tests. This mirrors this repo's own migration text-lock test precedent for exactly this kind of render-unreachable guard."

requirements-completed: [D-01, D-03, D-08, D-09]

coverage:
  - id: D1
    description: "work_versions.peaks flows through VersionCardData to TimedTrackPlayer as a prop, with no query-shape change"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "components/catalogue/WorkPage.test.tsx#plumbs peaks from the version card to the player — a take with peaks renders different markup than one without"
        status: pass
    human_judgment: false
  - id: D2
    description: "A take with a valid stored peaks array draws its real waveform (indigo progress fill over the peaks' own heights)"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx#draws the real waveform from a valid stored peaks array"
        status: pass
    human_judgment: false
  - id: D3
    description: "A take with no peaks (or a corrupt/wrongly-sized peaks payload) renders a structurally distinct, flat, uniform, pulsing rest state with no progress fill — never a fabricated shape"
    requirement: "D-03"
    verification:
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx#renders an honestly empty, pulsing rest state — never a fabricated shape — when no peaks exist"
        status: pass
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx#treats a wrongly sized peaks array as no peaks at all, not a partial waveform"
        status: pass
    human_judgment: false
  - id: D4
    description: "A take with no peaks decodes its own audio once on first open and PATCHes the healed shape back to the server, so every later viewer sees the real waveform without a reload — guarded by a module-level in-flight set so a remount/refreshToken change/second mounted player never starts a second decode"
    requirement: "D-03"
    verification: []
    human_judgment: true
    rationale: "The backfill effect only executes in a real mounted browser (useEffect never runs under renderToStaticMarkup in this repo's jsdom-free Jest config), and its network/AudioContext behavior can't be exercised by a unit test here. Manual verification of a freshly recorded take showing its real shape with no placeholder frame is explicitly deferred to plan 39-11 per this plan's own <verification> section."
  - id: D5
    description: "Every visible work_version_comments string in TimedTrackPlayer.tsx uses 'comment' vocabulary instead of 'note' (unresolved-count link + zero state, carry-forward heading + explanatory line, review-count button, thread position line, choose-a-marker line, replying-to line, composer placeholder)"
    requirement: "D-08"
    verification:
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx#renders real playback, a seek timeline, and a timestamp comment action (0 unresolved comments assertion)"
        status: pass
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx#never calls a work_version_comments record a \"note\" anywhere in its rendered markup"
        status: pass
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx#uses the phase's comment vocabulary for the composer placeholder"
        status: pass
    human_judgment: false
  - id: D6
    description: "The carried-comment chip reads 'Carried from {version}' (lowercase 'carried') instead of 'From {version}', so it never reads as citing the current take"
    requirement: "D-09"
    verification:
      - kind: other
        ref: "grep -c 'Carried from ' components/catalogue/TimedTrackPlayer.tsx (returns 1, per plan acceptance criteria)"
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-09-14
status: complete
---

# Phase 39 Plan 06: Take Player Waveform + Terminology Summary

**Replaced TimedTrackPlayer's hardcoded 48-bar decorative strip with the take's real stored `work_versions.peaks`, a structurally honest rest state for takes with no shape yet, a self-healing one-time client-side backfill, and a full "note"→"comment" terminology pass across the player's visible copy.**

## Performance

- **Duration:** ~30 min (retry after a prior stalled attempt with zero commits)
- **Started:** 2026-09-14T19:52:00Z (approx.)
- **Completed:** 2026-09-14T19:57:27Z
- **Tasks:** 3/3
- **Files modified:** 5

## Accomplishments

- `work_versions.peaks` now flows unbroken from the server query through `VersionCardData` to `TimedTrackPlayerProps`, with no query-shape change (the query was already `select('*')`).
- `TimedTrackPlayer` deletes the hardcoded `WAVE_BARS` constant outright and draws `drawnPeaks` (an `isValidPeaksPayload`-gated `livePeaks` state) — a real waveform when valid peaks exist, and a flat, uniform, `animate-pulse`d rest state (no progress fill) when they don't. A corrupt or wrongly-sized payload is treated exactly like a missing one.
- A one-time backfill effect, guarded by a module-level `backfillsInFlight: Set<string>` keyed by version id, decodes a take's own audio via `extractPeaksFromUrl` and `PATCH`es the healed shape back to `/api/works/{workId}/versions/{versionId}` — the current viewer sees the real shape immediately via `setLivePeaks`, and every later viewer benefits from the persisted write. A decode failure surfaces `waveformError`'s copy; a take that simply has no peaks yet shows no error at all.
- The waveform bar row's gap class changes from `gap-px` to `gap-0 sm:gap-px` so 200 hairline bars (399px worth at 1px-bar + 1px-gap) never silently clip on a 320–390px phone viewport.
- Nine visible strings in `TimedTrackPlayer.tsx` that called a `work_version_comments` record a "note" now say "comment" (unresolved-count link + zero state, carry-forward heading + explanatory line, review-count button, thread position line, choose-a-marker line, replying-to line, composer placeholder). `AI noted ·`, the `noteId` prop, and Studio Notes were deliberately left untouched per D-08's exclusions.
- The carried-comment chip now reads "Carried from {version}" instead of "From {version}" (D-09), so it never reads as citing the current take.

## Task Commits

Each task was committed atomically:

1. **Task 1: Plumb peaks from the database row to the player props** - `0a92fa94` (feat)
2. **Task 2: Draw the real waveform, the rest state, and the one-time backfill** - `00893f90` (feat)
3. **Task 3: The take player says "comment", and a carried comment says where it came from** - `733b4a3c` (fix)

_Note: `TimedTrackPlayerProps.peaks` was declared in Task 1's commit rather than Task 2's, because `WorkPage.tsx` needed the field to typecheck once it started passing the prop — see Deviations._

## Files Created/Modified

- `app/(artist)/vault/works/[workId]/page.tsx` - `versionCards` mapping now sets `peaks: v.peaks ?? null`
- `components/catalogue/WorkPage.tsx` - `VersionCardData.peaks` field + passes `peaks={v.peaks ?? null}` to each mounted `TimedTrackPlayer`
- `components/catalogue/WorkPage.test.tsx` - `baseVersions` fixture carries a real 200-length peaks array; new test asserts a take with peaks renders different markup than one without
- `components/catalogue/TimedTrackPlayer.tsx` - `WAVE_BARS` deleted; real waveform / rest-state rendering, one-time backfill effect, `backfillsInFlight` guard, `waveformError` copy, and the full note→comment terminology pass + D-09 chip fix
- `components/catalogue/TimedTrackPlayer.test.tsx` - three new waveform-state tests, two new terminology guard tests, and the existing `0 unresolved notes` expectation updated to `0 unresolved comments`

## Decisions Made

- **`TimedTrackPlayerProps.peaks` declared one task early.** Task 1's own acceptance criteria requires `npm run typecheck` to pass after `WorkPage.tsx` starts passing `peaks={v.peaks ?? null}` to `<TimedTrackPlayer>`. Since JSX prop-passing is excess-property-checked in TypeScript, the prop had to exist on `TimedTrackPlayerProps` before Task 1's own verification could pass. Declaring the field is literally within Task 1's stated scope ("Plumb peaks from the database row to the player **props**"); Task 2 then does the actual destructuring/consumption. No behavior changed by this — it's a type declaration only.
- **Composer placeholder copy tested via source-content check, not rendered markup.** The composer (`{open && (...)}`) only renders once `open === true`, and `open` is only ever set via a click handler or the URL-linked-comment effect inside a `useEffect` — neither runs under `renderToStaticMarkup` in this repo's jsdom-free (`testEnvironment: 'node'`) Jest config, and this repo has no jsdom dependency installed at all (confirmed: no `node_modules/jsdom` in either the worktree or the main checkout). Used the same text-lock technique this repo's own migration tests use for render-unreachable guards: `readFileSync` the component source and assert the exact placeholder string is present.

## Deviations from Plan

**None requiring Rule 4.** One minor sequencing adjustment, documented above under Decisions (Rule 3 — auto-fix blocking issue: the plan's Task 1 acceptance criteria could not pass without the prop existing on `TimedTrackPlayerProps`, so that one field declaration moved one task earlier than the plan's task-by-task prose implied).

## Issues Encountered

- The plan's own `<verification_note>` warned that this repo's Jest CLI mishandles bracketed paths like `[workId]` as a regex character class. Used `npx jest --testPathPatterns="TimedTrackPlayer"` and `npx jest components/catalogue/WorkPage.test.tsx` (no brackets in that one) throughout — both ran correctly.
- No jsdom is installed anywhere in this repo (verified via `npm ls jsdom` returning empty in both the worktree and the main checkout), which shaped the Task 3 test-writing decision documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The take player now has a real waveform to draw against — this is the explicit spine plan 39-07 (`VersionComparisonPanel`'s own identical `WAVE_BARS` constant, deliberately left untouched here) and the remaining Writer's Room player features (span marking, pins, keyboard navigation, speed) build on top of.
- **Not verified by this plan (explicitly deferred to plan 39-11, per this plan's own `<verification>` section):** that a freshly recorded take shows its real shape with no placeholder frame in a live browser — the felt-absence-of-waiting behavior D-01 targets, which no static-render assertion can observe. The backfill's actual decode + PATCH round-trip (D3 in the coverage table above) is likewise unverified by automated tests for the same reason and needs a human pass against a take with no stored peaks.

## Self-Check: PASSED

All 6 key files confirmed present on disk (5 code files + this SUMMARY). All 4 commits (`0a92fa94`, `00893f90`, `733b4a3c`, `f22ffd59`) confirmed present in `git log`.

---
*Phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor*
*Completed: 2026-09-14*
