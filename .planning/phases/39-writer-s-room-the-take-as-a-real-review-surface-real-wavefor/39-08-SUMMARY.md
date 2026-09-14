---
phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor
plan: 08
subsystem: ui
tags: [react, nextjs, pointer-events, waveform, tailwind, jest]

# Dependency graph
requires:
  - phase: 39-02
    provides: "lib/catalogue/take-spans.ts — normalizeSpanDrag, spanGeometry, clampCarriedSpan, spanNeedsReposition, MIN_SPAN_MS"
  - phase: 39-04
    provides: "endTimestampMs/needsReposition on WorkVersionCommentView and the comments POST route accepting a span"
  - phase: 39-06
    provides: "TimedTrackPlayer's real waveform (drawnPeaks) and comment-vocabulary rewrite to build span marking on top of"
provides:
  - "Mark-span mode: fuchsia toggle, active ring, pointer-capture crosshair layer, in-progress drag band, gradient Confirm span + Cancel, Escape exit"
  - "Committed indigo span bands rendered at their true bounds, one start-only marker pill per span, extended range aria-label"
  - "A single review-seek helper (reviewSeekTo) applying 2s pre-roll for every comment open, shared by selectComment and Previous/Next"
  - "Play-span-once-and-stop via a stop-point ref, with an opt-in Loop toggle in the thread header (never the native media loop property)"
  - "endTimestampMs on the comment POST when a pending span exists"
  - "D-07 amber flagging (offer-list preview + after-carry marker/chip/Reposition) for a carried comment whose in-point no longer fits"
  - "TimedTrackPlayer's initialComments static-render test seam, mirroring VersionComparisonPanel's identical existing seam"
