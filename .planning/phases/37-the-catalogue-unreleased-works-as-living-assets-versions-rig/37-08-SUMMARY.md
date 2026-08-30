---
phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig
plan: 08
subsystem: lyrics-pad-ui
tags: [nextjs, react, dnd-kit, catalogue, lyrics, sketch-006-a]

# Dependency graph
requires:
  - phase: 37-02
    provides: "lib/catalogue/blocks.ts — deriveBlockNumerals(), resolveRepeat(), planDetach(), serializeLyrics(), splitPastedLyric(), BLOCK_TYPE_LABELS/VALUES"
  - phase: 37-07
    provides: "POST/PATCH/DELETE /api/works/[workId]/blocks* — the pad's creation, autosave, detach and reorder targets"
provides:
  - "components/catalogue/LyricBlockCard.tsx — the section card (grip, label, two badge clusters, lyric body)"
  - "components/catalogue/CopyLyricMenu.tsx — the tagged/plain 'Copy full lyric' export control"
  - "components/catalogue/LyricsPad.tsx — the sortable container, header, insert-anywhere dividers, add-section chip row"
affects: [37-09-hum-capture-mount, 37-11-work-header, 37-12-page-assembly]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Presentational components, zero fetch: every mutation (text edit, detach, insert, reorder, paste, add-singer) is a callback prop; LyricsPad debounces text edits (600ms) before calling its onTextChange prop, but performs no network call itself"
    - "dnd-kit sortable wrapper matches components/admin/ChecklistAdmin.tsx's existing sensor/strategy shape exactly — PointerSensor + KeyboardSensor(sortableKeyboardCoordinates), verticalListSortingStrategy, useSortable's setActivatorNodeRef isolated to the grip button only"
    - "Owner/collaborator avatar gradients are built from individual brandindigo/brandfuchsia and emerald-400/blue-400 tokens (bg-gradient-to-br from-X to-Y), never the shared bg-grad utility — bg-grad is this codebase's reserved single-spend CTA treatment (ComposerCard/GuidingLine precedent) and an identity avatar recurs once per owner-authored block, which would otherwise 'spend' the reserved gradient repeatedly"
    - "LyricsPad's dropdown-style surfaces (CopyLyricMenu's flavour menu) stay in the DOM always, toggled via a `hidden` class rather than a conditional `&&` return — keeps both options present in a renderToStaticMarkup snapshot with no DOM to drive the open interaction"

key-files:
  created:
    - components/catalogue/LyricBlockCard.tsx
    - components/catalogue/LyricBlockCard.test.tsx
    - components/catalogue/CopyLyricMenu.tsx
    - components/catalogue/CopyLyricMenu.test.tsx
    - components/catalogue/LyricsPad.tsx
    - components/catalogue/LyricsPad.test.tsx
  modified: []

key-decisions:
  - "Owner avatar gradient built from `from-brandindigo to-brandfuchsia` tokens rather than the `bg-grad` utility class, even though sketch 006-A's own `.av{background:var(--grad)}` CSS is visually identical. This plan's own prohibition ('MUST NOT spend the indigo-to-fuchsia gradient more than once on this surface') would otherwise be violated the moment two blocks share the same owner — which the sketch's own literal markup already does (two `.av` avatars, both @peterzora). Reproducing the same visual treatment from individual tokens keeps `bg-grad`'s literal string count at zero across this whole plan's surface, reserving that reserved single-spend utility entirely for wherever plan 12's page ultimately spends it (already claimed once by ComposerCardEmptyState's primary action on the same eventual page)."
  - "LyricsPad accepts pre-resolved `authorDisplay`/`singerDisplays` on each block (the `LyricsPadBlock` type extends `LyricBlock` with exactly those two fields) rather than doing its own user-id → name/initial lookup. This keeps the 'presentational, no fetch' contract honest — member/collaborator resolution is a data-fetching concern that belongs to plan 12's page (which already loads member data for ComposerCard/DiaryFeed), not to this component."
  - "Text edits debounce INSIDE LyricsPad (600ms, per-block timers) before the `onTextChange` callback fires, rather than expecting the caller to debounce. The plan's own wording ('each block's text is an editable region whose changes are debounced before they PATCH') places the debounce responsibility on the pad itself — a local `pendingText` override map keeps each textarea responsive on every keystroke while the actual callback (and, by extension, migration 138's edit trigger) fires at most once per 600ms of quiet."
  - "Reorder is optimistic with snapshot-based rollback (mirrors ChecklistAdmin.tsx's existing WR-05 pattern): `onReorder` is awaited, and any rejection — the 409 plan 07's route returns under concurrent editing — reverts the local order to its pre-drag snapshot and surfaces the thrown message, rather than leaving the visible order out of sync with the server's actual state."
  - "The 'Chorus repeat' quick-insert at a divider picks the LAST chorus in position order as its source when more than one exists — the most recently written chorus is the one an artist reaching for a divider's repeat chip is almost always trying to reuse (a final-chorus lift, not an early draft)."

