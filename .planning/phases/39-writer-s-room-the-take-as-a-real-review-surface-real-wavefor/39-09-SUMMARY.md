---
phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor
plan: 09
subsystem: ui
tags: [react, nextjs, local-storage, jest, waveform]

# Dependency graph
requires:
  - phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor
    provides: "GET/POST /versions/[versionId]/pins and DELETE /pins/[pinId] (plan 39-05); WorkVersionPinView type (plan 39-01); TimedTrackPlayer's Mark-span mode, committed spans, and pointer-capture layering (plan 39-08)"
provides:
  - "A pin drop control, pin dot layer, and pin popover (promote/remove) entirely inside TimedTrackPlayer"
  - "A one-time dismissible privacy coachmark persisted per-viewer via local-drafts.ts"
  - "initialPins static-render test seam mirroring initialComments"
  - "A fourth doctrine-gate group in writer-room-private-pins.test.ts locking the player's onCommentChanged( call-site count"
affects: ["39-11 (manual cross-account verification of pin invisibility and promotion's single-marker outcome)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A single named delete function (deletePin) shared by both a direct removal action and a post-success promotion path, so a plan-mandated 'exactly one occurrence of a literal' acceptance grep is satisfied by construction rather than by coincidence"
    - "Show-by-default, hide-on-confirmed-dismissal for a one-time coachmark — SSR renders it every time (no window/localStorage available), and a mount effect hides it early if a prior dismissal is found, avoiding a hydration mismatch"

key-files:
  created: []
  modified:
    - "components/catalogue/TimedTrackPlayer.tsx"
    - "components/catalogue/TimedTrackPlayer.test.tsx"
    - "__tests__/writer-room-private-pins.test.ts"

key-decisions:
  - "Made the pin dot a real <button> with its selection state (selectedPinId) already wired in Task 1, ahead of Task 2's popover JSX — kept the diff for the interactive element itself in one place rather than restructuring a <span> into a <button> between the two task commits."
  - "promotingPinId is cleared in two additional places beyond the plan's literal prose: selectComment (selecting a different marker abandons a promotion in progress) and a new toggleCommentsPanel helper (closing the panel without posting abandons it) — both required so 'clear the promotion target if the writer cancels or navigates away without posting' is actually true, not just true for the literal Cancel path."
  - "The pin popover closes on an outside press via a single document mousedown listener registered only while a pin is selected, scoped through a ref attached to whichever popover is currently open — mirrors the existing Esc-listener pattern for Mark-span mode (registered only while live, released on exit/unmount)."
  - "Reworded three explanatory code comments (Number.MAX_SAFE_INTEGER, Turn into a comment, Remove pin) that were otherwise restating literal copy/API names the plan's acceptance criteria grep for an exact count — a comment satisfying its own grep target would have made the criterion meaningless, so the comments describe the same reasoning without repeating the literal string."

requirements-completed: [D-10, D-11, D-12, D-13]

coverage:
  - id: D1
    description: "A writer can drop a wordless pin at the playhead with one press (Pin text link in the transport row) — no composer, no confirm."
    requirement: "D-10"
    verification:
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx#offers a Pin control in the transport row and tells the writer once, plainly, that a pin is private"
        status: pass
    human_judgment: false
  - id: D2
    description: "A pin is a plain lavender dot (bg-lav/60, no border, no pill, no count badge) at the waveform baseline, using neither the indigo (saved comment) nor fuchsia (authoring mode) accent, with an aria-label naming it as the viewer's own pin."
    requirement: "D-10, D-11"
    verification:
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx#renders a plain lavender dot for the viewer's own pin, with a private aria-label and neither accent colour"
        status: pass
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx#renders no pin dot when there are no pins"
        status: pass
    human_judgment: false
  - id: D3
    description: "A one-time dismissible coachmark tells the writer, in the contract's exact wording, that pins are private — persisted per-viewer so it never reappears."
    requirement: "D-11"
    verification:
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx#offers a Pin control in the transport row and tells the writer once, plainly, that a pin is private"
        status: pass
    human_judgment: false
  - id: D4
    description: "Tapping a pin dot opens a popover with exactly two actions — Turn into a comment, Remove pin — no confirmation dialog on either."
    requirement: "D-12, D-13"
    verification:
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx#offers exactly two pin actions — turn into a comment, or remove — with no confirmation dialog"
        status: pass
    human_judgment: false
  - id: D5
    description: "Turning a pin into a comment reuses submitComment as the sole posting path; the pin is deleted only after the post succeeds, so a failed delete leaves a harmless private pin and never a lost comment."
    requirement: "D-12"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-private-pins.test.ts#calls onCommentChanged( exactly as many times as there are legitimate comment mutations"
        status: pass
    human_judgment: true
    rationale: "The success-gated delete-after-post ordering and the actual single-marker outcome at a promoted timestamp require live DOM/network interaction this repo's jsdom-free Jest config cannot exercise via renderToStaticMarkup. Proven by source/code review and the doctrine gate's call-site count here; the end-to-end outcome (exactly one marker remains, pin row gone) is explicitly deferred to plan 39-11's manual pass per this plan's own <verification> section."
  - id: D6
    description: "No pin path (load, drop, remove, or promote) ever calls onCommentChanged, emits a realtime event, or reaches the room — promotion's own onCommentChanged call is the pre-existing comment-post call, not a new one."
    requirement: "D-11, D-12"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-private-pins.test.ts#carries no realtime call, presence import, or notification call"
        status: pass
      - kind: unit
        ref: "__tests__/writer-room-private-pins.test.ts#defines no pin-shaped event name"
        status: pass
    human_judgment: false
  - id: D7
    description: "Pins are never offered for carry-forward — the carryOffer block's rendered output is unaffected by the presence of pins in the fixture, and the carryOffer literal count in the source is unchanged from before this plan."
    requirement: "D-13"
    verification:
      - kind: unit
        ref: "components/catalogue/TimedTrackPlayer.test.tsx#never triggers the carry-forward offer block due to the presence of pins"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-09-14
status: complete
---

# Phase 39 Plan 09: Private pins — a bookmark, not a letter Summary

**Wordless pins on `TimedTrackPlayer`: a one-press drop, a plain-lavender dot layer that uses neither accent colour, a two-action popover (promote-through-the-existing-post-path or remove-with-no-confirm), a one-time privacy coachmark, and a doctrine-gate extension that pins the player's `onCommentChanged(` call-site count so a pin can never gain a route to the room.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-14T20:38:50Z
- **Tasks:** 3/3
- **Files modified:** 3

## Accomplishments

- **Load, drop, draw, say it once (Task 1).** A `loadPins` loader fetches the caller's own pins on mount and on version change, kept in fully separate state from comments (no shared list, count, or `refreshToken`). A quiet `text-[10px] text-lavdim hover:text-brandindigo` "Pin" link drops a wordless pin at the current playhead with one press — no composer, no confirm, and never a waveform tap (seeking stays the waveform's only gesture). Each pin renders as a plain `bg-lav/60` dot at `top-8` on the waveform baseline (documented in-code why that deviates from the UI-SPEC's literal `bottom-1`: the bottom edge is already occupied by the elapsed/duration timestamps in this component's 58px timeline), with an `aria-label` naming it as the viewer's own pin. A one-time coachmark states the exact contract wording — "Pins are private — only you can see them." — and persists its dismissal per-viewer via `local-drafts.ts`, read back with an unexpiring override so the module's default seven-day expiry can never resurrect it. An `initialPins` static-render test seam mirrors the existing `initialComments` seam, since production pins arrive via an internal fetch that `renderToStaticMarkup` never runs.
- **The pin popover (Task 2).** Each pin dot is a real `<button>` that toggles a small inline popover (`bg-card2 border border-hairstrong rounded-[8px] p-2 text-[9px]`, not a thread) offering exactly two actions. "Turn into a comment" pre-seeds the existing composer at the pin's timestamp and records the promoting pin; the writer still posts through the one existing `submitComment` path, and only its success deletes the pin (D-12) via a single shared `deletePin` helper — a failed delete leaves a harmless private pin, never a lost comment. "Remove pin" deletes through that same helper with no confirmation dialog (D-13: a pin costs nothing to re-drop). The popover closes on either action and on an outside press (a `mousedown` listener scoped to a ref, registered only while a pin is selected — the same lifecycle pattern the existing Mark-span Esc listener already uses). A promotion in progress is abandoned if the writer selects a different marker or closes the comments panel without posting. `carryOffer` is completely untouched — its literal count in the source and its rendered output are both unaffected by pins.
- **The doctrine gate, extended (Task 3).** `__tests__/writer-room-private-pins.test.ts` gains a fourth group asserting the player source carries no realtime call, no `WriterRoomPresence` import, and no `createNotification` call; pins the count of `onCommentChanged(` call sites to a named constant (3 — post a comment, resolve/reopen a thread, save a carry-forward choice) with an in-test comment explaining that a pin drop, removal, or load must never join that list, and that promotion needs no new entry since it already rides the existing post call; and asserts the source defines no `pin_changed`/`pin_added`-shaped event name. All three pre-existing groups (silence, presence-channel invariance, access model) keep passing unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1: Load pins, drop a pin, draw the pin layer, say it once** - `77907a57` (feat)
2. **Task 2: The pin popover — promote into a comment, or remove** - `4d341f5d` (feat)
3. **Task 3: Extend the doctrine gate to the player's pin paths** - `82debd7e` (test)

