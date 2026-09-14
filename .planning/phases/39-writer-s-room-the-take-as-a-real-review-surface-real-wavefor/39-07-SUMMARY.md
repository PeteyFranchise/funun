---
phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor
plan: 07
subsystem: ui
tags: [react, waveform, playback-rate, comment-terminology]

requires:
  - phase: 39-02
    provides: "lib/catalogue/waveform.ts (isValidPeaksPayload, levelMatchedPeaks, PEAKS_BAR_COUNT, REST_BAR_HEIGHT_PERCENT) and lib/catalogue/take-transport.ts (PLAYBACK_SPEEDS, DEFAULT_PLAYBACK_SPEED, applyPlaybackShape)"
  - phase: 39-06
    provides: "TimedTrackPlayer.tsx's real-waveform / rest-state rendering shape, which this plan mirrors in VersionComparisonPanel rather than reinventing"
provides:
  - "ComparableVersion.peaks flowing from WorkPage.tsx's comparableVersions mapping into VersionComparisonPanel"
  - "VersionComparisonPanel's drawn waveform is real and level-matched, with the last hardcoded WAVE_BARS array in the phase retired"
  - "A four-step (0.5x/0.75x/1x/1.5x) pitch-preserving playback speed control in VersionComparisonPanel, reset on side change"
  - "comparisonResolutionLabel and every visible VersionComparisonPanel string now say comment, not note"
affects: [39-11]

tech-stack:
  added: []
  patterns:
    - "A comparison surface derives its drawn waveform from the same level-match volume already applied to <audio>.volume, never a second independent computation"
    - "applyPlaybackShape called from three distinct sites (press, onLoadedMetadata, a sideA.id/sideB.id effect) rather than once at mount, because a side change remounts the <audio> element on a new src"

key-files:
  created: []
  modified:
    - components/catalogue/VersionComparisonPanel.tsx
    - components/catalogue/VersionComparisonPanel.test.tsx
    - components/catalogue/WorkPage.tsx
    - lib/catalogue/version-comparison.ts
    - lib/catalogue/version-comparison.test.ts

key-decisions:
  - "Task 2's third applyPlaybackShape call site is a useEffect keyed on [sideA.id, sideB.id] (not [speed, sideA.id, sideB.id]) — it reapplies whichever audio elements exist immediately after a side change, deliberately not re-running on every speed press (that's selectSpeed's own direct call), matching the plan's three-distinct-trigger description rather than folding all three into one effect"
  - "No fix applied for two acceptance-criteria grep false positives — see Issues Encountered"

requirements-completed: [D-02, D-08, D-17, D-18]

coverage:
  - id: D1
    description: "The A/B panel draws the active take's real, level-matched waveform — WAVE_BARS deleted, drawnPeaks gated through isValidPeaksPayload and scaled through levelMatchedPeaks with the same volume already applied to that side's <audio>.volume"
    requirement: "D-02"
    verification:
      - kind: unit
        ref: "components/catalogue/VersionComparisonPanel.test.tsx#draws the active take's real waveform when a valid peaks array exists"
        status: pass
      - kind: unit
        ref: "components/catalogue/VersionComparisonPanel.test.tsx#renders the structurally-distinct pulsing rest state, with no indigo fill, when the active take has no peaks yet"
        status: pass
    human_judgment: false
  - id: D2
    description: "Four-step playback speed control (0.5x/0.75x/1x/1.5x), pitch-preserving via applyPlaybackShape, reset to 1x on changeSide"
    requirement: "D-17, D-18"
    verification:
      - kind: unit
        ref: "components/catalogue/VersionComparisonPanel.test.tsx#renders all four speed steps with only 1× pressed on first render"
        status: pass
    human_judgment: true
    rationale: "No assertion can hear whether 0.5x on a sung take is genuinely still in key and usable for judging intonation (the plan's own <verification> section defers this to manual pass, plan 39-11) — static-render tests only prove the control's rendered state and that applyPlaybackShape is wired at three call sites, not the audible result."
  - id: D3
    description: "VersionComparisonPanel's visible copy and lib/catalogue/version-comparison.ts's comparisonResolutionLabel say comment, not note"
    requirement: "D-08"
    verification:
      - kind: unit
        ref: "components/catalogue/VersionComparisonPanel.test.tsx (all four suites, updated assertions)"
        status: pass
      - kind: unit
        ref: "lib/catalogue/version-comparison.test.ts#names the newer take when resolving an older comment while listening to it"
        status: pass
    human_judgment: false

