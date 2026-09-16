---
phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv
plan: 07
subsystem: ui
tags: [react, nextjs, client-component, fetch, catalogue, export]

requires:
  - phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv (40-04, 40-05)
    provides: "GET .../comments/export and GET .../pins/export routes — both return a downloadable marker file on success or a 409 JSON refusal body with a `message` field on empty/nothing-to-export"
  - phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv (40-01)
    provides: "lib/catalogue/take-export.ts — skippedRepositionNote(count), browser-safe (no I/O)"
provides:
  - "components/catalogue/TakeMarkerExport.tsx — a small 'use client' component with two independent controls (Export comments, Export my pins), each with its own fetch/branch/download handler"
  - "A single-element mount of that component in TimedTrackPlayer.tsx's take action row"
  - "__tests__/writer-room-take-marker-export-ui.test.ts — source-assertion doctrine gate for the E-03 structural separation, the E-13 two-format count, the E-09 skipped-count import, and the T-40-35 onCommentChanged( call-site count"
affects: [40-08, 40-09]

tech-stack:
  added: []
  patterns:
    - "Two independent client-side export handlers, each with its own literal fetch URL, its own pending flag, and its own message state — no shared runExport(kind) helper, per E-03."
    - "fetch-and-branch-on-status instead of an anchor with a download attribute, because a 409 refusal carries a JSON body that must never be saved as a file."
    - "Filename read from the Content-Disposition response header rather than rebuilt client-side, so E-06's sanitisation has exactly one implementation."

key-files:
  created:
    - "components/catalogue/TakeMarkerExport.tsx"
    - "__tests__/writer-room-take-marker-export-ui.test.ts"
  modified:
    - "components/catalogue/TimedTrackPlayer.tsx"

key-decisions:
  - "Both controls render their format-choice disclosure as an inline pill of small buttons (matching the existing pins-coachmark pill shape in the action row) rather than a native select-plus-confirm — reads quieter in a row already carrying eight other quiet 10px controls."
  - "409-body message extraction uses `body.message || genericFailureMessage(kind)` rather than `??` — the comments export route's refusal key is `reason`/`message` and the pins export route's is `error`/`message` (an intentional asymmetry visible in their own route source), but both always carry `message` on a 409, so reading only `message` with a truthy fallback (catching both undefined and an empty string) is the one thing both routes agree on and is all this component needs to know."
  - "Two independent ControlState objects (comments, pins), each carrying its own open/pending/message/isError, so exporting pins never disables or blanks the comments control's message and vice versa."
  - "The doctrine test's anchor-download assertion checks a regex for `href=` pointing at either export path rather than asserting 'no `<a>` tag exists' — the component in fact contains no anchor at all (the blob-download idiom builds one with `document.createElement('a')` and a blob: object URL), so the stronger, more specific assertion is the one that will actually fail if a future edit adds a static download anchor."

requirements-completed: [E-03, E-09, E-11, E-13]

