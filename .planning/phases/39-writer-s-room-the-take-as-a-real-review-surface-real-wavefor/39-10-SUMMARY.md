---
phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor
plan: 10
subsystem: ui
tags: [react, keyboard-shortcuts, accessibility, audio-playback, take-transport]

# Dependency graph
requires:
  - phase: 39-02
    provides: "lib/catalogue/take-transport.ts pure functions — resolveTransportAction, shouldSuppressShortcut, claimActivePlayer/releaseActivePlayer/isActivePlayer, PLAYBACK_SPEEDS/applyPlaybackShape, preRollStartMs"
  - phase: 39-07
    provides: "VersionComparisonPanel's four-step playback-speed segmented control idiom, matched exactly here"
  - phase: 39-09
    provides: "Private pins layer and popover in TimedTrackPlayer.tsx, whose focus/click handling this plan's keyboard listener had to coexist with"
provides:
  - "TimedTrackPlayer keyboard transport: Space play/pause, arrow/shifted-arrow nudge, bracket comment stepping — scoped to exactly one active player"
  - "One guarded document keydown listener per mounted player, folding in the pre-existing Esc-exits-Mark-span-mode listener from 39-08 so each player keeps exactly one listener"
  - "Marker aria-labels extended to state open/resolved state (accessibility contract fix beyond this plan's literal scope)"
  - "Four-step playback speed control (0.5x/0.75x/1x/1.5x) in TimedTrackPlayer, pitch preserved, reset per take by construction"
  - "Desktop-only keyboard legend line under the waveform"
