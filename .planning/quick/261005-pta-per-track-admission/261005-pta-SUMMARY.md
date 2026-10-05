---
phase: 261005-pta
plan: 01
subsystem: api
tags: [supabase, jest, sync-library, licensing, rights]

requires: []
provides:
  - "loadCatalogPage's CatalogCard.tracks scoped to per-track admission (lib/deals/catalog-query.ts)"
  - "authorizeRequestTarget's returned project.tracks scoped to per-track admission (lib/deals/request-target.ts)"
  - "Shared, accurate rejection message across both license-request creation routes"
affects: [sync-library, buyer-catalog, license-requests, admin-deals]

tech-stack:
  added: []
  patterns:
    - "Per-track admission resolved via a fresh sync_listings track_id query at each call site, feeding the single isAdmittedToSyncLibrary authority — no second admission predicate (mirrors PR #148's addSelectsTrack pattern, replicated rather than imported since it is private and single-track-scoped)."

key-files:
  created:
    - .planning/todos/pending/261005-pta-production-admission-audit.md
    - .planning/todos/pending/261005-pta-readiness-aggregation-project-level-followup.md
  modified:
    - lib/deals/catalog-query.ts
    - lib/deals/catalog-query.test.ts
    - lib/deals/request-target.ts
    - lib/deals/request-target.test.ts
    - app/api/buyer/requests/route.ts
    - app/api/admin/deals/route.ts

key-decisions:
  - "Reused isAdmittedToSyncLibrary as the single admission authority at both new call sites — no third admission definition introduced."
  - "computeStage3's input (full project.tracks) left untouched in request-target.ts — it answers the artist's distribution-readiness question, not the buyer's per-track admission question; only the final returned project.tracks is filtered."
  - "Test fixtures for the new C-01 track-2 cases reuse ENTRY_COMPLETE_TRACKS[0]'s metadata shape (composers present) rather than null metadata, to isolate per-track ADMISSION from the separate, deliberately-deferred readiness-aggregation gap (lib/vault/readiness.ts's metadata item requires composers on every fetched track)."
  - "Rebased the fix branch onto origin/main after three pass-5/6/7 review docs commits landed upstream mid-session; the now-redundant plan-copy commit was dropped automatically as already-upstream."

requirements-completed: [QUICK-261005-PTA]

coverage:
  - id: D1
    description: "A mixed-admission project (one admitted track, one never-reviewed sibling) stays visible in the buyer catalogue but lists only the admitted track in card.tracks — inherited with no code changes by CatalogBrowser.tsx, the staff Selects-catalog search, and the public Suggested Songs widget."
    requirement: "QUICK-261005-PTA"
    verification:
      - kind: unit
        ref: "lib/deals/catalog-query.test.ts#loadCatalogPage — C-01: card.tracks excludes an unadmitted sibling > keeps a mixed-admission project visible but lists only its admitted track"
        status: pass
      - kind: unit
        ref: "lib/deals/catalog-query.test.ts#loadCatalogPage — C-01: card.tracks excludes an unadmitted sibling > still lists every track when every track in the project is admitted (no regression)"
        status: pass
    human_judgment: false
  - id: D2
    description: "authorizeRequestTarget returns ok:true for a mixed-admission project but excludes the unadmitted sibling from project.tracks — the shared authority POST /api/buyer/requests and POST /api/admin/deals both consume verbatim, so neither route can build a license request naming the unadmitted track."
    requirement: "QUICK-261005-PTA"
    verification:
      - kind: unit
        ref: "lib/deals/request-target.test.ts#authorizeRequestTarget — C-01: project.tracks excludes an unadmitted sibling > stays ok:true for a mixed-admission project but returns only the admitted track"
        status: pass
    human_judgment: false
  - id: D3
    description: "Both routes' rejection message updated from the now-inaccurate 'do not belong to this project' to 'are not available for license requests on this project'."
    requirement: "QUICK-261005-PTA"
    verification:
      - kind: other
        ref: "grep -rln \"do not belong to this project\" (zero matches after fix)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Full Verification Gate green (security:migrations:verify, typecheck:strict, lint --max-warnings=0, test --runInBand, npm audit, audit:gate); no migration created; npm run build not run."
    verification:
      - kind: other
        ref: "see Full Verification Gate Results section below"
        status: pass
    human_judgment: false
  - id: D5
    description: "Two owner todos filed: production-row audit (runnable SQL, no DB access from this session) and the readiness-aggregation followup, both explicitly out of this plan's scope."
    verification:
      - kind: other
        ref: ".planning/todos/pending/261005-pta-production-admission-audit.md, .planning/todos/pending/261005-pta-readiness-aggregation-project-level-followup.md"
        status: pass
    human_judgment: true
    rationale: "Owner must actually run the two SQL queries against production and confirm the expected zero-row result — automation cannot reach production from this session."

