---
phase: 18-split-sheet-home
plan: 04
subsystem: database
tags: [readiness, split-sheet, coverage, postgres, migration, parity-fixture]

# Dependency graph
requires:
  - phase: 18-split-sheet-home
    provides: "18-03's split_sheet_attachments join table (track_id/vault_project_id) and the SPLIT_SHEET_TIER_MAP from 17-02, both consumed by the coverage derivation's per-track sheet lookup"
provides:
  - "tracksNeedingSheet() — every project track, no solo-written exemption (P18-15), isolated in lib/vault/coverage.ts"
  - "lib/vault/coverage-fixtures.ts — the shared scenario table (parity anchor) driving both the TypeScript derivation test and migration-068's structural proxy test"
  - "lib/vault/readiness-coverage.ts — coverageTier(): MIN across tiers when every needing track is covered, proportional ROUND(AVG(...)) when at least one is entirely uncovered (P18-16)"
  - "readinessItemsForProject() split_sheets branch extended with an optional attachment input, legacy-wins-outright ordering preserved, degrades to prior behavior when omitted"
  - "Migration 068 (LIVE) — calculate_vault_readiness() split-sheet branch redefined to compute the same coverage rule in SQL, every other scoring branch preserved byte-identical to migration 062"
  - "components/vault/SplitSheetCoverage.tsx + readiness breakdown page — surfaces covered-of-needing count and names uncovered songs"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared scenario fixture as the single parity anchor for a rule implemented twice (TypeScript + PL/pgSQL) — neither implementation is the source of truth, the fixture is"
    - "Proportional points (ROUND(AVG) across needing tracks) combined with a strict ALL-covered gate for status, so progress is informative while canSubmit stays strict (P18-16 supersession of the original MIN-for-points instruction)"
    - "Denominator-isolation: tracksNeedingSheet() is a single function reading only the track list, kept isolated specifically so a future policy change is a one-function edit, not a cross-cutting one"

key-files:
  created:
    - lib/vault/coverage.ts
    - lib/vault/coverage.test.ts
    - lib/vault/coverage-fixtures.ts
    - lib/vault/readiness-coverage.ts
    - lib/vault/readiness-coverage.test.ts
    - supabase/migrations/068_split_sheet_coverage_readiness.sql
    - __tests__/migration-068.test.ts
    - components/vault/SplitSheetCoverage.tsx
  modified:
    - lib/vault/readiness.ts
    - __tests__/readiness.test.ts
    - "app/(artist)/vault/[projectId]/readiness/page.tsx"

key-decisions:
  - "P18-15 (settled before this plan executed, carried forward verbatim): every track needs a split sheet including solo-written ones — no acknowledgment escape hatch anywhere. tracksNeedingSheet() reads only the track list, never composer/party counts."
  - "P18-16 (supersedes the plan's original MIN-for-points instruction): earnedPoints are PROPORTIONAL (ROUND(AVG) across needing tracks' tiers), while status is complete ONLY when every track is covered — otherwise warning, or missing at zero coverage. This distinguishes 'nearly done' from 'done nothing', which strict MIN-for-points could not."
  - "Migration 068 mirrors migration 062's own precedent: every unrelated scoring branch preserved byte-identical; the legacy signed-document branch is evaluated first and unaffected by coverage, in both the TS and SQL twins."
  - "__tests__/migration-068.test.ts is a structural proxy (Jest cannot execute PL/pgSQL) asserting the attachment join, tier CASE, MIN/AVG branches, and preserved legacy branch against the same fixture table readiness-coverage.test.ts runs live — the executable half of parity is the human spot-check at the Task 4 checkpoint."
  - "Task 4 checkpoint resolved: developer accepted the user-visible score movement (a project reading complete on one signed sheet now scores proportionally, not 15/15) and applied migration 068 via supabase db push. LOCAL=REMOTE parity confirmed for 001-068 via npx supabase migration list; direct SQL introspection (function-presence check, post-rescore score sampling) was unavailable in the push environment (no psql/pg/psycopg, no CLI arbitrary-SQL command) — recorded as a deferred human-check below, consistent with this project's established migration-verification convention."

requirements-completed: [HOME-12]