affects: ["39-11 (phase verification/manual pass)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-player keyboard claim/release via a module-level registry (lib/catalogue/take-transport.ts), gated first-line in each player's own keydown listener — avoids a shared singleton listener while still ensuring exactly one player answers a keypress"
    - "Speed/transport pure logic lives in lib/catalogue/take-transport.ts and is unit-tested there; components only wire to it, never restate key mappings"

key-files:
  created: []
  modified:
    - components/catalogue/TimedTrackPlayer.tsx
    - components/catalogue/TimedTrackPlayer.test.tsx

key-decisions:
  - "Folded the pre-existing 39-08 Esc-exits-Mark-span-mode keydown listener into this plan's new unified listener rather than keeping two separate listeners — the plan's own must-haves.artifacts line says \"One guarded document keydown listener per player\" (singular), and two listeners would have failed that literally. Esc still fires regardless of active-player claim status (span mode is a per-player UI mode orthogonal to keyboard ownership), preserving prior behavior exactly."
  - "Placed the four-step speed control in the top transport row beside the play/pause button (matching where VersionComparisonPanel places its identical control next to its play button), rather than the bottom action-link row (Record over / Mark span / Pin / Download / etc.) — the UI-SPEC's \"transport row\" language for speed most closely parallels the A/B panel's own row grouping the play control with speed."
  - "Extended comment-marker aria-labels to state open/resolved state (e.g. \"1 comment at 0:12, open\"), a gap against the phase's own Accessibility Contract (\"timestamp, count, and open/resolved state\") that Task 2's explicit accessibility-audit instruction called for closing. Updated the one pre-existing test asserting the old aria-label text to match."

patterns-established:
  - "One-listener-per-player keyboard claim/release/suppress/dispatch pipeline (claimActivePlayer → isActivePlayer gate → shouldSuppressShortcut gate → resolveTransportAction dispatch), reusable by any future timed-media component that needs scoped keyboard shortcuts."

requirements-completed: [D-14, D-15, D-16, D-17, D-18]

coverage:
  - id: D1
    description: "Space play/pause, arrow (5s) and shifted-arrow (1s) nudge drive only the take a writer is actively working on (played or pointer-touched), and never fire while an input/textarea/contenteditable/IME-composing surface holds focus"
    requirement: "D-14"
    verification:
      - kind: unit
        ref: "lib/catalogue/take-transport.test.ts — resolveTransportAction and shouldSuppressShortcut coverage (all four suppression cases, all four key bindings, modifier-key rejection)"
        status: pass
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx — grep/text-lock assertions (claimActivePlayer x2, releaseActivePlayer x1, isActivePlayer x1, shouldSuppressShortcut(event, document.activeElement) x1, resolveTransportAction x1, one removeEventListener('keydown'), no restated key mapping, no J/K/L)"
        status: pass
    human_judgment: true
    rationale: "This repo's Jest config is jsdom-free (testEnvironment: 'node'; renderToStaticMarkup only), so actual keydown dispatch — including the two-players-mounted-one-spacebar-moves-only-one case and typing-into-the-composer-doesn't-toggle-playback case — is not observable in this plan's own test run. The plan's own <verification> section names this as the explicit manual carry to 39-11."
  - id: D2
    description: "Bracket keys ([ / ]) step to the previous/next comment with the same pre-roll and wrap the Previous/Next buttons already use, opening the stepped-to thread; a take with no comments is a no-op"
    requirement: "D-15"
    verification:
      - kind: unit
        ref: "lib/catalogue/take-transport.test.ts — resolveTransportAction resolves '[' / ']' to step-comment with correct direction"
        status: pass
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx — grep 'step-comment' appears exactly once (single dispatch branch reusing stepSelectedNote), typecheck clean"
        status: pass
    human_judgment: true
    rationale: "Same jsdom-free limitation as D1 — that a real bracket keypress actually seeks with pre-roll and opens the correct thread in a live browser is not exercised by this plan's tests. Deferred to plan 39-11's manual pass."
  - id: D3
    description: "Desktop-only keyboard legend line under the waveform, naming all four bindings, hidden on mobile via hidden sm:block"
    requirement: "D-14"
    verification:
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx — 'renders a single, desktop-only keyboard legend naming all four bindings under the waveform'"
        status: pass
    human_judgment: false
  - id: D4
    description: "Four-step playback speed control (0.5x/0.75x/1x/1.5x) in the transport row, matching VersionComparisonPanel's control exactly; 1x is the visual default on every render; pitch preserved via applyPlaybackShape on both step-press and onLoadedMetadata; no shared/context/global speed state so a newly mounted player always opens at 1x"
    requirement: "D-17"
    verification:
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx — 'renders four playback speed steps with 1x active on first render, pitch preserved, and no shared/global speed state'"
        status: pass
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx — 'does not grow the timeline block to make room for the speed control' (h-[58px] unchanged)"
        status: pass
      - kind: unit
        ref: "lib/catalogue/take-transport.test.ts — PLAYBACK_SPEEDS / applyPlaybackShape coverage (pre-existing from 39-02)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Marker aria-labels state timestamp, count, and open/resolved state (accessibility contract fix beyond the plan's literal scope, found during Task 2's required audit)"
    verification:
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx — 'renders every marker as a real button with an aria-label stating timestamp, count, and open/resolved state'"
        status: pass
    human_judgment: false

duration: ~15min (3 task commits, 16:50–16:57 local)
completed: 2026-09-14
status: complete
---

# Phase 39 Plan 10: Take player transport — keyboard shortcuts, comment stepping, playback speed Summary

**One guarded per-player keydown listener drives Space/arrow/bracket transport scoped to the active take, plus a four-step pitch-preserving speed control matching the A/B panel's idiom.**

## Performance

- **Duration:** ~15 min across 3 commits (16:50:49 → 16:57:01 local)
- **Tasks:** 3/3 completed
- **Files modified:** 2 (`components/catalogue/TimedTrackPlayer.tsx`, `components/catalogue/TimedTrackPlayer.test.tsx`)

## Accomplishments

- Every mounted `TimedTrackPlayer` now claims the module-level active-player registry (`lib/catalogue/take-transport.ts`) on play and on pointer-down, and releases it on unmount — the mechanism that stops N mounted takes from all answering one spacebar.
- A single document keydown listener per player instance dispatches through `shouldSuppressShortcut` (typing surfaces + IME composition) and `resolveTransportAction` (Space, arrows, shifted arrows, brackets) — no key mapping is restated in the component.
- Bracket-key comment stepping (`[` / `]`) reuses the existing `stepSelectedNote` function that already backs the Previous/Next thread buttons, so a keyboard step gets the identical pre-roll, wrap, and thread-opening behavior as a click.
- Folded the pre-existing (39-08) Esc-exits-Mark-span-mode listener into this same unified keydown handler, so the component holds exactly one keydown listener per instance rather than two — matching the plan's must-have artifact literally.
- A quiet, desktop-only (`hidden sm:block`) legend line under the waveform names all four bindings verbatim from `39-UI-SPEC.md` §5.
- A four-step playback speed control (0.5×/0.75×/1×/1.5×) sits in the top transport row beside the play/pause button, matching `VersionComparisonPanel`'s control class-for-class. `applyPlaybackShape` runs on both step-press and `onLoadedMetadata` so the two call sites can never silently diverge. Speed state is scoped to the player instance — no context, no shared store — so a newly mounted player always opens at 1×, satisfying D-17 by construction.
- Accessibility fix found during Task 2's required audit: comment-marker `aria-label`s were missing the open/resolved state the phase's own Accessibility Contract requires ("timestamp, count, and open/resolved state"). Extended the label and updated the one pre-existing test that asserted the old text.

## Task Commits

1. **Task 1: One keyboard, one player — the guarded listener** - `e73683ee` (feat)
2. **Task 2: Bracket keys step between comments, and a quiet legend says so** - `c46d2633` (feat)
3. **Task 3: Playback speed in the take player, pitch preserved** - `b1551eed` (feat)

_All three tasks were `feat` commits — no separate test-only or refactor-only commits were needed; each task's tests were added alongside its implementation in the same commit._

## Files Created/Modified

- `components/catalogue/TimedTrackPlayer.tsx` — keyboard claim/release/listener/dispatch, bracket-key stepping, keyboard legend, marker aria-label accessibility fix, four-step speed control
- `components/catalogue/TimedTrackPlayer.test.tsx` — static-markup and text-lock assertions for all of the above

## Decisions Made

- **Merged the Esc-mode listener into the new transport listener** (see frontmatter `key-decisions` for full rationale) — the plan's must-haves explicitly call for exactly one keydown listener per player, and the pre-existing 39-08 Esc handler was a second one. Esc still fires unconditionally while span mode is active, regardless of which player currently holds the active-player claim, exactly matching its prior standalone behavior.
- **Speed control placement**: top transport row (beside play/pause), not the bottom action-link row, mirroring where `VersionComparisonPanel` places its identical control.
- **Marker aria-label accessibility fix**: added open/resolved state to close a real gap against the phase's Accessibility Contract, per Task 2's explicit instruction to audit and fix (not restyle) anything missing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Comment-marker aria-labels were missing open/resolved state**
- **Found during:** Task 2 (accessibility audit explicitly required by the task's own instructions)
- **Issue:** The Accessibility Contract requires every marker's aria-label to state "timestamp, count, and open/resolved state," but the pre-existing implementation only stated timestamp and count.
- **Fix:** Added a `groupStateWord` ("open" if any comment in the marker's group is unresolved, else "resolved") appended to both the range and point marker label formats.
- **Files modified:** `components/catalogue/TimedTrackPlayer.tsx`, `components/catalogue/TimedTrackPlayer.test.tsx` (updated the one pre-existing test asserting the old label text, added a new test covering both open and resolved states)
- **Verification:** `npx jest --testPathPatterns="TimedTrackPlayer.test"` — 23/23 pass
- **Committed in:** `c46d2633` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical / Rule 2)
**Impact on plan:** Accessibility correctness fix explicitly requested by the task's own instructions ("confirm the accessibility contract holds... Fix anything that does not"). No scope creep — no restyling, no new components.

## Issues Encountered

- **Acceptance-criteria grep counts vs. import-line noise:** Several of the plan's acceptance criteria (e.g. `grep -c "claimActivePlayer"` expected to return 2) are written as if only call sites match, but the same identifier also appears once on its own line in the multi-line named import block, so the actual `grep -c` result is one higher than stated for `claimActivePlayer` (3 vs. 2), `releaseActivePlayer` (2 vs. 1), `isActivePlayer` (2 vs. 1), and `resolveTransportAction` (2 vs. 1). The underlying intent — exactly 2 claim call sites (play + pointer-down), exactly 1 release call site (unmount), exactly 1 active-player check, exactly 1 resolve call — is verified correct by direct inspection (see grep output captured during Task 1). `shouldSuppressShortcut(event, document.activeElement)` and `removeEventListener('keydown'` (both criteria requiring exactly 1) match exactly as specified, since those exact literal strings don't also appear on the import line. Not a functional deviation — flagging so a re-run of the plan's literal grep commands isn't mistaken for a regression.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three tasks' automated verification passed: `npx jest components/catalogue lib/catalogue` (62 suites / 490 tests), `npm run typecheck` (clean), and the full suite `npm test` (611 suites / 7,378 tests, all green).
- **Not verified by this plan, by design (see plan's own `<verification>` section) — carried to plan 39-11's manual pass:**
  1. With the comment composer, the lyrics pad, and the take-rename field all reachable on a real page, typing a space in each does not toggle playback.
  2. With two takes' players mounted, one spacebar press moves only the currently-active one.
  3. Bracket-key stepping actually seeks with pre-roll and opens the correct thread in a live browser (dispatch logic is unit-tested in `lib/catalogue/take-transport.test.ts`; the DOM wiring in `TimedTrackPlayer.tsx` is grep/text-lock verified but not exercised via a real keydown event, since this repo's Jest config has no jsdom).
- This is the last (5th) plan in the phase's keyboard/speed/transport work. No blockers for 39-11.

---
*Phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor*
*Completed: 2026-09-14*
