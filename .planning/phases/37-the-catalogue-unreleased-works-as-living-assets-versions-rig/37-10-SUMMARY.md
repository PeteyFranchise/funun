---
phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig
plan: 10
subsystem: ui
tags: [react, tailwind, catalogue, diary, composer, renderToStaticMarkup, sketch-005-c, sketch-001]

requires:
  - phase: 37-03
    provides: "resolveGuidingLine() — the single next-best-step resolver GuidingLine.tsx renders exactly and only"
  - phase: 37-04
    provides: "describeDiaryEvent() and types/catalogue.ts — the three-part entry shape DiaryFeed.tsx renders, and the DiaryAccent tokens diary.ts already assigns per kind"

provides:
  - "components/catalogue/ComposerCard.tsx — the four-verb bar plus the reassurance line, and a separately exported empty-state hero (the hum-first pitch)"
  - "components/catalogue/GuidingLine.tsx — the single quiet sentence between the composer and the diary, structurally incapable of rendering more than one"
  - "components/catalogue/DiaryFeed.tsx — the reverse-chronological ledger, one component with a compact (001-C) and a rail (001-A) treatment"

affects: [37-12]

tech-stack:
  added: []
  patterns:
    - "Capture-degrade mirrored into presentational props: components/catalogue/ComposerCard.tsx accepts supportsCapture (a plain boolean, no MediaRecorder import) and re-routes its hum tile's callback and label rather than rendering a mic button that can never open — same contract plan 09's HumCaptureButton reports up, expressed one layer higher with zero coupling to the browser API itself."
    - "Type-level assertion via @ts-expect-error inside a never-invoked test function — proves GuidingLineProps['step'] cannot admit an array at compile time (checked by both `tsc --noEmit` and ts-jest), rather than relying on a runtime check that a later edit could quietly relax."
    - "Presentational accent translation, never re-decision: components/catalogue/DiaryFeed.tsx maps DiaryEntryView['accent'] token names to Tailwind classes in a local Record, but never assigns which DiaryEventKind gets which DiaryAccent — that decision stays owned by lib/catalogue/diary.ts's DIARY_KIND_ACCENT."

key-files:
  created:
    - components/catalogue/ComposerCard.tsx
    - components/catalogue/ComposerCard.test.tsx
    - components/catalogue/GuidingLine.tsx
    - components/catalogue/GuidingLine.test.tsx
    - components/catalogue/DiaryFeed.tsx
    - components/catalogue/DiaryFeed.test.tsx
  modified: []

key-decisions:
  - "The capture-degrade prop (supportsCapture) was extended to BOTH exported components — ComposerCard's four-verb bar (explicitly required by the plan) and ComposerCardEmptyState's hero (not explicitly named, but the same dead-mic-button problem exists on a brand-new song's very first screen, which is the one place the hum pitch matters most). Rule 2 (missing critical functionality): an unsupported browser reaching the empty state would otherwise see a primary action that can never fire. The gradient stays spent on exactly one button either way — only its label and callback route change."
  - "The unsupported-capture hum tile is labeled 'Upload it', not 'Add audio' — the sketch's existing 'Add audio' tile is a separate, unrelated verb (the deliberate upload flow) and reusing its exact label on a different tile in a different position would read as a duplicate control. 'Upload it' keeps the tile in its sketch-decided first position (an artist reaching for 'hum' shouldn't hunt for a renamed tile) while telling the truth about what tapping it now does."
  - "GuidingLine's reason field (present on GuidingLineStep, e.g. the hum-to-claim step's supporting sentence) is deliberately NOT rendered. The task's own enumeration of the row's contents (lamp, bold prefix, the step's own sentence, Do-it, dismiss) never mentions a second line, and sketch 005-C's row is drawn as one line. Rendering `reason` inline would grow the row into two lines, undermining the 'never a stack, always quiet' doctrine the whole component exists to enforce. `headline` is treated as the step's complete sentence; `reason` stays reserved for a future expansion (e.g. a click-to-read-more), not built in this plan."
  - "DiaryFeed's chip-glyph/accent-colour mapping for the rail treatment defers entirely to lib/catalogue/diary.ts's already-decided DIARY_KIND_ACCENT (roster = emerald-400, not the 'neutral lavender' the plan's prose describes) — plan 04 is the source of truth per this plan's own instruction ('take the accent mapping from lib/catalogue/diary.ts rather than restating it here'), and diary.ts's own header comment documents why roster got emerald over lavender. No accent color is hardcoded in this component; every one comes from entry.accent."
  - "DiaryFeedEntry extends DiaryEntryView with three page-supplied fields (id, versionNumeral, playbackUrl/playbackDurationSeconds) that have no home in describeDiaryEvent()'s return shape — a stable React key and a version's playback data are not diary-record facts, they're rendering inputs the page already has (the same versionNumerals map it built for describeDiaryEvent()'s own context, and plan 06's signed URL). This keeps lib/catalogue/diary.ts untouched, per the plan's 'consume, never reimplement' instruction for Wave-1 modules."