## Files Created/Modified

- `components/catalogue/TimedTrackPlayer.tsx` — pins state/loader/drop/delete/promote, pin dot layer, pin popover, one-time coachmark, `initialPins` test seam, `toggleCommentsPanel` helper
- `components/catalogue/TimedTrackPlayer.test.tsx` — `pinFixture`/`pinButtonMarkup` helpers, Pin-control/coachmark test, no-pins test, dot-colour-discipline test, popover-source-content test, carry-offer-unaffected test
- `__tests__/writer-room-private-pins.test.ts` — Group four: player silence, `onCommentChanged(` call-site count constant, no pin-shaped event name

## Decisions Made

See `key-decisions` in frontmatter — summarized: (1) the pin dot was built as a real, already-clickable `<button>` in Task 1 rather than restructured from a non-interactive element in Task 2, keeping the interactive-element diff in one place; (2) `promotingPinId` clears in two more places than the plan's literal prose spells out (`selectComment`, a new `toggleCommentsPanel` helper) because both are required for "cancels or navigates away without posting" to actually hold; (3) the popover's outside-press close reuses the same registered-only-while-active listener lifecycle already established by the Mark-span Esc handler; (4) three code comments were reworded mid-task after their own literal text (`Number.MAX_SAFE_INTEGER`, `Turn into a comment`, `Remove pin`) inflated the plan's own exact-count acceptance greps for those same strings — this is documented under Issues Encountered below, not as a deviation, since no behavior changed.