affects: [39-10, 39-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pointer Events (setPointerCapture/releasePointerCapture) as the single interaction code path for a modal drag gesture on both touch and mouse — no onTouchStart/onLongPress branch"
    - "A ref (stopPointMsRef), not state, for playback-loop bookkeeping that must never trigger a re-render on its own"
    - "initialComments static-render test seam (mirrors VersionComparisonPanel.tsx) for components whose real data arrives via an internal fetch that renderToStaticMarkup never runs (no useEffect execution during SSR)"

key-files:
  created: []
  modified:
    - "components/catalogue/TimedTrackPlayer.tsx"
    - "components/catalogue/TimedTrackPlayer.test.tsx"

key-decisions:
  - "confirmSpan() and enterSpanMode() both clear stopPointMsRef/selectedRootId/replyingToId — not explicitly spelled out task-by-task in the plan's prose, but required so a confirmed span shows the new-comment composer (not a stale open thread) and Mark-span mode never inherits a stale play-once stop point from whatever comment was open before marking began."
  - "carryTargetDurationMs (durationMs > 0 ? durationMs : null) is the nullable duration passed to spanNeedsReposition/clampCarriedSpan, distinguishing 'metadata not loaded yet' from a genuine zero-length take — neither spanNeedsReposition's null-duration exemption nor a real take's positive duration is representable by the raw durationMs state alone (durationSeconds ?? 0 collapses null to 0 on mount)."
  - "Reposition (D-07) is offered only for a comment that carries a span (endTimestampMs != null), not for a flagged point comment — the UI-SPEC's D-07 section is titled 'Flagged carried span' and its Reposition action re-enters Mark-span mode, which only ever draws a span; a point comment still gets the amber marker and caption chip, just no Reposition button, since re-entering span-drawing mode for a point would silently turn it into something it isn't."
  - "Reposition does not edit the existing carried comment's stored row (no PATCH route exists for timestamp/endTimestamp) — it re-enters the same Mark-span mode Task 1 built, pre-seeded via clampCarriedSpan at the clamped edge, so Confirm posts a fresh top-level comment. This matches the plan's own instruction to wire it to the existing mode rather than add a second span-editing path, and its explicit 'change nothing about when a comment is carried' constraint."

requirements-completed: [D-04, D-05, D-06, D-07, D-09]

coverage:
  - id: D1
    description: "A writer enters Mark-span mode via a transport-row toggle (fuchsia text link idle, filled pill active with mode-state text), the whole waveform block gets a fuchsia ring while active, and a plain click/drag on the waveform outside the mode still only seeks — the existing seek input is only disabled while marking."
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx#offers Mark span mode in the transport row without ever auto-activating it"
        status: pass
      - kind: other
        ref: "grep -c 'ring-2 ring-brandfuchsia/50' / 'cursor-crosshair' / 'onLongPress\\|onTouchStart' components/catalogue/TimedTrackPlayer.tsx (1 / 1 / 0, per plan acceptance criteria)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A drag on the crosshair capture layer (one pointer-event code path for touch and mouse, via setPointerCapture) paints a live in-progress band; releasing it runs normalizeSpanDrag, which silently discards anything shorter than MIN_SPAN_MS with no confirm affordance, or reveals the gradient Confirm span + Cancel controls for an accepted drag."
    requirement: "D-04"
    verification:
      - kind: other
        ref: "grep -c 'normalizeSpanDrag' / 'setPointerCapture' / 'bg-grad' components/catalogue/TimedTrackPlayer.tsx (>=1 / 1 / 1, per plan acceptance criteria); grep -cE 'MIN_SPAN_MS *=|Math.abs\\(.*anchor' returns 0"
        status: pass
    human_judgment: true
    rationale: "No jsdom is installed in this repo, so live pointer-drag interaction (down/move/up, the resulting band geometry, and the Confirm/Cancel reveal) cannot be exercised by a renderToStaticMarkup test — the underlying arithmetic is unit-tested in lib/catalogue/take-spans.test.ts, but the drag *feel* itself is explicitly deferred to plan 39-11's manual pass per this plan's own <verification> section."
  - id: D3
    description: "Escape exits Mark-span mode and discards any pending span, via a document keydown listener registered only while the mode is active and released on exit/unmount — exempt from the general typing-surface suppression so it fires even with the composer textarea focused."
    requirement: "D-04"
    verification: []
    human_judgment: true
    rationale: "Keyboard-event-against-a-focused-textarea behavior requires a live DOM; this repo has no jsdom, so the listener's registration/cleanup lifecycle is verified by source review and typecheck only, not an automated interaction test. Deferred to 39-11's manual pass."
  - id: D4
    description: "Every root comment with an endTimestampMs renders a shaded indigo band (bg-brandindigo/15 border-x border-brandindigo/40) at its true bounds, with exactly one marker pill at the span's start and an aria-label naming both ends and the comment count; a point comment renders no band."
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx#renders a committed range comment as a shaded band at its true bounds with one start-only marker pill"
        status: pass
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx#renders no shaded band for a point comment"
        status: pass
    human_judgment: false
  - id: D5
    description: "Opening any comment pre-rolls 2 seconds (clamped at 0:00) via the shared reviewSeekTo helper, used by selectComment and therefore by the existing Previous/Next stepping; opening a range plays its span once and stops (via a stop-point ref checked in onTimeUpdate), and a Loop toggle in the thread header (off by default on every open) is the only way to repeat it — the native media loop property is never used."
    requirement: "D-05, D-06"
    verification:
      - kind: other
        ref: "grep -c 'preRollStartMs' / 'aria-pressed' components/catalogue/TimedTrackPlayer.tsx (>=1 each, per plan acceptance criteria); grep -c 'loop = true\\|\\.loop = ' returns 0"
        status: pass
    human_judgment: true
    rationale: "Actual audio playback timing (pre-roll feel, play-once-and-stop, loop seek-back) requires a live <audio> element and cannot be exercised by a jsdom-free static-markup test. Explicitly deferred to plan 39-11's manual pass per this plan's own <verification> section."
  - id: D6
    description: "submitComment sends timestampMs/endTimestampMs from a pending span when the composer holds one (never for a reply); the pending span clears on a successful post, on Cancel, and on switching to reply mode."
    requirement: "D-04"
    verification:
      - kind: other
        ref: "grep -c 'endTimestampMs' components/catalogue/TimedTrackPlayer.tsx (8, >=3 required per plan acceptance criteria — band filter/map, aria-label, POST body, repositionComment)"
        status: pass
    human_judgment: false
  - id: D7
    description: "A carried comment flagged needsReposition:true (server-computed, presented on WorkVersionCommentView) recolors its marker pill and offer-list timestamp amber instead of indigo/white, shows a 'Needs a new position in this take' caption (plus the clamped-bounds preview before carrying), and offers a Reposition action that re-enters Mark-span mode pre-seeded at the clamped edge — never rose/red, and the carry-forward decision path (saveCarryChoice) is unchanged."
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx#flags a comment carrying needsReposition:true in amber, never rose or red"
        status: pass
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx#renders the default indigo marker with no amber chip when needsReposition is false"
        status: pass
      - kind: other
        ref: "grep -c 'spanNeedsReposition' / 'clampCarriedSpan' / 'amber-400' components/catalogue/TimedTrackPlayer.tsx (>=1 / >=1 / >=2, per plan acceptance criteria); grep -c 'saveCarryChoice' unchanged from pre-Task-3 (3)"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-09-14
status: complete
---

# Phase 39 Plan 08: Mark-Span Mode, Range Comments, Pre-Roll/Loop, and D-07 Reposition Flagging Summary

**Gives `TimedTrackPlayer` an explicit pointer-capture "Mark span" mode (fuchsia ring, crosshair drag, gradient Confirm) that paints, plays back with 2s pre-roll and an opt-in loop, and amber-flags any carried span whose in-point outgrew its new take — all reusing `lib/catalogue/take-spans.ts`'s pure geometry rather than re-deriving it.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-14T20:00:00Z (approx.)
- **Completed:** 2026-09-14T20:20:00Z (approx.)
- **Tasks:** 3/3
- **Files modified:** 2

## Accomplishments

- **Mark-span mode.** A fuchsia "Mark span" toggle joins Record over in the transport row; active, it becomes a filled pill stating marking is live (with an Esc hint on `sm:` and above), and `ring-2 ring-brandfuchsia/50` marks the whole waveform block so the mode is legible from its outline alone. The existing invisible seek `<input type="range">` is disabled while marking; a sibling `cursor-crosshair` layer takes over the same footprint via `onPointerDown`/`onPointerMove`/`onPointerUp` with `setPointerCapture` — one code path for touch and mouse, no `onTouchStart`/`onLongPress` branch.
- **Paint, confirm, cancel, exit.** A live in-progress band renders via `spanGeometry` while dragging; on release, `normalizeSpanDrag` orders/clamps/enforces `MIN_SPAN_MS` with zero restated arithmetic in the component — a too-short drag discards silently with no confirm affordance, a valid one becomes a pending span and reveals **Confirm span** (this phase's one `bg-grad` spend) and **Cancel**, both real ≥44px buttons on mobile via responsive utility classes layered on top of the UI-SPEC's exact idle/active tone classes. Confirming clears any previously open thread (so the new-comment composer shows, not a stale one), opens the panel, and exits the mode; the shaded band persists at `bg-brandfuchsia/25` while composing. Escape exits and discards the pending span via a listener registered only while the mode is active.
- **Committed spans + pre-roll + play-once + loop.** Every root comment with an `endTimestampMs` renders a `bg-brandindigo/15 border-x border-brandindigo/40` band at its true bounds, with one marker pill at the start and an `aria-label` naming both ends and the comment count. A single `reviewSeekTo` helper (shared by `selectComment` and, transitively, the existing Previous/Next buttons) seeks the audio element to `preRollStartMs(target)` while the displayed playhead and band stay at the true target, resets the Loop toggle off, and auto-plays only for a range. A `stopPointMsRef` checked in `onTimeUpdate` pauses at a range's end unless the header's Loop toggle (`aria-pressed`, never the native `.loop` property) is on, in which case it seeks back to pre-roll instead.
- **Posting a span.** `submitComment` sends `timestampMs`/`endTimestampMs` from the pending span when one exists (never for a reply); the pending span clears on successful post, Cancel, or switching to reply.
- **D-07 amber flagging.** Before a carry, the offer-list preview runs `spanNeedsReposition` against this take's own known duration and shows a flagged comment's timestamp in amber with a caption and its `clampCarriedSpan`-previewed landing bounds, still checked and offered by default. After a carry, a `needsReposition:true` comment's marker pill recolors amber and its open thread shows the same caption chip plus a **Reposition** action, which re-enters the same Mark-span mode pre-seeded at the clamped edge (no second span-editing path) — never rose/red, and `saveCarryChoice` is untouched.
- **Test seam.** Added `initialComments?: WorkVersionCommentView[]` to `TimedTrackPlayer`, mirroring `VersionComparisonPanel`'s identical existing seam, so the component test suite can assert committed-band/marker/flag rendering with fixture data — `renderToStaticMarkup` never runs `useEffect`, so there was previously no way to seed comment state synchronously for a static-markup test.

## Task Commits

Each task was committed atomically:

1. **Task 1: Mark-span mode — enter, paint, confirm, cancel, exit** - `ebaad633` (feat)
2. **Task 2: Committed spans, pre-roll, play-once, and an opt-in loop** - `75146776` (feat)
3. **Task 3: A carried span that no longer fits is flagged, not dropped** - `e9b2db2f` (feat)

## Files Created/Modified

- `components/catalogue/TimedTrackPlayer.tsx` - Mark-span mode state/handlers/JSX, committed-span bands + extended marker aria-label, `reviewSeekTo`/stop-point/Loop toggle, span-aware `submitComment`, D-07 offer-list + marker + chip + `repositionComment`, `initialComments` test seam
- `components/catalogue/TimedTrackPlayer.test.tsx` - `commentFixture` helper, Mark-span-idle assertion, committed-band/point-comment assertions, needsReposition amber/indigo assertions; two Task 2 marker-pill assertions updated to match Task 3's toneClass restructuring

## Decisions Made

See `key-decisions` in frontmatter — summarized: (1) `confirmSpan`/`enterSpanMode` clear stale thread-selection and stop-point state beyond the plan's literal prose, because the new-comment composer and a fresh mark-span drag both require it to behave correctly; (2) a `durationMs > 0 ? durationMs : null` nullable duration value distinguishes "metadata not loaded" from "zero-length take" for `spanNeedsReposition`/`clampCarriedSpan`; (3) the Reposition action is scoped to span comments only, matching the UI-SPEC's "Flagged carried span" framing; (4) Reposition never edits the existing carried row (no such route exists) — it pre-seeds a fresh Mark-span draft, per the plan's explicit "do not add a second span-editing path" instruction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added an `initialComments` static-render test seam**
- **Found during:** Task 2 (writing the plan-mandated "a fixture comment carrying an endTimestampMs renders a band" test)
- **Issue:** `TimedTrackPlayer` only ever populates its `comments` state via an internal `fetch` inside a `useEffect`. `renderToStaticMarkup` (this repo has no jsdom) never runs effects, so there was no way to synchronously seed comment fixtures for the plan's explicitly required static-markup assertions on committed bands, marker labels, and D-07 flagging.
- **Fix:** Added `initialComments?: WorkVersionCommentView[]` to `TimedTrackPlayerProps`, mirroring the identical, already-shipped `initialComments` seam on `VersionComparisonPanel.tsx` in the same file family — same doc comment, same `useState(initialComments ?? ...)` / `useState(initialComments === undefined)` / early-return-in-fetch pattern.
- **Files modified:** components/catalogue/TimedTrackPlayer.tsx
- **Verification:** `npm run typecheck` clean; all new and pre-existing tests pass.
- **Committed in:** `75146776` (Task 2 commit; the marker-pill className restructuring for the amber branch landed in `e9b2db2f`, Task 3)

---

**Total deviations:** 1 auto-fixed (1 missing critical — a test seam, not a behavior change)
**Impact on plan:** No scope creep; the seam mirrors an existing, already-reviewed pattern in the same component family and is required to fulfill the plan's own literal test instructions given this repo's jsdom-free Jest config.

## Issues Encountered

- Two of Task 2's automated acceptance-criteria greps register pre-existing, unrelated false positives, both confirmed by direct inspection rather than worked around:
  - `grep -cE "\b2000\b|PRE_ROLL"` matches `maxLength={2000}` on the existing comment-body `<textarea>` — the character limit, not a restated pre-roll duration. `PRE_ROLL` (uppercase) does not appear anywhere; `preRollStartMs` is imported and used, never redefined.
  - `grep -c "bg-brandindigo/15"` matches both the new committed-span band (as the UI-SPEC mandates verbatim) and the pre-existing author-avatar initials circle (`TimedTrackPlayer.tsx`, unrelated to spans, predates this plan).
  Both are confirmed unrelated to this task's implementation via `grep -n`; keeping the UI-SPEC's exact mandated class token for the band was judged correct over distorting the color to satisfy a file-wide literal count the criterion's author likely did not intend to include pre-existing unrelated usage.
- Task 3's marker-pill className restructuring (to support an amber/indigo tone branch) moved the stable substring two of Task 2's own tests matched on (`border-brandindigo/70 bg-card px-1`, no longer contiguous once `toneClass` is appended after the shared base classes). Updated both assertions in the same Task 3 commit to match the new stable prefix (`rounded-full border bg-card px-1 text-[9px] font-bold shadow-md`), which precedes the tone/selection classes on every marker pill regardless of flag state.
- No jsdom is installed in this repo (confirmed via `npm ls jsdom`), consistent with plan 39-06's prior finding — this shaped every `human_judgment: true` coverage entry above: live pointer-drag interaction, keyboard Escape-against-a-focused-textarea, and real `<audio>` timing (pre-roll feel, play-once-stop, loop) are none of them assertable via `renderToStaticMarkup`, and are explicitly deferred to plan 39-11's manual pass per this plan's own `<verification>` section.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Mark-span mode, committed spans, pre-roll/loop, and D-07 flagging are all built directly on `lib/catalogue/take-spans.ts` and `lib/catalogue/take-transport.ts`'s pure, already-unit-tested functions — no duplicate arithmetic landed in the component, which keeps the surface plan 39-10 (keyboard bindings) and plan 39-11 (manual verification) build on next narrow and predictable.
- **Not verified by this plan (explicitly deferred to plan 39-11, per this plan's own `<verification>` section):** that the drag gesture feels right under a thumb, that the mode is unmistakable on a phone, that two seconds of pre-roll reads as a run-in rather than a rewind, and that play-once/loop/Escape behave correctly against a live `<audio>` element and a focused composer textarea. None of these is assertable in this repo's jsdom-free Jest environment.
- `components/catalogue/VersionComparisonPanel.tsx` still has its own separate `WAVE_BARS` constant and is explicitly out of this plan's scope (owned by the parallel 39-07 plan) — untouched here.

## Self-Check: PASSED

All 2 modified files confirmed present on disk. All 3 task commits (`ebaad633`, `75146776`, `e9b2db2f`) confirmed present in `git log`. Full repo suite green (611 suites / 7362 tests), `npm run typecheck` clean.

---
*Phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor*
*Completed: 2026-09-14*