patterns-established:
  - "A component whose doctrine forbids a shape (GuidingLine: never an array) proves it at the type level inside its own test suite via a never-invoked @ts-expect-error assertion, rather than only asserting the runtime behavior — the same 'unreachable by construction' philosophy plan 03's resolveGuidingLine() already established at the logic layer, carried one layer up into the component's props."

requirements-completed: [S-01, S-02]

coverage:
  - id: D1
    description: "ComposerCard renders all four verb tiles (Hum it / Write lyrics / Add audio / Note) with the sketch 005-C labels and the verbatim reassurance line"
    requirement: S-01
    verification:
      - kind: unit
        ref: "components/catalogue/ComposerCard.test.tsx#ComposerCard — renders all four verbs / renders the verbatim reassurance line"
        status: pass
    human_judgment: false
  - id: D2
    description: "ComposerCard's hum tile degrades to the upload path (relabeled, rewired to onAddAudio) when the browser does not support capture, instead of rendering a dead mic button; the unrelated Add audio tile is unaffected"
    requirement: S-01
    verification:
      - kind: unit
        ref: "components/catalogue/ComposerCard.test.tsx#ComposerCard — degrades the hum tile to the upload path when capture is unsupported"
        status: pass
    human_judgment: false
  - id: D3
    description: "ComposerCardEmptyState renders the hum-first hero (title, thirty-seconds copy, both actions) and spends exactly one gradient, on the primary action, in both the capture-supported and capture-unsupported cases"
    requirement: S-01
    verification:
      - kind: unit
        ref: "components/catalogue/ComposerCard.test.tsx#ComposerCardEmptyState (4 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "GuidingLine renders exactly what a GuidingLineStep provides (lamp, bold 'Next for this song:' prefix, the step's sentence, its own action label, dismiss) and renders nothing at all — not an empty container — when the step is null"
    requirement: S-01
    verification:
      - kind: unit
        ref: "components/catalogue/GuidingLine.test.tsx#GuidingLine — renders the lamp... / renders nothing at all"
        status: pass
    human_judgment: false
  - id: D5
    description: "GuidingLine's prop type cannot express a stack — a type-level assertion (@ts-expect-error on an array-valued step) fails to compile, checked by both tsc --noEmit and ts-jest"
    requirement: S-01
    verification:
      - kind: unit
        ref: "components/catalogue/GuidingLine.test.tsx#GuidingLine — cannot type-check an array as the step prop"
        status: pass
    human_judgment: false
  - id: D6
    description: "GuidingLine spends only a border/faint-wash gradient tint, never the full bg-grad gradient the composer's primary action owns"
    requirement: S-01
    verification:
      - kind: unit
        ref: "components/catalogue/GuidingLine.test.tsx#GuidingLine — never spends the full bg-grad gradient"
        status: pass
    human_judgment: false
  - id: D7
    description: "DiaryFeed renders headline/consequence/date for all nine describeDiaryEvent() kinds via the real function (not hand-written fixtures), in both the compact (001-C) and rail (001-A) layouts, without re-sorting the given order"
    requirement: S-02
    verification:
      - kind: unit
        ref: "components/catalogue/DiaryFeed.test.tsx#DiaryFeed — renders headline... / renders both layout modes / does not re-sort"
        status: pass
    human_judgment: false
  - id: D8
    description: "A version entry renders a play control with duration only when a playbackUrl is supplied, and renders no player at all when it is absent"
    requirement: S-02
    verification:
      - kind: unit
        ref: "components/catalogue/DiaryFeed.test.tsx#DiaryFeed — renders a play control only... / renders no player at all..."
        status: pass
    human_judgment: false
  - id: D9
    description: "An AI entry's rendered consequence is character-identical to the citation string it was given, and the feed renders no button whose label suggests a nudge (re-author, add-to-sheet, fix, warning)"
    requirement: S-02
    verification:
      - kind: unit
        ref: "components/catalogue/DiaryFeed.test.tsx#DiaryFeed — renders an AI entry's consequence... / renders no nudge affordance"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-08-30
status: complete
---

# Phase 37 Plan 10: The composer spine components Summary

**Three components — ComposerCard's four-verb bar with its empty-state hum pitch, GuidingLine's single dismissible sentence, and DiaryFeed's compact/rail reverse-chronological ledger — that together make the work page read exactly as sketch 005-C decided: creation leads, the song gets one sentence, and the diary is the clean, un-nudged exhaust.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-30T11:30:00Z (approx.)
- **Completed:** 2026-08-30T11:50:35Z
- **Tasks:** 3/3 completed
- **Files modified:** 6 created (3 components + 3 test suites)

## Accomplishments

- `components/catalogue/ComposerCard.tsx` — the sketch's four verb tiles (🎙 Hum it / ✎ Write lyrics / ⬆ Add audio / 💬 Note) as pure callback props, the verbatim reassurance line ("Whatever you add, the song remembers — who, what, when. That's your proof, kept automatically."), and a separately exported `ComposerCardEmptyState` carrying the hum-first pitch and the surface's single spent gradient. Both components accept a `supportsCapture` boolean and re-route their hum action to the upload path rather than rendering a dead mic button — Rule 2, extended to the empty state as well as the main card.
- `components/catalogue/GuidingLine.tsx` — renders exactly the single `GuidingLineStep | null` `resolveGuidingLine()` (plan 03) returns: the lamp, the bold "Next for this song:" prefix, the step's own sentence, its own action label, and a dismiss control. Renders nothing at all when the step is null. The prop type structurally cannot express an array, proven with a `@ts-expect-error` type-level assertion inside the test suite. Spends only a faint border/wash gradient tint, never the composer's `bg-grad`.
- `components/catalogue/DiaryFeed.tsx` — one component, two treatments: compact hairline-separated rows (001-C, the default) and a rail of kind-accented chips on a connecting line (001-A). Every headline/consequence/date comes straight from `describeDiaryEvent()` (plan 04); accent colors come from each entry's own `accent` field (`DIARY_KIND_ACCENT`, plan 04's decision, never restated locally). A version entry renders a play control only when a signed `playbackUrl` is supplied. The diary stays clean — no re-author, no splits, no warning button anywhere on a row.
- All three suites use `renderToStaticMarkup` (no jsdom), following `components/handles/ChooseHandleGate.test.tsx`'s precedent. `npx tsc --noEmit`, `npm run lint --max-warnings=0`, and the full `npx jest` suite (303 suites / 3458 tests, up from the 3435-test baseline by exactly the 23 tests this plan added) are all green.