## Deviations from Plan

None — plan executed exactly as written. No Rule 1–4 deviations were required.

## Issues Encountered

- Three explanatory code comments initially restated literal strings the plan's acceptance criteria grep for an exact count (`Number.MAX_SAFE_INTEGER` appeared twice — once in code, once in a comment referencing it; `Turn into a comment` and `Remove pin` each appeared three times — once each in JSX, and twice more in comments). Reworded each comment to describe the same reasoning without repeating the literal string, bringing every count back to the plan's mandated exactly-1. No code behavior changed; caught and fixed before committing each task.
- This repo's Jest CLI parses literal `[` / `]` in a test path as a regex character class, silently matching zero files for bracketed Next.js route paths (a pre-existing environment quirk, already documented in plan 39-05's summary). Not relevant to this plan's own test paths (`TimedTrackPlayer.test.tsx`, `writer-room-private-pins.test.ts`) since neither contains brackets, but the plan's own `<verify>` commands were run via `npx jest --testPathPatterns="<substring>"` throughout as a matter of consistency and to avoid the same trap on any future bracketed addition.
- No jsdom is installed in this repo (`testEnvironment: 'node'`), so the pin popover's own JSX (only reachable after an `onClick` sets `selectedPinId`), the outside-press-close listener, and the actual success-gated delete-after-post ordering during promotion cannot be exercised by `renderToStaticMarkup`. Per the verification note in this plan's own instructions, these are covered by source-content (text-lock) assertions instead of weakened render assertions, and the genuinely-interactive pieces (does the popover actually open on a real tap, does an outside press actually close it, does promotion actually leave exactly one marker at the timestamp) are explicitly deferred to plan 39-11's manual pass, consistent with how plan 39-08 deferred its own drag-gesture and pre-roll/loop timing verification for the same reason.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Pins are fully built inside `TimedTrackPlayer` on top of the plan 39-05 routes and the plan 39-01 `WorkVersionPinView` type — no new server surface was added or needed.
- **Not verified by this plan (manual, plan 39-11, per this plan's own `<verification>` section):** that writer B, a current room member, sees zero pins, zero count, and zero trace of writer A's pins on the same take (RLS boundary — Jest cannot impersonate two authenticated Postgres roles); and that promoting a pin leaves exactly one marker at that timestamp with the pin row gone (requires live DOM interaction this repo's jsdom-free Jest config cannot exercise).
- Migration 224 (work_version_pins and its RLS policy) remains human-gated per 39-11 — this plan's UI assumes it lands before first use, same as plan 39-05's routes already assumed.

---
*Phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor*
*Completed: 2026-09-14*

## Self-Check: PASSED

All 3 modified source files (`components/catalogue/TimedTrackPlayer.tsx`, `components/catalogue/TimedTrackPlayer.test.tsx`, `__tests__/writer-room-private-pins.test.ts`) and this SUMMARY.md confirmed present on disk. All 3 task commits (`77907a57`, `4d341f5d`, `82debd7e`) confirmed present in `git log`. Full repo suite green (611 suites / 7373 tests), `npm run typecheck` clean.