coverage:
  - id: D1
    description: "tracksNeedingSheet() returns every project track with no solo-written exemption; a zero-track project returns an empty list; the function consults only the track list"
    requirement: "HOME-12"
    verification:
      - kind: unit
        ref: "lib/vault/coverage.test.ts"
        status: pass
      - kind: other
        ref: "grep gate: ! grep -rn \"solo_written|no_sheet_needed|soloWritten\" lib/ app/ components/ supabase/migrations/"
        status: pass
    human_judgment: false
  - id: D2
    description: "Shared scenario fixture (coverage-fixtures.ts) plus coverageTier() derivation, wired into readinessItemsForProject() with legacy-wins-outright preserved and optional-input degradation for callers that omit attachment data"
    requirement: "HOME-12"
    verification:
      - kind: unit
        ref: "lib/vault/readiness-coverage.test.ts, __tests__/readiness.test.ts (all 17-02 tiering cases pass unmodified)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Migration 068 redefines calculate_vault_readiness()'s split-sheet branch to compute the same coverage rule in SQL over split_sheet_attachments, taking MIN/AVG over the tracks that need a sheet (including uncovered ones), with every other scoring branch and the legacy signed-document branch preserved"
    requirement: "HOME-12"
    verification:
      - kind: unit
        ref: "__tests__/migration-068.test.ts (fixture-driven structural proxy — Jest cannot execute PL/pgSQL)"
        status: pass
      - kind: manual_procedural
        ref: "Deferred human-check 1 below — function-presence + post-rescore score sampling against live data"
        status: unknown
    human_judgment: true
    rationale: "Structural assertion proves the SQL text contains the required elements, not that the live function behaves identically to the fixture against real rows. No SQL client was available in the push environment to run that comparison; deferred to phase verification per established convention."
  - id: D4
    description: "Readiness breakdown page and SplitSheetCoverage.tsx surface the covered-of-needing count and name the specific uncovered songs so a complete-to-warning transition reads as a correction, not a bug"
    requirement: "HOME-12"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit / npm run lint clean; grep checks in Task 3's verify block"
        status: pass
      - kind: manual_procedural
        ref: "Deferred human-check 2 below — readiness parity spot-check on a real multi-track project"
        status: unknown
    human_judgment: true
    rationale: "The plan's own Task 3 human-check (breakdown page rendering against live coverage data) and the Task 4 checkpoint's post-push parity spot-check both require a live browser session against real production data, not exercisable in this non-interactive session."
  - id: D5
    description: "Migration 068 applied to the live remote database via supabase db push; LOCAL=REMOTE migration-list parity confirmed for 001-068"
    verification:
      - kind: manual_procedural
        ref: "npx supabase migration list (run by the developer) — LOCAL=REMOTE for 001-068"
        status: pass
    human_judgment: true
    rationale: "Blocking checkpoint (Task 4) — executor agents never run supabase db push. Direct SQL introspection was unavailable in the push environment, so LOCAL=REMOTE migration-list parity is the recorded primary evidence, consistent with this project's established migration-verification convention (09-01b, 10-02, 15-01, 17-01, 17-09, 18-05, 18-03)."

# Metrics
duration: ~40min (tasks 1-3, prior executor) + checkpoint resolution + final regression gate (this session)
completed: 2026-07-22
status: complete
---

# Phase 18 Plan 04: Coverage-Based Readiness Summary

**Replaced the all-or-nothing split-sheet gate with per-track coverage — proportional points, strict ALL-covered status, one shared fixture driving both the TypeScript derivation and migration 068's SQL twin, live on the remote database.**

## Performance

- **Tasks:** 4 of 4 (3 executor tasks + 1 human-gated checkpoint, now resolved)
- **Files modified:** 11 (8 created, 3 modified)
- **Completed:** 2026-07-22

## Accomplishments