requirements-completed: [S-04, S-02, S-01]

coverage:
  - id: D1
    description: "LyricBlockCard renders sketch 006-A's structure block exactly: grip, uppercase indigo label (prop-derived, never computed), the two PERFORMER RULE badge clusters, and the lyric body. A linked repeat renders the source's resolved text dimmed with the repeat badge, suppresses its own author affordance, and offers Detach to vary. Instrumental works show no who-sings affordance on any block; a duet renders two singer avatars."
    requirement: S-04
    verification:
      - kind: unit
        ref: "components/catalogue/LyricBlockCard.test.tsx — 6 tests: label passthrough, repeat text+badge+suppressed author, instrumental suppression, duet avatars, empty-cluster affordance, no raw hex"
        status: pass
    human_judgment: false
  - id: D2
    description: "CopyLyricMenu offers exactly the tagged and plain flavours in tool-agnostic language (CONTEXT S-04, locked), sourcing text from serializeLyrics() with no assembly of its own, copying client-side with a selectable-textarea fallback on clipboard failure."
    requirement: S-04
    verification:
      - kind: unit
        ref: "components/catalogue/CopyLyricMenu.test.tsx — 5 tests: both flavours present, no vendor name, no confirmation on first paint, no raw hex, no gradient spend"
        status: pass
    human_judgment: false
  - id: D3
    description: "LyricsPad renders the sortable list in position order, an insert-anywhere divider above every block (n blocks -> n dividers) offering a chorus-repeat-first chip once a chorus exists, the eight-chip add-section row in sketch 006-A's decided order, a debounced autosave path, and a 409-aware optimistic reorder; the empty pad renders the add-section row rather than a bare container, and the title input is absent by design (it lives once, in plan 11's WorkHeader)."
    requirement: S-01
    verification:
      - kind: unit
        ref: "components/catalogue/LyricsPad.test.tsx — 6 tests: position order + numerals, chip order, divider count, empty-state add row, header autosave line/no title input, no raw hex"
        status: pass
    human_judgment: false
  - id: D4
    description: "Collaborator attribution: the ✍ writer badge is prop-driven from LyricsPadBlock.authorDisplay (never computed here), matching S-02's requirement that every block carries a real author on the record for the splits nudge to point at."
    requirement: S-02
    verification:
      - kind: unit
        ref: "components/catalogue/LyricBlockCard.test.tsx — label/author passthrough tests; components/catalogue/LyricsPad.test.tsx — position-order test asserts author-bearing blocks render correctly in sequence"
        status: pass
    human_judgment: false

# Metrics
duration: ~55min
completed: 2026-08-30
status: complete
---

# Phase 37 Plan 08: The Lyrics Pad Components Summary

**Three presentational React components — the structure-block card, the two-flavour copy-lyric export, and the dnd-kit sortable pad with insert-anywhere dividers — implementing sketch 006-A verbatim over plan 02's pure logic and plan 07's routes, with zero fetch calls of their own.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-08-30
- **Tasks:** 3 (all `type="auto"`)
- **Files modified:** 6 (all created)

## Accomplishments

- `components/catalogue/LyricBlockCard.tsx` — the section card: grip, uppercase indigo section
  label (a prop from `deriveBlockNumerals()`, never computed here), the ✍ automatic writer badge
  and 🎤 declared singer cluster (PERFORMER RULE), the DEFAULT-PERFORMER RULE's instrumental
  third state (suppresses every who-sings affordance, on every block), and the REPEAT RULE's
  dimmed linked-repeat treatment with a suppressed author badge and a "Detach to vary" action.
  Owner/collaborator avatars use a token-built gradient (`from-brandindigo to-brandfuchsia` /
  `from-emerald-400 to-blue-400`), deliberately not the shared `bg-grad` utility — see Decisions
  below.