duration: 21min
completed: 2026-09-14
status: complete
---

# Phase 39 Plan 07: A/B panel real waveform, pitch-preserving speed control, comment terminology Summary

**VersionComparisonPanel now draws a real, level-matched waveform through the same waveform.ts helpers TimedTrackPlayer uses, gained a 0.5x/0.75x/1x/1.5x pitch-preserving speed control wired to three applyPlaybackShape call sites, and its visible copy — plus the shared comparisonResolutionLabel — now says "comment" instead of "note".**

## Performance

- **Duration:** 21 min (16:52 start read → 17:13 final commit, wall-clock)
- **Completed:** 2026-09-14T20:13:35Z
- **Tasks:** 3/3
- **Files modified:** 5

## Accomplishments

- Retired the last hardcoded `WAVE_BARS` array in the phase (`VersionComparisonPanel.tsx`). The active side's drawn peaks are gated through `isValidPeaksPayload`, scaled through `levelMatchedPeaks` with the same volume already applied to that side's `<audio>.volume` when level matching is on, and a take with no peaks yet renders the same structurally-honest rest state (flat, uniform, `animate-pulse`, no progress fill, `gap-0 sm:gap-px` viewport fix) that `TimedTrackPlayer` established in plan 39-06 — no second backfill path.
- Added a four-step segmented speed control (`0.5×`/`0.75×`/`1×`/`1.5×`) beside the level-match button, matching the UI-SPEC's pill classes. `applyPlaybackShape` is called from three places — the step press, every `<audio>`'s `onLoadedMetadata` (the call that fixes the real defect: `changeSide` remounts a side's `<audio>` element on a new `src`, so a fresh element does not inherit `playbackRate`/`preservesPitch`), and a `useEffect` keyed on `[sideA.id, sideB.id]` that reapplies immediately once the new element exists. Speed resets to `DEFAULT_PLAYBACK_SPEED` inside `changeSide` beside the existing level-match reset; `setActive` (switching which side is audible without changing which take is loaded) does not reset it.
- Renamed every visible `work_version_comments`-record string in `VersionComparisonPanel.tsx` from "note" to "comment" (header line, marker `aria-label`, loading line, selected-comment heading, choose-a-marker prompt, cross-side reviewing line, empty state, and `updateResolution`'s error string), and both resolution labels in `lib/catalogue/version-comparison.ts`'s `comparisonResolutionLabel` ("Reopen comment" / "Resolve comment" — the "Mark addressed in {version}" branch is untouched, since it names an action, not a record type).

## Task Commits

Each task was committed atomically:

1. **Task 1: The comparison waveform is real, and level-matched when playback is** - `fc1d0ff9` (feat)
2. **Task 2: Four-step playback speed that keeps the key** - `e38f6ee9` (feat)
3. **Task 3: The comparison panel — and its resolution labels — say "comment"** - `4015c4c9` (docs)

_No separate plan-metadata commit — worktree mode excludes STATE.md/ROADMAP.md updates; this SUMMARY and REQUIREMENTS.md (if applicable) are committed by the orchestrator's post-wave step._

## Files Created/Modified

- `components/catalogue/VersionComparisonPanel.tsx` - `peaks` on `ComparableVersion`, `WAVE_BARS` deleted, `drawnPeaks` derivation (level-matched when playback is), rest state, four-step speed control + three `applyPlaybackShape` call sites, `changeSide` speed reset, full note→comment copy pass
- `components/catalogue/VersionComparisonPanel.test.tsx` - real-waveform/rest-state cases, all-four-speed-steps-render-with-one-pressed case, renamed-string assertions
- `components/catalogue/WorkPage.tsx` - `peaks: version.peaks ?? null` in the `comparableVersions` mapping
- `lib/catalogue/version-comparison.ts` - `comparisonResolutionLabel`'s two labels renamed
- `lib/catalogue/version-comparison.test.ts` - matching expectation updates

## Decisions Made

- **Task 2's third `applyPlaybackShape` call site is a side-change effect, not a folded-in speed effect.** The plan's action text enumerates three distinct triggers (press, every `onLoadedMetadata`, immediately after a side change). Rather than consolidating presses and side-changes into one `useEffect` with `[speed, sideA.id, sideB.id]` as deps (which would satisfy the letter of "applyPlaybackShape appears 3+ times" only if split across the effect and a separate press handler, but conflates two logically distinct triggers into one code path), I kept `selectSpeed()` as the press handler's own direct call and a separate `useEffect([sideA.id, sideB.id])` for the side-change trigger. This matches the plan's three-distinct-reasons framing and keeps the `eslint-disable-next-line react-hooks/exhaustive-deps` comment (a pattern already used 15+ times elsewhere in this codebase, e.g. `components/catalogue/LyricsPad.tsx`) scoped to the one effect that intentionally excludes `speed` from its deps.

## Deviations from Plan

None - plan executed exactly as written. Task 3's action text explicitly asked me to "sweep the whole `components/catalogue` and `lib/catalogue` trees for any remaining visible string that calls a `work_version_comments` record a note, and report anything found" — findings from that sweep are below (Issues Encountered), not a deviation, since the action text does not require fixing files outside this plan's `files_modified` list.

## Issues Encountered

**Two acceptance-criteria grep gates return non-zero for pre-existing, unrelated substring matches — both verified as false positives, not real gaps:**

1. `grep -cE "2x|2\.0x" components/catalogue/VersionComparisonPanel.tsx` returns 1, matching `shadow-2xl` (a pre-existing Tailwind box-shadow utility on the dialog container, unrelated to speed steps and present before this plan's changes — confirmed via `git show HEAD~2:...`). Verified separately that no `2×` or `"2"` speed step exists in the file.
2. `grep -rci "timed note" components/catalogue lib/catalogue` returns non-zero only for `components/catalogue/TimedTrackPlayer.test.tsx:2`, which contains `not.toContain('timed notes')` — a negative assertion proving the OLD string is absent from that file's rendered output (written by plan 39-06, out of this plan's file list). The substring match is the assertion string itself, not a leftover "note" instance.

**D-08 sweep findings (reported per Task 3's action text, not fixed — out of this plan's scope):**

- `components/catalogue/StudioNotes.tsx` + `lib/catalogue/studio-notes.ts` + `components/catalogue/ComposerCard.tsx`'s `'note'` action key — "Studio Notes" is its own established feature name that aggregates song notes, audio notes (including `work_version_comments` records, via `audioNotes: WorkVersionComment[]`), and lyric-block comments under one unified "note" UI. It is not named in the UI-SPEC's D-08 terminology inventory table (which cites only `VersionComparisonPanel.tsx`, `TimedTrackPlayer.tsx`, and `RecordOverBeatStudio.tsx`), and renaming a whole feature's name is a larger product decision than this plan's scope.
- `components/catalogue/ProducerInbox.tsx`, `components/catalogue/ProducerHandoffTimeline.tsx`, `components/catalogue/ReturnedMixReviewCard.tsx` — all reference the producer-handoff "note" field (`PRODUCER_HANDOFF_NOTE_MAX`), which the UI-SPEC explicitly says not to rename ("Do not rename `handoffNote` / `PRODUCER_HANDOFF_NOTE_MAX`... that is the producer-handoff note, explicitly a different, unrenamed thing per D-08").
- `components/catalogue/LyricSuggestionPanel.tsx`'s "Note (optional)" field is `lyric_suggestions.note`, a different table entirely (AI lyric suggestions), not `work_version_comments`.
- `components/catalogue/DiaryFeed.tsx`'s "note" is a diary handoff field, also a different domain, not `work_version_comments`.

After this plan, the phase's D-08 inventory is empty for the two files this plan owns (`VersionComparisonPanel.tsx`, `lib/catalogue/version-comparison.ts`) and for `TimedTrackPlayer.tsx`/`RecordOverBeatStudio.tsx` (owned by plans 39-06/39-08, unaffected here). The five items above were never in the UI-SPEC's D-08 table and are flagged for awareness only.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `VersionComparisonPanel.tsx` and `lib/catalogue/version-comparison.ts` are ready for plan 39-11's manual verification pass: specifically, that 0.5x on a sung take is genuinely still in key (no assertion can hear this), and that switching sides mid-playback at a non-1x speed carries the correct rate to the newly-audible take.
- No stubs introduced. No new threat surface beyond what's already in this plan's `<threat_model>` (T-39-20..24, T-39-SC), all mitigated per the plan's own dispositions.

---
*Phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor*
*Completed: 2026-09-14*