- **`tracksNeedingSheet()`** (`lib/vault/coverage.ts`): returns every project track with no solo-written exemption (P18-15, settled before this plan executed) — reads only the track list, never composer/party counts. A zero-track project returns an empty list (vacuous coverage, no divide-by-zero downstream). Grep gate confirms no `solo_written`/`no_sheet_needed`/`soloWritten` marker exists anywhere in the codebase.
- **`lib/vault/coverage-fixtures.ts`**: the shared scenario table — the parity anchor. Contains the finding-4 regression guard (five tracks, one executed sheet — must NOT score complete/15), full coverage, mixed-tier coverage (minimum-tier rule), zero coverage, the legacy-wins-outright case (signed `split_sheet` document with zero attachments still scores 15), the zero-track degrade case, and the single-composer-still-counts regression guard.
- **`lib/vault/readiness-coverage.ts`**: `coverageTier()` — MIN across tiers when every needing track is covered; proportional `ROUND(AVG(...))` when at least one needing track is entirely uncovered (P18-16, which supersedes the plan's originally drafted MIN-for-points instruction after it was found to score a 5-track EP with 4 executed sheets at 0/15). Reuses `SPLIT_SHEET_TIER_MAP` rather than restating tier numbers. Carries covered/needing counts for the UI. Pure module, no I/O.
- **`lib/vault/readiness.ts`**: split_sheets branch extended with an optional attachment input; the legacy-wins-outright check stays first (load-bearing for wet-sign uploads); every caller that omits the new field keeps its exact prior behavior. All pre-existing 17-02 tiering cases in `__tests__/readiness.test.ts` pass unmodified.
- **Migration 068** (`supabase/migrations/068_split_sheet_coverage_readiness.sql`, now LIVE): redefines `calculate_vault_readiness()`'s split-sheet branch to compute the identical coverage rule in SQL over `split_sheet_attachments` — MIN across tiers when all needing tracks are covered, `ROUND(AVG(...))` otherwise, taken over the tracks that need a sheet (including uncovered ones, not an aggregate over attachments alone, which would silently reproduce the original bug). Every other scoring branch preserved byte-identical to migration 062; the legacy signed-document branch is unaffected. `__tests__/migration-068.test.ts` is a fixture-driven structural proxy (Jest cannot execute PL/pgSQL), asserting the attachment join, tier CASE, MIN/AVG branches, and preserved legacy branch.
- **Coverage surface**: `components/vault/SplitSheetCoverage.tsx` plus the readiness breakdown page (`app/(artist)/vault/[projectId]/readiness/page.tsx`) fetch `split_sheet_attachments` per track and render the covered-of-needing count with the specific uncovered songs named — a complete-to-warning transition reads as the correction it is, not a bug.
- **No acknowledgment write path built anywhere** (P18-15) — no field, route, or UI affordance lets an artist mark a track as needing no split sheet.
- **Task 4 checkpoint resolved**: the developer accepted the user-visible score movement (a project reading complete on a single signed sheet now scores coverage proportionally) and applied migration 068 via `supabase db push`. `npx supabase migration list` shows migration 068 present in BOTH LOCAL and REMOTE columns, with 001-068 all matching (LOCAL=REMOTE).

## Task Commits

1. **Task 1: tracksNeedingSheet() — every track, no exceptions** — `9b876ea`
2. **Task 2: Shared fixture + TS coverage derivation** — `12ff42c`
3. **Task 3: Migration 068, parity test, and coverage surface** — `7ecb43d`
4. **Prep: renumber migration 065→068** — `bff9380` (docs, 065 already consumed by `esign_certificate_path` elsewhere in the phase's migration sequence)
5. **Task 4: Human-gated database push** — resolved by the developer via `supabase db push` (no agent commit; verified via `npx supabase migration list`)

**Plan metadata:** (this commit)

## Files Created/Modified

- `lib/vault/coverage.ts`, `lib/vault/coverage.test.ts` — `tracksNeedingSheet()`, the isolated denominator rule
- `lib/vault/coverage-fixtures.ts` — the shared scenario table (parity anchor)
- `lib/vault/readiness-coverage.ts`, `lib/vault/readiness-coverage.test.ts` — `coverageTier()` derivation
- `lib/vault/readiness.ts`, `__tests__/readiness.test.ts` — split_sheets branch extended, optional attachment input
- `supabase/migrations/068_split_sheet_coverage_readiness.sql`, `__tests__/migration-068.test.ts` — SQL twin + structural proxy test
- `app/(artist)/vault/[projectId]/readiness/page.tsx`, `components/vault/SplitSheetCoverage.tsx` — coverage surface

## Decisions Made

See `key-decisions` in frontmatter above.

## Deviations from Plan

### Auto-fixed Issues

None beyond the pre-authoring migration renumber (065→068), which was necessary scheduling housekeeping rather than a deviation from task behavior — recorded as its own commit (`bff9380`) ahead of Task 1.

**Plan frontmatter gap (not an execution deviation):** the plan's `files_modified` list omitted `lib/vault/coverage.ts` and `lib/vault/coverage.test.ts` (Task 1's actual files, per the plan's own Task 1 `<files>` block) — a drafting gap in the frontmatter, not a deviation from what Task 1 specified or built. Conversely, `app/api/vault/[projectId]/tracks/[trackId]/route.ts` was listed in `files_modified` but required no change — no coverage surface touches the track PATCH route; the readiness breakdown page and `SplitSheetCoverage.tsx` are the only surfaces that needed wiring.

### Checkpoint resolution (not a deviation — Task 4 as specified)

**Task 4 (human-gated database push):** the developer accepted the user-visible score movement and applied migration 068 via `supabase db push`. Verification: `npx supabase migration list` shows migration 068 present in BOTH LOCAL and REMOTE columns, with 001-068 all matching (LOCAL=REMOTE). Direct SQL introspection (function-presence check, post-rescore `vault_readiness_score` sampling — the plan's own `<how-to-verify>` steps 3/5) was unavailable in the push environment — no `psql`/`pg`/`psycopg`, and the Supabase CLI has no arbitrary-SQL command — so LOCAL=REMOTE migration-history parity is the recorded primary evidence, consistent with this project's established convention at every prior migration-push checkpoint (09-01b, 10-02, 15-01, 17-01, 17-09, 18-05, 18-03).

### Deferred human-checks (residual verification, now exercisable against live schema)

Two items could not be exercised without a live SQL client or a live browser session and are deferred to phase verification, now that migration 068 is live:

1. **Migration-068 function-presence + post-rescore score sampling.** The plan's checkpoint `<how-to-verify>` calls for confirming, after the push, that `calculate_vault_readiness()` was actually redefined and that a sampled project's stored `vault_readiness_score` reflects the new coverage rule. This requires a live SQL client against the production database (e.g. the Supabase dashboard SQL editor or a local `psql` session), which was unavailable in this push environment. Needs: `SELECT prosrc FROM pg_proc WHERE proname = 'calculate_vault_readiness'` (or dashboard equivalent) confirming the coverage logic is present, plus a spot-check of one real multi-track project's stored score.
2. **Readiness parity spot-check.** The plan's checkpoint step 5 and the developer resolution both call for picking a real multi-track project and confirming its stored `vault_readiness_score` agrees with what the `/vault/[id]/readiness` breakdown page displays. Disagreement means the SQL and TypeScript derivations have drifted and the shared fixture failed to catch it — the exact outcome this plan's entire structure exists to prevent. This is a browser-session check against live data, not exercisable in this non-interactive session. Recommended before or during phase-level verification: open a real project's readiness breakdown, note the displayed coverage fraction and status, and confirm it matches the project's stored `vault_readiness_score` in the database.

## Issues Encountered

None beyond the two deferred human-checks documented above and the expected absence of direct-SQL introspection tooling at push time (matching 18-03's identical environment constraint).

## Verification

- `npx jest`: **78 suites / 946 tests passing**, all green (up from 18-03's 75/909 — this plan added `lib/vault/coverage.test.ts`, `lib/vault/readiness-coverage.test.ts`, `__tests__/migration-068.test.ts`, and fixture-driven cases in `__tests__/readiness.test.ts`).
- `npx tsc --noEmit`: clean.
- `npm run lint` (`--max-warnings=0`): clean.
- Migration 068: LIVE on the remote database, `npx supabase migration list` (run by the developer) confirms LOCAL=REMOTE for 001-068.
- Manual: migration-068 function-presence + post-rescore score sampling — deferred (see Deferred human-checks above).
- Manual: readiness parity spot-check against a real multi-track project — deferred (see Deferred human-checks above).

## User Setup Required

None — no external service configuration required. The one manual step (the DB push) was the plan's own designed checkpoint and is now complete. The two deferred human-checks above are recommended before or during phase-level verification.

## Next Phase Readiness

- Coverage-based readiness is live end to end: the TypeScript derivation, the SQL trigger, and the surfaced breakdown all agree on the same rule, anchored to one shared fixture.
- REQUIREMENTS.md: HOME-12 flips to **Complete** — this plan is its sole owner (per REQUIREMENTS.md's Phase 18 traceability table) and it is fully implemented and live, following the same convention 18-03 used for HOME-09/10/11 (a plan's own human-check being deferred to phase verification does not block marking the owned requirement complete).
- With 18-04 done, Wave 3's checkpoint-gated plan is closed. Only **18-01** (the living draft) remains unexecuted in Phase 18 — 18-02, 18-03, 18-05 are already complete.

---
*Phase: 18-split-sheet-home*
*Completed: 2026-07-22*

## Self-Check: PASSED

All 8 created files confirmed present on disk (`lib/vault/coverage.ts`, `lib/vault/coverage.test.ts`, `lib/vault/coverage-fixtures.ts`, `lib/vault/readiness-coverage.ts`, `lib/vault/readiness-coverage.test.ts`, `supabase/migrations/068_split_sheet_coverage_readiness.sql`, `__tests__/migration-068.test.ts`, `components/vault/SplitSheetCoverage.tsx`); all 4 commits (`9b876ea`, `12ff42c`, `7ecb43d`, `bff9380`) confirmed in git log. Full suite 78/78 suites, 946/946 tests green; `npx tsc --noEmit` and `npm run lint` clean. Migration 068 confirmed LOCAL=REMOTE via `npx supabase migration list` (developer-run, per checkpoint resolution above).
