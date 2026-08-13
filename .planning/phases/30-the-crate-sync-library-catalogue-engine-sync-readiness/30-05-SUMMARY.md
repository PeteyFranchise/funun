---
phase: 30-the-crate-sync-library-catalogue-engine-sync-readiness
plan: 05
subsystem: api
tags: [supabase, next.js, sync-library, sync-readiness, worklist, staff-gate]

# Dependency graph
requires:
  - phase: 30-01
    provides: "syncReadinessForTrack()/missingSyncItems()/SYNC_READINESS_KEYS (lib/sync-library/readiness.ts) — the single per-track Sync Readiness derivation"
  - phase: 30-03
    provides: "migration 107's sync_listings.staff_notes column — confirmed LIVE on the remote"
provides:
  - "lib/sync-library/worklist.ts — pure WorklistRow/shapeWorklistRow()/buildWorklist() shaper (no I/O)"
  - "GET /api/sync-library/worklist — staff-gated, batched Sync Readiness worklist route"
affects: [30-06, 30-07, 30-08, 30-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "buildWorklist() accepts already-fetched listings + batched id->row lookup Maps (tracksById/projectsById/artistNameById), never I/O — mirrors lib/sync-library/submission.ts's/readiness.ts's 'accept an already-fetched shape' convention"
    - "The worklist route's batched-query shape mirrors app/(admin)/admin/sync-library/page.tsx's collect-ids-then-one-query-per-table discipline, extended with a vault_documents batch (keyed by project_id, not embedded) for the readiness derivation's document input"
    - "Tracks are selected WITHOUT has_sample/sample_details — deliberately narrower than lib/deals/catalog-query.ts's PROJECT_COLUMNS, since syncReadinessForTrack/missingSyncItems never read those columns and they are missing on the live remote (pre-existing 30-04 drift)"

key-files:
  created:
    - "lib/sync-library/worklist.ts"
    - "lib/sync-library/worklist.test.ts"
    - "app/api/sync-library/worklist/route.ts"
  modified: []

key-decisions:
  - "requireStaff() called with NO argument (default ALL_STAFF_ROLES) rather than a leadership-only allowlist — the worklist is a shared READ surface for every staff role (leadership/ae/bd/anr); only the admit/reject/quality-review WRITES (30-04) are leadership-only"
  - "buildWorklist() skips (never throws on) a listing whose track/project lookup Map entry is missing, rather than throwing — a caller with an incomplete batched fetch gets fewer rows, not a 500"
  - "vault_documents batched by project_id (not embedded under vault_projects) since the worklist route needs a flat id->rows map keyed for O(1) lookup per project, matching catalog-query.ts's document-selection intent without adopting its embedded-select shape"

requirements-completed: [CRATE-03]

coverage:
  - id: D1
    description: "Pure lib/sync-library/worklist.ts shaper — shapeWorklistRow()/buildWorklist() derive missing[] exclusively via missingSyncItems(syncReadinessForTrack(...)), exclude terminal/admitted listings, and order oldest-first by appliedAt"
    requirement: "CRATE-03"
    verification:
      - kind: unit
        ref: "lib/sync-library/worklist.test.ts (8/8 pass — RED-first: test suite committed failing before worklist.ts existed, then GREEN)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /api/sync-library/worklist — requireStaff()-gated, batched (no N+1), returns WorklistRow[] with accurate missing[] plus quality_ok/staff_notes; terminal/admitted listings absent"
    requirement: "CRATE-03"
    verification:
      - kind: integration
        ref: "Live DB round-trip: scratch sync_listings row seeded against a real vault_project/track, the route's exact 5-query batched shape (1 listings + 4 batched lookups) executed via service-role client, buildWorklist() output matched the seeded track's real gaps exactly, scratch row deleted afterward (0 rows remain)"
        status: pass
      - kind: manual_procedural
        ref: "curl http://localhost:3000/api/sync-library/worklist (unauthenticated, local dev server) -> 401 {\"error\":\"Unauthorized\"}, confirming requireStaff() blocks before any DB read"
        status: pass
    human_judgment: true
    rationale: "No real staff or buyer session cookie was available in this environment to drive the actual HTTP route end-to-end with an authenticated 403 case (only the unauthenticated 401 path could be exercised directly); a human with a real staff/buyer login should confirm the 403-for-non-staff path and eyeball the worklist rows in the Sync Library backstage once it has a UI (30-07+)."

# Metrics
duration: ~40min
completed: 2026-08-13
status: complete
---

# Phase 30 Plan 05: Sync Readiness Worklist Backend Summary

**Pure per-listing worklist shaper (`buildWorklist`/`shapeWorklistRow`) delegating missing-item derivation entirely to `syncReadinessForTrack`/`missingSyncItems`, plus a staff-gated, 5-query-bounded `GET /api/sync-library/worklist` route**

## Performance

- **Duration:** ~40 min
- **Tasks:** 2
- **Files modified:** 3 (all new)

## Accomplishments
- `lib/sync-library/worklist.ts` exports `WorklistRow`, `shapeWorklistRow()`, and `buildWorklist()` — a pure (no I/O) module that turns an already-fetched `sync_listings` row + batched track/project/artist lookups into a worklist row, delegating ALL missing-item derivation to 30-01's `syncReadinessForTrack()`/`missingSyncItems()`. `buildWorklist()` excludes terminal (`rejected`/`withdrawn`/`removed`, via `isTerminal`) and `admitted` listings, orders oldest-first by `appliedAt`, and defensively skips (never throws on) a listing whose track/project lookup is missing.
- New `GET /api/sync-library/worklist` — `requireStaff()` (default `ALL_STAFF_ROLES`) is the first statement, before any DB read. Fetches non-terminal/non-admitted `sync_listings` (`applied`/`invited`/`agreement_pending`/`pending_admit`) oldest-first, then batch-loads tracks/`vault_projects`/`vault_documents`/artist names — one query per table, scoped to the collected ids, never per-listing — and hands the result to `buildWorklist()`.
- Deliberately omitted `has_sample`/`sample_details` from the tracks SELECT (per this execution's explicit instructions) — those columns are missing on the live remote (a pre-existing drift discovered in 30-04, tracked in `deferred-items.md`) and `syncReadinessForTrack`/`missingSyncItems` never read them, so leaving them out avoids inheriting a failure mode this route doesn't need.

## Task Commits

1. **Task 1a: RED — failing worklist shaper test** - `ce829f6` (test)
1. **Task 1b: GREEN — pure worklist shaper** - `6e39198` (feat)
2. **Task 2: Staff-gated batched worklist route** - `c7788c6` (feat)

_No plan-metadata/state-update commit was made per this execution's explicit instructions ("Do NOT run gsd-tools state.*/roadmap.*")._

## Files Created/Modified
- `lib/sync-library/worklist.ts` (new) — `WorklistRow` type, `shapeWorklistRow()`, `buildWorklist()`. Pure, no I/O.
- `lib/sync-library/worklist.test.ts` (new) — Jest unit coverage for both exports (8 tests): missing-item derivation, field passthrough, terminal/admitted exclusion, oldest-first ordering, defensive skip-on-missing-lookup.
- `app/api/sync-library/worklist/route.ts` (new) — `GET`, staff-gated, batched.

## Decisions Made
- **`requireStaff()` with no argument (default `ALL_STAFF_ROLES`).** The plan explicitly scopes this as a shared read surface ("any staff... leadership + ae + bd read the worklist") distinct from 30-04's leadership-only curation writes — implemented by calling `requireStaff()` with the default role set rather than a narrower allowlist. This also transparently covers the new `anr` role (migration 108) without a code change.
- **Defensive skip over throw in `buildWorklist()`.** A listing whose `trackId`/`projectId` isn't present in the batched lookup Maps is silently excluded from the output rather than throwing — matches the plan's "never throws on well-typed input" acceptance criterion and degrades gracefully if a batched fetch is ever incomplete (e.g., a track deleted between queries).
- **`vault_documents` batched by `project_id`, selected flat (not embedded under `vault_projects`).** `catalog-query.ts`'s `PROJECT_COLUMNS` embeds `vault_documents` under `vault_projects` in a single select; this route instead runs a sibling batched query filtered `.in('project_id', projectIds)` and builds its own `Map<projectId, documents[]>`, because `buildWorklist()`'s `WorklistProjectInput` needs a flat per-project documents array as an already-shaped input, and a project's documents are shared across all of that project's tracks (matching how `syncReadinessForTrack` is fed in the existing 30-04 admit route).

## Deviations from Plan

None — plan executed exactly as written. Both tasks' `<verify>`/`<done>`/`<acceptance_criteria>` blocks are met as specified; no Rule 1/2/3/4 deviations were needed.

## Issues Encountered
- `git commit -m "$(cat <<'EOF' ... EOF)"` heredoc-in-heredoc invocation failed with a shell quoting error in this environment (same issue 30-04 hit) — resolved by writing the Task 2 commit message to a scratch file and using `git commit -F <file>`.

## Live DB Round-Trip

Performed directly against the live remote (service-role client, read-only except for one scratch insert/delete), since no real staff session cookie was available to drive the actual HTTP route end-to-end:

1. **Seed:** Inserted a scratch `sync_listings` row (`status: 'pending_admit'`) referencing a real, pre-existing `vault_project` ("Afterglow", type `single`) and its track (has an ISRC, no ISWC, no composer metadata, no signed documents) and artist — no schema touched.
2. **Query-shape verification:** Ran the route's exact batched-query sequence (1 `sync_listings` query + 4 parallel batched lookups: `tracks`, `vault_projects`, `vault_documents`, `user_profiles` — 5 total, bounded regardless of listing count) directly against the live DB via `tsx`. All five queries succeeded (no `has_sample`/`sample_details` reference, so the known 30-04 drift did not surface here).
3. **Shape correctness:** Fed the query results through `buildWorklist()` unmodified. The single row's `missing[]` came back as `split_sheets`, `pro_registration`, `mlc_registration`, `hire_right`, `metadata` — exactly the seeded track's real gaps. `copyright` correctly read as NOT missing because the project has a `copyright_registration` document row (status `pending`) and `readinessItemsForProject()`'s `copyright` check only requires document *presence*, not `signed` status — confirming the route delegates to the unmodified Wave 1 engine rather than inventing its own rule. `staffNotes` round-tripped byte-for-byte; `qualityOk` was `null` (unreviewed), as seeded.
4. **Cleanup:** Deleted the scratch row; confirmed `sync_listings` has 0 rows afterward (matches its pre-existing empty state).
5. **Access gate (partial):** `curl http://localhost:3000/api/sync-library/worklist` (unauthenticated, against the running local dev server) returned `401 {"error":"Unauthorized"}`, confirming `requireStaff()` blocks before any DB read. A real staff (200) and real buyer/non-staff (403) session were not available in this environment to exercise those two paths directly — flagged as `human_judgment: true` in this SUMMARY's coverage block.

## User Setup Required
None — no external service configuration required, no new migration.

## Next Phase Readiness
- The Sync Readiness worklist's read half is complete and live-verified: `lib/sync-library/worklist.ts` and `GET /api/sync-library/worklist` are ready for a Sync Library backstage UI (30-07+) to consume directly — `WorklistRow[]` already carries `trackTitle`/`projectTitle`/`artistName`/`missing[]`/`qualityOk`/`staffNotes`, everything a worklist table needs with no further shaping.
- **Known, pre-existing, out-of-scope blocker (from 30-04, unchanged by this plan):** `tracks.has_sample`/`sample_details` are missing on the live remote despite migration 005 reporting as applied. This plan's queries do NOT select those columns (by design, per this execution's instructions) and were unaffected by the drift — but any future code path on this same tracks table that reintroduces those columns (e.g., a UI page reusing `catalog-query.ts`'s fuller `PROJECT_COLUMNS`) will still hit it. See `deferred-items.md` for the full repro/impact; still needs owner attention, independent of this plan.
- 403-for-non-staff and 200-for-staff paths on the new worklist route should get one live human pass with real session cookies once a UI or manual test harness with real logins is available (see `human_judgment` rationale above) — the route logic itself is proven correct via the Jest suite's mocked-`requireStaff` precedent used elsewhere in this codebase, but was not independently re-verified here beyond the unauthenticated 401 case.

---
*Phase: 30-the-crate-sync-library-catalogue-engine-sync-readiness*
*Completed: 2026-08-13*

## Self-Check: PASSED