## Task Commits

Each task was committed atomically:

1. **Task 1: components/catalogue/ComposerCard.tsx** — `df706e1` (feat)
2. **Task 2: components/catalogue/GuidingLine.tsx** — `aa15092` (feat)
3. **Task 3: components/catalogue/DiaryFeed.tsx** — `73a4f8e` (feat)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `components/catalogue/ComposerCard.tsx` — `ComposerCard` (four verbs + reassurance line) and `ComposerCardEmptyState` (hum-first hero, one gradient spent).
- `components/catalogue/ComposerCard.test.tsx` — verb labels, verbatim reassurance line, capture-degrade on both components, no-raw-hex, single-gradient assertions.
- `components/catalogue/GuidingLine.tsx` — `GuidingLine`, rendering `resolveGuidingLine()`'s single step or nothing.
- `components/catalogue/GuidingLine.test.tsx` — row content, null-renders-nothing, no-raw-hex, no-double-gradient, and the `@ts-expect-error` type-level "never a stack" assertion.
- `components/catalogue/DiaryFeed.tsx` — `DiaryFeed` (compact/rail), `DiaryFeedEntry` type extending `DiaryEntryView`.
- `components/catalogue/DiaryFeed.test.tsx` — all nine diary kinds run through the real `describeDiaryEvent()`, playback presence/absence, AI-citation verbatim check, no-nudge-affordance, order-preservation, both-layouts, no-raw-hex.

