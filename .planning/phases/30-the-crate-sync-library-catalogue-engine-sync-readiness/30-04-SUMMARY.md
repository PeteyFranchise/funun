---
phase: 30-the-crate-sync-library-catalogue-engine-sync-readiness
plan: 04
subsystem: api
tags: [supabase, next.js, sync-library, access-control, inclusion-gate, staff-audit]

# Dependency graph
requires:
  - phase: 30-01
    provides: "evaluateInclusionGate()/GateSignal (lib/sync-library/gate.ts), syncReadinessForTrack()/isSyncMetadataComplete() (lib/sync-library/readiness.ts)"
  - phase: 30-03
    provides: "migration 107's sync_listings quality-review columns (quality_ok/quality_note/quality_reviewed_by/quality_reviewed_at/staff_notes), migration 108's 'anr' staff role — both confirmed LIVE on the remote"
provides:
  - "Leadership-only admit/reject on POST /api/sync-library/admin/[listingId] (AE tightened out, matches the locked access decision)"
  - "The inclusion gate wired into the real admit path — a gate-failing track returns 409 and stays non-terminal, never auto-rejected"
  - "New leadership-only POST /api/sync-library/admin/[listingId]/quality route persisting the manual quality verdict + staff guidance notes"
affects: [30-05, 30-06, 30-07, 30-08, 30-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate-input DB fetch mirrors lib/deals/catalog-query.ts's PROJECT_COLUMNS shape (batched, single query) rather than a second parallel query module"
    - "Gate signals (rightsClear/qualityOk/metadataComplete) recomputed server-side from a fresh DB read on every admit attempt — never trusted from the request body or cached"

key-files:
  created:
    - "app/api/sync-library/admin/[listingId]/quality/route.ts"
  modified:
    - "app/api/sync-library/admin/[listingId]/route.ts"
    - "app/api/sync-library/admin/[listingId]/route.test.ts"

key-decisions:
  - "requireStaff(['leadership']) is now the FIRST statement for the ENTIRE admit/reject route (not just admit) — an AE receives 403 on both actions, closing the Phase 26 access-model mismatch flagged in 30-RESEARCH.md Pitfall 1"
  - "Gate-input query selects has_sample/sample_details on tracks (mirroring catalog-query.ts's PROJECT_COLUMNS exactly, per the plan's explicit instruction) even though these columns were discovered missing on the live remote — the code is correct per the documented schema; the drift is a pre-existing, out-of-scope production issue (see Deviations)"
  - "A gate-failing 409 does NOT call logStaffAction — consistent with the route's other pre-write 409s (isValidTransition failure), since no state actually changed"

requirements-completed: [CRATE-04, CRATE-05, CRATE-09]

coverage:
  - id: D1
    description: "Admit/reject route tightened to requireStaff(['leadership']) as the first statement; AE receives 403 on both actions"
    requirement: "CRATE-04"
    verification:
      - kind: unit
        ref: "app/api/sync-library/admin/[listingId]/route.test.ts#returns 403 for staff outside leadership (30-04: AE no longer admits/rejects) / returns 403 for staff outside leadership on reject too"
        status: pass
    human_judgment: false
  - id: D2
    description: "Admit composes evaluateInclusionGate() over server-computed rightsClear/qualityOk/metadataComplete; a needs_completion verdict returns 409 and leaves the listing non-terminal, never auto-rejected"
    requirement: "CRATE-05"
    verification:
      - kind: unit
        ref: "app/api/sync-library/admin/[listingId]/route.test.ts#returns 409 admitting a gate-failing (incomplete metadata) listing and does NOT reject or write / returns 409 admitting a listing whose staff quality review has not passed"
        status: pass
      - kind: unit
        ref: "lib/sync-library/gate.test.ts, lib/sync-library/readiness.test.ts (30-01, consumed unchanged)"
        status: pass
    human_judgment: true
    rationale: "The gate's DB-query shape (PROJECT_GATE_COLUMNS, mirroring catalog-query.ts) could not be fully round-trip-verified against the live remote — a pre-existing, unrelated schema drift (tracks.has_sample/sample_details missing on the live DB, see deferred-items.md) causes the gate's project fetch to 500 in production today. Jest coverage proves the gate logic is correct against a well-formed DB response; a human must confirm after the schema drift is fixed that the live query itself succeeds."
  - id: D3
    description: "New leadership-only POST /api/sync-library/admin/[listingId]/quality route writes quality_ok/quality_note/staff_notes (+ quality_reviewed_by/at) via a fixed allowlist, audited unconditionally"
    requirement: "CRATE-09"
    verification:
      - kind: integration
        ref: "Live DB round-trip: scratch sync_listings row inserted, updated with the route's exact allowlisted write shape via the service-role client, read back, then deleted — see 'Live DB Round-Trip' below"
        status: pass
    human_judgment: false

# Metrics
duration: ~55min
completed: 2026-08-13
status: complete
---

# Phase 30 Plan 04: Inclusion Gate Wired Into Admission + Access Fix Summary

**Admit/reject tightened to leadership-only and gate-guarded (409/needs_completion, never auto-reject); new leadership-only quality-review route persisting sync_listings' manual quality verdict + staff notes**

## Performance

- **Duration:** ~55 min
- **Tasks:** 2
- **Files modified:** 3 (1 new, 2 modified)

## Accomplishments
- `POST /api/sync-library/admin/[listingId]` is now `requireStaff(['leadership'])` for its ENTIRE body (admit AND reject) — AE gets 403 on both, closing the gap between the shipped Phase 26 code and the locked 30-CONTEXT.md access decision.
- Admit is additionally gated on `evaluateInclusionGate()` — a fresh, DB-loaded project/track fetch (mirroring `lib/deals/catalog-query.ts`'s `PROJECT_COLUMNS` shape) feeds `rightsClear` (`computeStage3().canContinue`), `qualityOk` (`sync_listings.quality_ok === true`), and `metadataComplete` (`isSyncMetadataComplete(syncReadinessForTrack(...))`). A `needs_completion` verdict returns 409 and leaves the listing's status untouched — never auto-rejected, per "Incomplete ≠ rejected."
- `logStaffAction`'s admit-path `changes` now records the gate verdict that cleared (or would have blocked) the admit.
- New `POST /api/sync-library/admin/[listingId]/quality` route: leadership-only, writes only `quality_ok`/`quality_note`/`staff_notes` (+ auto-stamped `quality_reviewed_by`/`quality_reviewed_at` when `quality_ok` is provided) via a fixed allowlist — never a body spread. Rejects unknown/mistyped fields with 400. Audited unconditionally via `logStaffAction`.

## Task Commits

1. **Task 1: Tighten admit/reject to leadership-only + compose the inclusion gate before admit** - `57fafa1` (feat)
2. **Task 2: Leadership-only quality-review + staff-notes write route** - `875855e` (feat)

**Deviation record:** `17adb3b` (docs: logged the pre-existing schema drift discovered during round-trip verification)

_No plan-metadata/state-update commit was made per this execution's explicit instructions ("Do NOT run gsd-tools state.*/roadmap.*")._ 

## Files Created/Modified
- `app/api/sync-library/admin/[listingId]/route.ts` — leadership-only gate; gate-composing admit branch (`PROJECT_GATE_COLUMNS` fetch, `computeStage3`, `syncReadinessForTrack`/`isSyncMetadataComplete`, `evaluateInclusionGate`); extended audit `changes`.
- `app/api/sync-library/admin/[listingId]/route.test.ts` — updated to match the new access model and gate precondition (see Deviations).
- `app/api/sync-library/admin/[listingId]/quality/route.ts` (new) — leadership-only quality/notes write route.

## Decisions Made
- **Whole-route leadership tightening, not just admit.** The plan's `must_haves.truths` states "admit/reject is LEADERSHIP-ONLY" — implemented by moving the single `requireStaff(['leadership'])` call before decision branching, so both admit and reject are covered by one first-statement gate (matches the `remove` route's existing leadership-only precedent exactly).
- **Gate-input query mirrors `catalog-query.ts`'s `PROJECT_COLUMNS` exactly** (plus `isrc`/`iswc` which `syncReadinessForTrack` additionally needs) rather than inventing a narrower or defensive subset — this keeps the "one definition of rights/readiness" discipline 30-RESEARCH.md calls out, at the cost of inheriting a pre-existing schema-drift risk (see Deviations).
- **No `logStaffAction` on a gate-failing 409** — consistent with how the route already handles the `isValidTransition` 409 (no state changed, no audit entry), and explicitly required by the plan's acceptance criteria (only writes are logged).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated `route.test.ts` to match the tightened access model + new gate precondition**
- **Found during:** Task 1 — running the full suite after the route change.
- **Issue:** The existing `route.test.ts` (pre-Phase-30) asserted `requireStaff(['leadership','ae'])` behavior implicitly (one test simulated an `'ae'`-role reject succeeding) and the two admit-success tests didn't account for the new `vault_projects` gate-input query, so they would fail against the tightened route.
- **Fix:** Added a `vault_projects` fixture (`READY_PROJECT_ROW`/`INCOMPLETE_PROJECT_ROW`) to the mock sequence for every admit test; updated the AE-simulated reject test to use a leadership mock (the route no longer distinguishes decision before the auth gate); added two new tests covering the gate-failing 409 paths (incomplete metadata, unreviewed quality); renamed the two 403 tests to cover both admit and reject explicitly.
- **Files modified:** `app/api/sync-library/admin/[listingId]/route.test.ts` (not in `files_modified` — this plan's frontmatter scopes only the two production route files; the test file was updated as a direct, necessary consequence of Task 1's route.ts change, per the executor's Rule 1 — leaving it broken would silently regress an existing, passing test suite).
- **Verification:** `npx jest "app/api/sync-library/admin/\[listingId\]/route.test.ts"` — 13/13 pass.
- **Committed in:** `57fafa1` (Task 1 commit)

**2. [Discovered, NOT fixed — logged as deferred] Pre-existing `tracks.has_sample`/`tracks.sample_details` schema drift on the live remote**
- **Found during:** Task 1's live DB round-trip verification.
- **Issue:** The live remote (project `wgfjakfiyeewzfuxkgyo`) is missing `has_sample`/`sample_details` on `public.tracks`, despite `supabase migration list` reporting migration `005` (which adds them) as applied on both local and remote. This is NOT specific to 30-04's new code — `lib/deals/catalog-query.ts`'s already-shipped `loadCatalogPage()` selects the identical columns in the identical embedded shape, and was verified to fail identically against the live remote (`column tracks_1.has_sample does not exist`).
- **Why not fixed:** Out of this plan's declared `files_modified` scope; out of Task 1's causal scope (pre-dates 30-04 entirely, afflicts already-shipped Phase 16/22/26 code); this execution's explicit instructions prohibit creating/applying migrations. Per the scope-boundary rule, this is logged rather than silently patched around (a defensive workaround — e.g. dropping `has_sample` from the gate's select — would silently disable the sample-clearance safety check, a worse outcome than a loud 500).
- **Where logged:** `.planning/phases/30-the-crate-sync-library-catalogue-engine-sync-readiness/deferred-items.md` (full repro steps, impact assessment, and recommended owner fix). Committed separately: `17adb3b`.
- **Practical impact:** `sync_listings` currently has 0 rows in production, so this hasn't yet surfaced as a live admit failure — but it means Task 1's gate-composing admit branch (and the already-shipped buyer catalog `GET /api/buyer/catalog`) will 500 on any real attempt until the owner resolves the drift. **This needs owner attention independent of and probably before Phase 30's next waves land real sync-library traffic.**

---

**Total deviations:** 1 auto-fixed (test-suite fix, Rule 1), 1 discovered-and-deferred (pre-existing, critical, out of scope).
**Impact on plan:** Task 1/2's own logic is complete, tested, and correct per the documented schema contract. The deferred item is a genuine production-readiness blocker for the *feature* (not for this plan's code correctness) — flagged loudly rather than worked around.