coverage:
  - id: D1
    description: "A writer on a take sees two separate controls — Export comments and Export my pins — with two handlers, two literal URLs, and no shared parameterized handler."
    requirement: "E-03"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-take-marker-export-ui.test.ts#the component source > contains both literal export paths, each exactly once"
        status: pass
      - kind: unit
        ref: "__tests__/writer-room-take-marker-export-ui.test.ts#the component source > has exactly two fetch( call sites"
        status: pass
    human_judgment: false
  - id: D2
    description: "Choosing a DAW is how a format is chosen; exactly two format options are offered (Audacity, CSV) and named by DAW, not by serialization. Audition stays absent pending plan 40-08."
    requirement: "E-13"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-take-marker-export-ui.test.ts#the component source > offers exactly two format options"
        status: pass
    human_judgment: false
  - id: D3
    description: "When the export refuses (409), the writer reads the server's own sentence in place, in a role=\"alert\" region, and no file is saved — no anchor with a download attribute points at either export route."
    requirement: "E-11"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-take-marker-export-ui.test.ts#the component source > contains no static anchor whose href is an export path"
        status: pass
      - kind: unit
        ref: "__tests__/writer-room-take-marker-export-ui.test.ts#the component source > uses role=\"status\" for the success note and role=\"alert\" for a refusal or failure"
        status: pass
    human_judgment: true
    rationale: "No jsdom exists in this repo, so the fetch-and-branch logic that actually produces the 409 message on screen is unobservable by any test here. The source assertions prove the structural shape (no download anchor, correct role attributes wired to an isError flag) is present; they cannot prove a live 409 response renders correctly in a browser. This is the plan's own human-check items 2-3."
  - id: D4
    description: "When comments were left out for needing a new position, the writer is told how many, right after the download, using the shared skippedRepositionNote wording."
    requirement: "E-09"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-take-marker-export-ui.test.ts#the component source > imports the skipped-count sentence from the pure export module"
        status: pass
    human_judgment: true
    rationale: "The import is proven; the runtime behavior (reading the X-Funun-Skipped-Reposition header off a real response and rendering the resulting sentence after a real download) cannot be exercised without jsdom or a live request. This is the plan's own human-check item 4, and is explicitly conditional on a repositioning-flagged take existing to test against."
  - id: D5
    description: "The player mount is a single-element insertion plus one import (fewer than 10 changed lines), with no new state, no new prop on TimedTrackPlayerProps, and the onCommentChanged( call-site count unchanged at exactly 3 — export tells the room nothing (E-10, T-40-35)."
    verification:
      - kind: unit
        ref: "__tests__/writer-room-take-marker-export-ui.test.ts#the player's source > renders the new component exactly once / still calls onCommentChanged( exactly three times"
        status: pass
      - kind: other
        ref: "git diff --stat -- components/catalogue/TimedTrackPlayer.tsx (2 insertions, 0 deletions)"
        status: pass
    human_judgment: false

duration: ~30min
completed: 2026-09-16
status: complete
---

# Phase 40 Plan 07: The Export Controls, Mounted on the Take Summary

**Two independent, structurally separated export controls (Export comments, Export my pins) added to `TimedTrackPlayer.tsx`'s take action row — each fetches its own literal route, branches on a 409 refusal into an in-place message rather than a saved file, and reads its downloaded filename from the server's `Content-Disposition` header.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-09-16T02:00:00Z (approx, worktree session start)
- **Completed:** 2026-09-16T02:14:00Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Built `components/catalogue/TakeMarkerExport.tsx`: a `'use client'` component taking only `workId`, `versionId`, and an optional `className` — deliberately not the comment list, because the server (not the client) is the only authority on which exports refuse (E-01/E-09/E-11).
- Two fully independent handlers (`exportComments`, `exportPins`), each with its own literal fetch URL, its own pending flag (so exporting pins never disables the comments control), and its own message/error state. No shared `runExport(kind)` helper exists anywhere in the file — proven by a doctrine test asserting exactly two `fetch(` call sites.
- Exactly two DAW format options (Audacity, Spreadsheet/CSV) are offered per control, named by DAW rather than serialization format (E-13); a module-level comment above the array documents that Audition is deliberately withheld pending plan 40-08's verification, and that adding it later is a one-line change (plan 40-09).
- A 409 response is parsed for its `message` field and rendered in place in a `role="alert"` region; no file is ever created on refusal, and no static anchor with a `download` attribute exists anywhere in the component — the blob-download idiom (mirrored from `WorkspaceActivityExplorer.exportCurrentResults`) only ever fires after a real 200 response.
- On a successful comments export, the `X-Funun-Skipped-Reposition` response header is parsed and passed to `skippedRepositionNote` (imported from `lib/catalogue/take-export.ts`, not re-typed), rendering the E-09 sentence in a `role="status"` region.
- Mounted the component into `TimedTrackPlayer.tsx`'s take action row with a single import line and a single JSX element, immediately after the Archive control — a 2-line diff total, no new state, no new prop on `TimedTrackPlayerProps`, and the `onCommentChanged(` call-site count unchanged at exactly 3 (Phase 39's pinned invariant, restated in this plan's own test).
- Wrote `__tests__/writer-room-take-marker-export-ui.test.ts` — 10 source-assertion tests covering the two literal export paths, the two-fetch-call-site proof against convergence, the two-format-option count, the skipped-count import, the absence of a download anchor, the `aria-label`s, the `role="status"`/`"alert"` wiring, and the player-side mount count plus restated callback count.

## Task Commits

Each task was committed atomically:

1. **Task 1: The export control component** - `2d0fce38` (feat)
2. **Task 2: Mount it on the take, and gate the UI's own invariants** - `9c86fb2c` (feat)