- `components/catalogue/CopyLyricMenu.tsx` — "Copy lyric ▾", offering exactly the tagged and
  plain flavours in CONTEXT S-04's locked tool-agnostic wording. Text comes from
  `serializeLyrics()` (plan 02) with no assembly of its own; copies client-side with no server
  round trip, degrading to a selectable `<textarea>` when the clipboard API is unavailable or
  refused.
- `components/catalogue/LyricsPad.tsx` — the sortable container: a dnd-kit `DndContext` /
  `SortableContext` matching `ChecklistAdmin.tsx`'s existing sensor/strategy shape exactly; the
  header (autosave status line + the melody button, deliberately no title input); an
  INSERT-ANYWHERE divider above every block offering "↺ Chorus repeat" first once a chorus
  exists; the eight-chip add-section row in sketch 006-A's decided order (Verse, Pre-Chorus,
  Chorus, Bridge, Intro, Outro, Hook, Custom…); a 600ms per-block debounce before the autosave
  callback fires; and a 409-aware optimistic reorder that reverts to the last known server order
  on conflict.

## Task Commits

Each task was committed atomically with explicit-pathspec staging and a `git show --stat`
verification after every commit (two siblings share this checkout):

1. **Task 1: `LyricBlockCard.tsx` — the section card** — `ce56d7d` (feat)
2. **Task 2: `CopyLyricMenu.tsx` — the two-flavour export (S-04)** — `cf852f6` (feat)
3. **Task 3: `LyricsPad.tsx` — sortable container, header, insert-anywhere** — `5917507` (feat,
   also fixes `LyricBlockCard`'s drag-handle prop types — see Deviations)

## Files Created/Modified

- `components/catalogue/LyricBlockCard.tsx` — section card, presentational, no fetch
- `components/catalogue/LyricBlockCard.test.tsx` — 6 tests, `renderToStaticMarkup`
- `components/catalogue/CopyLyricMenu.tsx` — tagged/plain export control
- `components/catalogue/CopyLyricMenu.test.tsx` — 5 tests, `renderToStaticMarkup`
- `components/catalogue/LyricsPad.tsx` — sortable pad, header, dividers, chip row
- `components/catalogue/LyricsPad.test.tsx` — 6 tests, `renderToStaticMarkup`

## Decisions Made

See `key-decisions` in the frontmatter for the full list. The one worth calling out here: this
plan's own prohibition forbids spending "the indigo-to-fuchsia gradient" more than once on this
surface, while sketch 006-A's literal HTML/CSS uses that exact gradient on an avatar **twice**
(both of the owner's blocks in the sketch's example markup). Rather than either (a) violating the
plan's own prohibition by reusing the shared `bg-grad` utility once per owner-authored block, or
(b) dropping the sketch's avatar treatment entirely, every avatar is built from the same two
color **tokens** (`brandindigo`/`brandfuchsia`, `emerald-400`/`blue-400`) via
`bg-gradient-to-br from-X to-Y` rather than the reserved `bg-grad` class — visually identical to
the sketch, token-only (no raw hex), and it keeps `bg-grad`'s literal count at zero across this
entire plan's surface, so the reserved single spend stays available for wherever plan 12's
assembled page actually wants it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `LyricBlockCard`'s drag-handle prop types didn't compile against a real `useSortable()` call**
- **Found during:** Task 3, writing `LyricsPad.tsx`'s `SortableLyricBlock` wrapper
- **Issue:** Task 1 typed `dragHandleAttributes`/`dragHandleListeners` as `Record<string,
  unknown>`. dnd-kit's actual `DraggableAttributes` type has no string index signature, so
  `npx tsc --noEmit` failed the moment Task 3 fed it a real value from `useSortable()`.
- **Fix:** Loosened both props to `object` (framework-decoupled — this component just spreads
  whatever it's handed, it never reads a specific key off these props itself).
- **Files modified:** `components/catalogue/LyricBlockCard.tsx`
- **Commit:** `5917507` (bundled into Task 3's commit, since the compile error was invisible
  until Task 3's real `useSortable()` call existed to trigger it)

No other deviations — every `must_haves.truths` and `prohibitions` is implemented exactly as
specified.

## Threat Flags

None beyond this plan's own `<threat_model>`, all implemented as specified:

| Threat | Where it landed |
|---|---|
| T-37-49 (XSS via collaborator-entered lyric/custom-label text) | No component in this plan uses `dangerouslySetInnerHTML`; every rendered string goes through JSX's default escaping (verified structurally by `expect(markup).not.toContain(vendor)` — style-substring checks — across all three test suites) |
| T-37-50 (displayed vs. exported lyric diverging) | Both the on-screen resolution (`LyricsPad` via `resolveRepeat()`) and the export (`CopyLyricMenu` via `serializeLyrics()`) call the same plan-02 functions; no component assembles a string of its own |
| T-37-51 (an export that hides a repeat) | `serializeLyrics()` expands every repeat in full — this plan's components make zero decisions about that, they only render what the function returns |
| T-37-52 (lost/reverted reorder under concurrent editing) | `LyricsPad`'s drag-end handler awaits `onReorder` and reverts to the pre-drag snapshot on any rejection, surfacing the thrown message as a short retry line |
| T-37-53 (clipboard failure leaving the artist without their words) | `CopyLyricMenu` degrades to a selectable `<textarea>` on any clipboard failure rather than a silent no-op |
| T-37-SC (package installs) | None run — `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` were already dependencies in active use (`components/admin/ChecklistAdmin.tsx`) |

## Known Stubs

None. Every prop this plan's three components accept is either rendered directly or passed
straight through to a plan-02 pure function or a plan-07 route-shaped callback — no hardcoded
empty value, no placeholder copy, no unwired data source.

## Gate Results

| Gate | Result |
|---|---|
| `npx jest components/catalogue/LyricBlockCard.test.tsx` | 6/6 pass |
| `npx jest components/catalogue/CopyLyricMenu.test.tsx` | 5/5 pass |
| `npx jest components/catalogue/LyricsPad.test.tsx` | 6/6 pass |
| `npx tsc --noEmit` | 0 errors |
| `npm run lint -- --max-warnings=0` | clean (project-wide) |
| `npx jest` (full suite) | 315 suites / 3545 tests, all passing (baseline at plan start: 305 suites / 3475 tests — climbing as sibling wave-3 plans land concurrently in the same checkout) |
| `npm run build` | **not run** — forbidden by this plan and the owner's dev server on :3000; used `npx tsc --noEmit` throughout |

## Issues Encountered

- **A sibling's uncommitted file failed mid-checkout, transiently, outside this plan's scope.**
  One `npx jest components/catalogue` run mid-session showed a single failure in
  `AiEntryFlow.test.tsx` (an apostrophe-encoding mismatch), an untracked file belonging to a
  concurrently-running sibling agent (not in this plan's `files_modified`, never touched by this
  plan). Per the SCOPE BOUNDARY rule, this was left alone rather than fixed; a re-run of the full
  suite moments later showed 315/315 suites green, confirming the sibling's own in-progress edit
  resolved itself before this plan's own final gate check. No file this plan touches was involved.
- No other issues. Every task's own suite was green on first `npx jest` run against fully written
  code; the only fix needed (see Deviations) was a type compile fix, not a test failure.

## User Setup Required

None. No external service configuration required — every component in this plan is
presentational, and every mutation is a callback prop the eventual page (plan 12) wires to plan
07's already-live routes.

## Next Phase Readiness

- `LyricBlockCard`, `CopyLyricMenu`, and `LyricsPad` are ready for plan 12's page assembly to
  mount: `LyricsPad`'s `onHum` prop is exactly the seam plan 09's `HumCaptureButton` mounts
  through (matching `ComposerCard.tsx`'s identical `onHum: () => void` pattern), and its
  `onTextChange`/`onInsertSingle`/`onInsertRepeat`/`onDetach`/`onReorder`/`onPasteImport`/
  `onAddSinger` callbacks map directly onto plan 07's blocks routes (`POST`, `PATCH`, `DELETE`,
  `POST .../reorder`).
- `LyricsPadBlock`'s `authorDisplay`/`singerDisplays` fields are the one piece of resolution
  plan 12's page must supply (user-id/collaborator → initial/name/isOwner) — this plan
  deliberately does not perform that lookup itself, keeping the "presentational, no fetch"
  contract honest.
- No blockers.

---
*Phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig*
*Completed: 2026-08-30*

## Self-Check: PASSED

All six created component/test files verified present on disk at their exact paths. All three
task commit hashes (`ce56d7d`, `cf852f6`, `5917507`) verified present in `git log --oneline --all`
on `feat/phase-37-songwriter`.