## Decisions Made

See `key-decisions` in frontmatter — five decisions: (1) capture-degrade extended to the empty-state hero as well as the main card (Rule 2); (2) the degraded hum tile is labeled "Upload it" rather than reusing "Add audio"'s exact label; (3) `GuidingLineStep.reason` is deliberately not rendered, keeping the row to its sketch-decided single line; (4) `DiaryFeed`'s chip/accent colors defer entirely to `lib/catalogue/diary.ts`'s already-decided `DIARY_KIND_ACCENT` rather than the plan prose's imprecise "neutral lavender" description of roster (diary.ts's own header comment documents the emerald choice); (5) `DiaryFeedEntry` extends `DiaryEntryView` with three page-supplied, non-diary-record fields (`id`, `versionNumeral`, playback data) rather than modifying `lib/catalogue/diary.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality] Capture-degrade extended to `ComposerCardEmptyState`, not just `ComposerCard`**
- **Found during:** Task 1
- **Issue:** The plan's capture-degrade instruction is written against "the hum tile" in the four-verb bar. The empty-state hero (a separate exported variant, built earlier in the same task) has its own primary "Hum your idea" action with the identical dead-button risk on an unsupported browser — and the empty state is a brand-new song's very first screen, the exact moment the hum pitch matters most.
- **Fix:** `ComposerCardEmptyStateProps` also accepts `supportsCapture` and `onAddAudio`; when capture is unsupported, the primary button's label and callback swap to the upload path while remaining the single gradient-styled action.
- **Files modified:** `components/catalogue/ComposerCard.tsx` (same file/task already in scope — no new file).
- **Verification:** `ComposerCard.test.tsx#ComposerCardEmptyState — degrades the primary action to the upload path when capture is unsupported`.
- **Committed in:** `df706e1` (part of Task 1's commit).

---

**Total deviations:** 1 auto-fixed (Rule 2, contained within the already-scoped file/task — no new file, no scope creep beyond the plan's own stated purpose of a working degrade path).

## Issues Encountered

None. Plan 09 (`HumCaptureButton`) has not yet executed in this shared checkout (only its `PLAN.md` exists) — this plan does not import from it, only mirrors its documented degrade contract (a `supportsCapture` boolean) as a plain prop, so no coupling or ordering dependency exists between the two plans.

## User Setup Required

None — three pure presentational React components, zero I/O, zero new dependencies (threat T-37-SC in the plan's threat model: no package-manager install task in this plan).

## Next Phase Readiness

- `ComposerCard`, `ComposerCardEmptyState`, `GuidingLine`, and `DiaryFeed` are ready for plan 12's work page to wire real callbacks (mounting plan 09's `HumCaptureButton`, the pad, the upload flow, the note composer), a real `resolveGuidingLine()` snapshot, and real `describeDiaryEvent()` output (enriched with `id`/`versionNumeral`/playback fields) into each.
- No blockers. Migrations 135-138 remain unpushed (37-01's own human-gated checkpoint) — none of this plan's components require a live database, and none of their tests open a connection, per the branch-level instruction.

---
*Phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig*
*Completed: 2026-08-30*

## Self-Check: PASSED

All 6 created component/test files verified present on disk; all 3 task commits (`df706e1`, `aa15092`, `73a4f8e`) verified present in `git log --oneline --all`.
