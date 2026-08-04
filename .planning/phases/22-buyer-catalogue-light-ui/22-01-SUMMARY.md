---
phase: 22-buyer-catalogue-light-ui
plan: 01
subsystem: ui
tags: [react, next.js, buyer-portal, catalogue, design-port]

# Dependency graph
requires:
  - phase: 16-gtm-beta-buyer-portal
    provides: buyer-portal shell (16-03), basic catalog query (16-05), request pipeline (16-06)
provides:
  - Verified baseline record — CatalogBrowserLight.tsx, catalog-sample.ts, and the catalog page wiring
    already exist, compile clean, and are wired together (built pre-plan on feat/buyer-catalogue-light)
  - Honest inventory of shipped scope (slices 1/2a/2b) vs. recorded deferrals for downstream plans 22-02..22-05
affects: [22-02-buyer-catalogue-light-ui, 22-03-buyer-catalogue-light-ui, 22-04-buyer-catalogue-light-ui, 22-05-buyer-catalogue-light-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scoped CSS-in-template-literal ported under a single root class (.fnbl) to isolate a design system from the rest of the (dark) app shell without a new CSS pipeline"
    - "live-rows-or-fixture fallback: page always renders CatalogBrowserLight, falling back to a representative fixture (SAMPLE_CATALOG_ROWS) when the live query returns zero rows or is missing fields the UI needs"

key-files:
  created: []
  modified: []

key-decisions:
  - "This plan writes no source code — it is a RECORD/verify-only baseline plan; the built artifacts (CatalogBrowserLight.tsx, catalog-sample.ts, catalog page) predate this planning pass and are confirmed unchanged"
  - "Four deferrals recorded explicitly (not silently dropped): real preview audio, logo adoption, Similarity Search/Funūn Playlists tabs, and live-data/inclusion-model wiring (gated on .planning/deliberations/buyer-catalogue-inclusion-model.md)"

patterns-established: []

requirements-completed: [catalogue-browse, audio-player]

coverage:
  - id: D1
    description: "Faithful light Browse Catalogue renders (top nav, tab bar, search, filter pills, results table, tri-state rights badge, License button) — slice 1"
    requirement: "catalogue-browse"
    verification:
      - kind: unit
        ref: "grep 'export function CatalogBrowserLight' components/buyer/CatalogBrowserLight.tsx"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D2
    description: "Working browse: filter dropdowns multi-select, search (title+artist), sort-by, active chips remove/clear-all, live count + 'N filters active', empty state — slice 2a"
    requirement: "catalogue-browse"
    verification:
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Filter/search/sort/chip interaction correctness is a UI behavior claim; no automated UI test suite exists for this component yet — visual/interactive UAT is the appropriate check, not asserted by this record-only plan"
  - id: D3
    description: "Sticky audio player (simulated playhead) + License request modal render and operate over the fixture — slice 2b"
    requirement: "audio-player"
    verification:
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Player transport and modal submit flow are interactive UI behavior; no automated UI test suite exists yet — visual/interactive UAT is the appropriate check"
  - id: D4
    description: "The built slice compiles and type-checks clean under the project's strict tsconfig (noEmit)"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (exit 0)"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-08-04
status: complete
---

# Phase 22 Plan 01: Verify Baseline — Buyer Catalogue Light UI Summary

**Confirmed the already-built faithful light Browse Catalogue (slices 1/2a/2b — CatalogBrowserLight.tsx, catalog-sample.ts, catalog page wiring) is present, wired, and type-clean; recorded the honest scope baseline and four explicit deferrals for downstream planning.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-08-04T07:12:34Z
- **Completed:** 2026-08-04T07:13:58Z
- **Tasks:** 2 completed
- **Files modified:** 0 (record/verify-only plan — no source files touched)

## Accomplishments
- Verified `components/buyer/CatalogBrowserLight.tsx` exports `CatalogBrowserLight` and `CatalogRow`, and renders the tri-state `RightsBadge`, filter dropdowns, sticky mini player, and License request modal.
- Verified `lib/deals/catalog-sample.ts` exports `SAMPLE_CATALOG_ROWS` (8-row representative fixture with real album art paths under `public/buyer-catalogue/`) and `mapCardsToLightRows`.
- Verified `app/(buyer-portal)/buyers/catalog/page.tsx` imports `CatalogBrowserLight`, calls `loadCatalogPage`/`mapCardsToLightRows`, and falls back to `SAMPLE_CATALOG_ROWS` when there are no live rights-ready rows.
- Ran `npx tsc --noEmit` — exits 0, confirming the built slice compiles clean under the project's strict tsconfig.
- Recorded the shipped baseline and the four explicit deferrals (below) so later plans (22-02..22-05) build on an honest, non-silent record.

## Task Commits

This plan modified no source files (verification-only per its own frontmatter `files_modified: []`); no per-task commits were made. The single artifact this plan produces — this SUMMARY.md — is committed as the plan's metadata commit.

1. **Task 1: Verify the built light catalogue + fixture artifacts exist and are wired** — no commit (read-and-assert only; all 5 greps passed)
2. **Task 2: Verify the built slice type-checks + record baseline and deferrals** — no commit (verification + SUMMARY authoring only; `npx tsc --noEmit` exit 0)

**Plan metadata:** committed alongside STATE.md/ROADMAP.md updates (see final commit).

## Files Created/Modified
None — this plan verifies existing artifacts and records the baseline; it does not create or modify source files.

## What Shipped (the recorded baseline)

Built pre-plan on `feat/buyer-catalogue-light`, confirmed present and unchanged by this plan:

- **Slice 1 — faithful light layout:** top nav, tab bar (Browse & Search / Similarity Search / Funūn Playlists / My Playlists / My Favorites), search box + "All" scope dropdown, 8 filter pills (Vocals/Mood/Dynamics/Energy/Length/Instruments/Genres/Rights), results table (cover · versions · genres · dynamics glyph · energy · length · tri-state rights badge · License button), real album art served from `public/buyer-catalogue/`, Inter typeface, Claude Design CSS ported scoped under `.fnbl` so it cannot leak into the dark app shell.
- **Slice 2a — working browse:** filter dropdowns open, multi-select, and narrow results client-side over `rows`; search matches title+artist; Sort-by reorders (Best match / Newest / Most licensed / Shortest first); active filter chips render, remove individually or via "Clear all"; live result count + "N filters active" indicator; empty state with a clear-all CTA when no rows match.
- **Slice 2b — experience:** sticky bottom audio player with a simulated playhead (no real preview audio — the fixture has none), transport controls (play/pause/prev/next/seek), a favorite toggle, and a License request modal (structured form: use type, media, term, territory, exclusivity, offer, message) that shows a demo success toast on submit.
- Renders `SAMPLE_CATALOG_ROWS` (representative fixture, 8 tracks with real cover art) because the live catalog query (`lib/deals/catalog.ts`/`catalog-query.ts`, 16-05) does not yet carry artist name, energy, aggregate length, mood, vocal, instruments, or the tri-state rights signal.

## Recorded Deferrals

Explicitly enumerated so they are not silently lost between planning passes:

1. **Real preview audio** — deferred, missing prerequisite. No preview URLs / storage exist yet; the sticky player uses a simulated (interval-driven) playhead instead of a real `<audio>` element.
2. **Logo adoption** — deferred idea. `FUNUN Logo Exploration.html` presents 5 wordmark options; picking one is a small parallel decision, not blocking this phase.
3. **Similarity Search / Funūn Playlists tabs** — present in the design as tab-bar entries (rendered, clickable) but not built out; only "Browse & Search" is functional.
4. **Live-data wiring + tri-state rights definitions + the inclusion model** — GATED on `.planning/deliberations/buyer-catalogue-inclusion-model.md`. The live query only computes binary rights-ready today; Partial/Contact-required definitions and which Sound Vault songs reach the catalogue are undecided. Wiring live data (slice 1.5) is planned as 22-05 and is currently blocked on that deliberation.

## Decisions Made
- No new decisions — this plan formalizes decisions already recorded in `22-CONTEXT.md` (owner direction, 2026-08-03/04): buyer side is light theme, the built slices are the canonical in-repo design port, and the inclusion model stays deferred/gating.

## Deviations from Plan

None — plan executed exactly as written. All 5 grep assertions in Task 1 passed on the first check; `npx tsc --noEmit` exited 0 on the first run. No auto-fixes were needed because no source code was touched.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The baseline is now formally recorded and verified: 22-02 (slice 2c — wire License Send to `/api/buyer/requests`), 22-03/22-04 (dark toggle, re-theme other buyer surfaces), and 22-05 (live-data wiring, gated) can all build on `CatalogBrowserLight.tsx`/`catalog-sample.ts`/the catalog page with confidence they exist, compile, and are wired.
- 22-05 remains explicitly blocked pending resolution of `.planning/deliberations/buyer-catalogue-inclusion-model.md` — no action taken to unblock it here, per this plan's scope.
- Logo adoption and the Similarity Search/Playlists tabs remain unscheduled deferred ideas — no phase currently owns them; flag for a future roadmap decision if prioritized.

---
*Phase: 22-buyer-catalogue-light-ui*
*Completed: 2026-08-04*