_This plan runs in a wave-4 worktree and does not carry its own plan-metadata commit — the orchestrator updates STATE.md/ROADMAP.md after all wave agents complete, per this plan's parallel-execution instructions._

## Files Created/Modified

- `components/catalogue/TakeMarkerExport.tsx` - The two-control export component: format constants, two independent handlers, the blob-download helper, and the JSX for both controls with their disclosure pills and message regions.
- `components/catalogue/TimedTrackPlayer.tsx` - One import line, one `<TakeMarkerExport workId={workId} versionId={versionId} />` element in the take action row.
- `__tests__/writer-room-take-marker-export-ui.test.ts` - Source-assertion doctrine gate: two describe blocks (component source, player source) covering E-03, E-09, E-11, E-13, and T-40-35.

## Decisions Made

- Rendered both format-choice disclosures as an inline pill of small buttons (the same `border-hairstrong bg-card2` pill shape as the existing pins-privacy coachmark), not a native `<select>` plus confirm — reads quieter alongside the row's eight other quiet 10px controls and needed no extra confirm step.
- Read only the 409 body's `message` field with a `||` (not `??`) fallback to a generic sentence, because the comments export route's refusal key is `reason`/`message` while the pins export route's is `error`/`message` — an asymmetry visible in the two routes' own source (40-04, 40-05) — but both always carry `message`, so that is the one field this component needs to know about either route.
- Kept comments' and pins' `ControlState` as two fully separate `useState` objects rather than one keyed-by-kind object, so a pending flag on one control structurally cannot affect the other's disabled state or message.

## Deviations from Plan

None — plan executed exactly as written, including the exact insertion point (after Archive, before the inner flex container's closing tag) and the exact prohibition against a shared parameterized handler.

**Process note, not a code deviation:** the first `git commit -m "$(cat <<'EOF' ... EOF)"` invocation for Task 2's commit failed with a shell quoting error from apostrophes in the message (`TimedTrackPlayer.tsx's`, `39's`). This is the same failure mode plan 40-05's SUMMARY documented. Resolved identically: wrote the message to a scratch file and used `git commit -F <file>`. No impact on commit content.

## Behaviours Only Verifiable By Hand (UAT — per plan 40-07's own human-check block)

No jsdom exists in this repo, so none of the following is observable from any test in this codebase. These are the plan's own six human-check items, restated here so they are not silently assumed:

1. Two separate controls are visible in the take's action row — *Export comments* and *Export my pins* — and neither offers the other's content as an option.
2. Exporting comments on a take with unresolved comments saves a file whose name contains the song title and the take's `vN`, and opening it shows one marker per unresolved comment with the author's display name (not `@handle`).
3. Exporting comments on a take whose comments are all resolved shows no file saved and the resolved message in place, with the correct count.
4. Exporting a take with a repositioning-flagged comment (if one exists in the test environment) shows the skipped-count sentence after the download; if none exists, this remains explicitly unverified rather than assumed passed.
5. Exporting pins on a take with pins produces a file with `my-pins` in its name; exporting on a take with none shows the no-pins sentence with no file.
6. The action row on a phone-width viewport wraps the two new controls rather than overflowing.

## Issues Encountered

None beyond the commit-quoting workaround noted above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 40-08 (Audition byte-for-byte verification) is unblocked by this plan structurally: adding Audition to the UI is a one-line addition to `FORMAT_OPTIONS` in `TakeMarkerExport.tsx` and a corresponding one-line update to this plan's `offers exactly two format options` test, exactly as the plan's `must_haves` anticipated.
- Both export routes (40-04, 40-05) are now wired up end-to-end from the take surface; no further route changes are anticipated from this plan.
- D-11's cross-account pin invisibility remains behaviourally unverified in this environment (carried forward from plans 40-04/40-05, unchanged by this plan) — this component does not add to or resolve that gap; it consumes the pins export route as-is.

## Self-Check: PASSED

- FOUND: `components/catalogue/TakeMarkerExport.tsx`
- FOUND: `__tests__/writer-room-take-marker-export-ui.test.ts`
- FOUND: `components/catalogue/TimedTrackPlayer.tsx` (modified, 2-line diff)
- FOUND: commit `2d0fce38` (Task 1 — feat)
- FOUND: commit `9c86fb2c` (Task 2 — feat)

---
*Phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv*
*Completed: 2026-09-16*