duration: ~50min
completed: 2026-10-05
status: complete
---

# Quick Task 261005-pta: Close per-track sync admission gap (C-01) Summary

**A buyer could create a licence request for a never-reviewed track riding along on an admitted sibling's coattails — both the catalogue card and the request-authorization function collapsed per-track `sync_listings` admission to a project-level boolean; both now resolve and filter per track.**

## Performance

- **Duration:** ~50 min (worktree setup + baseline gate + 3 tasks + full gate + rebase + push)
- **Tasks:** 3/3 completed
- **Files modified:** 6 code/test files + 2 new todo files

## Accomplishments

- `lib/deals/catalog-query.ts`'s `loadCatalogPage` now builds `card.tracks` from the already-computed `admittedTracks` set instead of every project track — fixes buyer catalogue, staff Selects search, and the public Suggested Songs widget in one change, no code changes to any of the three.
- `lib/deals/request-target.ts`'s `authorizeRequestTarget` now resolves every admitted row's `track_id` (not just an existence check) and filters the returned `project.tracks` to that set — fixes `POST /api/buyer/requests`, the byte-identical gap in `POST /api/admin/deals` (staff manual intake, discovered during this fix), and the request composer's track-selection chips, all with no further code change.
- Both routes' rejection error message corrected from "do not belong to this project" (no longer accurate for the newly-caught case) to "are not available for license requests on this project."
- Two RED-then-GREEN tests prove the exact mixed-admission scenario: a project with one admitted track and one never-reviewed sibling stays visible/requestable, but the sibling is excluded from both `card.tracks` and `project.tracks`.
- Two owner todos filed: a production-impact audit (two runnable, read-only SQL queries — this session had no DB access) and the readiness-aggregation project-level followup (verified real, deliberately deferred since fixing it means touching the admission gate's own inputs).

## Task Commits

Each task was committed atomically (hashes below are post-rebase, since origin/main advanced mid-session and the branch was rebased before push — see Deviations):

1. **Task 1: Scope CatalogCard.tracks to admitted tracks only** - `5fd66686` (fix)
2. **Task 2: Scope authorizeRequestTarget's returned tracks to admitted tracks only** - `264e2a42` (fix)
3. **Task 3: Full Verification Gate, production-audit todo, readiness-aggregation followup todo** - `125a9cfd` (docs)

**Plan metadata:** carried in via a separate commit at session start; dropped by the rebase as already-upstream (see Deviations) — the plan file lives on `origin/main` at an earlier commit with byte-identical content.

## Files Created/Modified

- `lib/deals/catalog-query.ts` - `card.tracks` built from `admittedTracks` instead of the full `tracks` array; comment documents the four downstream consumers that inherit the fix.
- `lib/deals/catalog-query.test.ts` - New `describe('loadCatalogPage — C-01: card.tracks excludes an unadmitted sibling')` block: mixed-admission test + no-regression (all-admitted) test.
- `lib/deals/request-target.ts` - Admission existence check replaced with a batched `track_id` query building `admittedTrackIds`; returned `project.tracks` filtered to that set; `computeStage3`'s input left untouched.
- `lib/deals/request-target.test.ts` - New `arrayTableBuilder` helper (the `sync_listings` query no longer terminates on `.limit(1).maybeSingle()`); `makeService`'s `admittedListing` option replaced with `admittedTracks`; new C-01 mixed-track test.
- `app/api/buyer/requests/route.ts` - Rejection message corrected.
- `app/api/admin/deals/route.ts` - Byte-identical rejection message corrected.
- `.planning/todos/pending/261005-pta-production-admission-audit.md` - Two read-only SQL queries for the owner (production access unreachable from this session).
- `.planning/todos/pending/261005-pta-readiness-aggregation-project-level-followup.md` - Followup todo for the deliberately-deferred project-level readiness-aggregation gap.

## Decisions Made

- Reused `isAdmittedToSyncLibrary` as the single admission authority at both new call sites — no third admission definition introduced, matching the plan's explicit constraint.
- `computeStage3` in `request-target.ts` keeps receiving the full `project.tracks` — it answers the artist's own distribution-readiness question, unrelated to which track a buyer may request; only the final returned `project.tracks` narrows.
- New test fixtures for `track-2` reuse `ENTRY_COMPLETE_TRACKS[0]`'s composer metadata (not null) — isolates the per-track ADMISSION claim this plan tests from the separate, deliberately out-of-scope readiness-aggregation gap (the six-item entry gate's `metadata` item requires composers on *every* fetched project track; a null-metadata `track-2` would have failed the entry gate for the wrong reason and produced a RED test with the wrong failure mode, which was caught and corrected during this session — see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test fixture produced the wrong RED failure mode**
- **Found during:** Task 1, writing the RED test
- **Issue:** Following the plan's literal action text (track-2 with `metadata: null` and other null/false defaults), the first RED run failed with the project excluded entirely (`result.data` length 0) rather than the intended failure (project visible, but `card.tracks` wrongly includes track-2). Root cause: `lib/vault/readiness.ts`'s six-item entry gate requires composers on *every* fetched project track (the `metadata` item, lines ~338-345) — a separate, project-level aggregation gap this plan explicitly defers (Task 3's readiness-aggregation followup todo). A null-metadata track-2 tripped that unrelated gate before the per-track-admission code path could even be exercised.
- **Fix:** Gave `track-2` the same composer metadata as `ENTRY_COMPLETE_TRACKS[0]` (split totals 100%) so the entry gate passes for both tracks, isolating the one variable this test is meant to prove — per-track admission — from the unrelated, deferred aggregation gap.
- **Files modified:** `lib/deals/catalog-query.test.ts`
- **Verification:** Re-ran the RED test; it now failed with the correct failure mode (project visible, `tracks` wrongly includes `track-2`), then passed after the real fix.
- **Committed in:** `5fd66686` (part of Task 1's commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — test-fixture bug caught before the fix was even written, not a code defect in the shipped fix). No scope creep.

**2. [Process] Branch rebased onto origin/main mid-session**
- **Found during:** Final verification, before push
- **Issue:** `origin/main` advanced by three commits during this session (pass-5/6/7 rights/identity/schema review docs, plus the per-track-admission PLAN.md itself landing upstream via a parallel path with byte-identical content to the copy this session committed at start). A raw diff against `origin/main` before rebasing showed three deliberation files as spurious deletions — not caused by this session's edits, but by the branch's base commit (`9ee50c8d`) being stale relative to the now-advanced `origin/main`.
- **Fix:** Ran `git rebase origin/main`. Git automatically dropped this session's redundant plan-copy commit as "patch contents already upstream" (byte-identical file, confirmed via diff before rebasing). The three code/test/docs-todo commits replayed cleanly with no conflicts.
- **Verification:** Post-rebase `git diff --stat origin/main..HEAD` shows exactly the plan's 8 `files_modified` entries with no unrelated deletions; full six-command Verification Gate re-run and confirmed green after the rebase.
- **Committed in:** n/a (rebase, not a new commit) — resulting commit hashes: `5fd66686`, `264e2a42`, `125a9cfd`.

## Issues Encountered

None beyond the two deviations above, both caught and resolved before the fix was considered done.

## User Setup Required

None - no external service configuration required. Two action items are filed as owner todos (not setup): running the two read-only production-audit SQL queries (`.planning/todos/pending/261005-pta-production-admission-audit.md`) and scoping the readiness-aggregation followup (`.planning/todos/pending/261005-pta-readiness-aggregation-project-level-followup.md`).

## Next Phase Readiness

Branch `fix-per-track-admission-gate` is pushed to `origin` with three commits, rebased cleanly onto current `origin/main`, full Verification Gate green. No PR opened — per task instructions, the orchestrator opens it. Worktree remains at `.claude/worktrees/fix-per-track-admission-gate/` for inspection.

---
*Phase: 261005-pta*
*Completed: 2026-10-05*