## Issues Encountered
- Initial `git commit -m "$(cat <<'EOF' ...)"` heredoc-in-heredoc invocation failed with a shell quoting error in this environment; switched to writing the message to a scratch file and using `git commit -F <file>` for all three commits, which worked cleanly.
- `git commit -m` heredoc content originally used a real apostrophe in "listing's" / smart-quote-adjacent characters — resolved by using the scratch-file approach above rather than debugging shell quoting further.

## Live DB Round-Trip

Performed directly against the live remote (`wgfjakfiyeewzfuxkgyo`, service-role client, read-only except for one scratch insert/delete) since no real staff session cookies were available to drive the actual HTTP routes end-to-end:

1. **Schema probe (read-only):** Confirmed migration 107's five `sync_listings` columns (`quality_ok`, `quality_note`, `quality_reviewed_by`, `quality_reviewed_at`, `staff_notes`) are live and queryable. Confirmed `funun_staff.staff_role` is readable (existing `leadership` row present).
2. **Task 2 write round-trip:** Inserted a scratch `sync_listings` row (referencing a real, pre-existing test `vault_project`/`track`/`artist_user_id` — no schema touched), wrote the exact allowlisted shape the quality route produces (`quality_ok`, `quality_reviewed_by`, `quality_reviewed_at`, `quality_note`, `staff_notes`), read it back byte-for-byte, confirmed the gate's `qualityOk` signal would correctly read `true` off the row, then deleted the scratch row. Confirmed 0 rows remain in `sync_listings` afterward.
3. **Task 1 gate-input query:** Attempting the exact `PROJECT_GATE_COLUMNS` select (and, separately, `catalog-query.ts`'s own already-shipped `PROJECT_COLUMNS`) against a real `vault_projects` row failed with `column tracks_1.has_sample does not exist` — this is the pre-existing schema drift documented above, not a defect in the new code. The gate's *logic* is proven correct via the 13-test Jest suite (mocked Supabase, real `computeStage3`/`syncReadinessForTrack`/`evaluateInclusionGate` execution) — see Coverage D2's `human_judgment` note.
4. **AE 403 paths:** Not independently live-tested (would require a real AE staff session); covered by the Jest suite's mocked-`requireStaff` 403 tests, which exercise the exact same route code path `requireStaff` gates.

## User Setup Required
None — no external service configuration required. **Action needed:** see `deferred-items.md` for the `tracks.has_sample`/`sample_details` schema-drift fix (owner-run `ALTER TABLE`/migration repair), which blocks real admit traffic and is already silently affecting the live buyer catalog.

## Next Phase Readiness
- The inclusion gate is now the real admission authority — 30-05 through 30-09 (worklist queue, tagging, role-aware Crate, etc.) can build on `sync_listings.quality_ok`/`staff_notes` and the gate's verdict shape with confidence the write paths are leadership-gated and audited.
- **Blocker for real end-to-end testing (not for further planning/coding):** the `tracks.has_sample`/`sample_details` schema drift must be resolved before any real admit attempt (or the live buyer catalog) will succeed. Recommend the owner triage `deferred-items.md` before or in parallel with 30-05+.

---
*Phase: 30-the-crate-sync-library-catalogue-engine-sync-readiness*
*Completed: 2026-08-13*

## Self-Check: PASSED
All created/modified files found on disk; all 3 commit hashes (57fafa1, 875855e, 17adb3b) found in git log.
