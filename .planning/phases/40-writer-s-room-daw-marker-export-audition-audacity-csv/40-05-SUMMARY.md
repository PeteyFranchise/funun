---
phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv
plan: 05
subsystem: api
tags: [nextjs, supabase, catalogue, pins, export, csv, audacity, audition]

# Dependency graph
requires:
  - phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv (40-01, 40-02, 40-03)
    provides: "lib/catalogue/take-export.ts (ExportMarker, sanitizeMarkerLabel, pinToMarker, classifyPinExport, exportFilename), lib/catalogue/take-export-formats.ts (renderAudacityLabels, renderMarkerCsv), lib/catalogue/take-export-audition.ts (renderAuditionMarkers, AUDITION_MARKER_HEADER)"
provides:
  - "GET /api/works/[workId]/versions/[versionId]/pins/export?format=csv|audacity|audition — an author's own pins as a downloadable DAW marker file"
  - "409 refusal with reason no_pins when the caller has no pins on the take"
  - "Source-assertion doctrine test extending D-11's forbidden-token set to a third pin file"
affects: [40-06, 40-07, 40-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Explicit author_user_id equality filter as a second, non-redundant gate alongside an author-only RLS policy, documented as such in the query comment (contrasted against the collection route's GET, where the same-shaped filter is explicitly narrowing-only)"
    - "409 (not 200) for an empty export, carrying the classifier's refusal reason and message as JSON"
    - "Structural E-03 separation: two route files, two tables, two classifiers, zero shared imports between the private pin export and the shareable comments export"

key-files:
  created:
    - "app/api/works/[workId]/versions/[versionId]/pins/export/route.ts"
    - "__tests__/writer-room-pin-export-api.test.ts"
  modified: []

key-decisions:
  - "Rate-limit key namespaced work-version-pins-export: (distinct from the comments export's work-version-comments-export: bucket) so one export's rate never reveals the other's activity"
  - "No X-Funun-Skipped-Reposition header on this route — a pin has no repositioning concept, and a header that always reads zero invites future misuse"
  - "409 with { error: refusalReason, message } on an empty export, matching the comments export's refusal posture so the two controls behave identically when there is nothing to hand over"

patterns-established:
  - "A DAW marker export route sequence: params -> format validate -> auth -> rate limit -> resolveWorkAccess('contribute') -> version membership check -> title load -> narrowly-scoped query with an explicit ownership/author filter commented as a second gate -> classify -> refuse (409) or render+respond"

requirements-completed: [E-02, E-03, E-04, E-05, E-06, E-10, E-13]

coverage:
  - id: D1
    description: "GET route returns the caller's own pins for one take as a downloadable marker file in csv, audacity, or audition format, named with the my-pins kind"
    requirement: "E-02"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-pin-export-api.test.ts#Group five — the file contract, per E-06 and E-13"
        status: pass
    human_judgment: false
  - id: D2
    description: "The author filter is written explicitly in the query (not left to the RLS policy alone) and is proven present by a test that fails when the filter is removed"
    requirement: "E-03"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-pin-export-api.test.ts#Group one — authorship"
        status: pass
    human_judgment: false
  - id: D3
    description: "The route never references the comments table, the comment view type, or any parameter that could select a comment"
    requirement: "E-03"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-pin-export-api.test.ts#Group four — the separation, per E-03"
        status: pass
    human_judgment: false
  - id: D4
    description: "The route writes, notifies, and broadcasts nothing — D-11 silence preserved on a third pin file"
    requirement: "E-10"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-pin-export-api.test.ts#Group two — silence, per D-11"
        status: pass
      - kind: unit
        ref: "__tests__/writer-room-pin-export-api.test.ts#Group three — the pure read, per E-10"
        status: pass
    human_judgment: false
  - id: D5
    description: "An empty pin export refuses with 409 and a reason rather than a fake 200 success"
    requirement: "E-11"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-pin-export-api.test.ts#Group six — refusal, not a fake success"
        status: pass
    human_judgment: false
  - id: D6
    description: "Behavioural cross-account pin invisibility (D-11) in production — RLS actually scoping rows for two real authenticated users"
    verification: []
    human_judgment: true
    rationale: "Jest cannot impersonate two authenticated Postgres roles; this is Phase 39's still-open D-11 item, not resolved by this plan. The explicit query filter holds independently of the row policy, but the policy's own behavioural proof remains outstanding."

duration: ~35min
completed: 2026-09-16
status: complete
---

# Phase 40 Plan 05: Private Pin Export Route Summary

**A new GET-only route hands an author their own pins on one take as a downloadable Audacity/CSV/Audition marker file, gated by an explicit `author_user_id` filter that a doctrine test proves is load-bearing, and structurally isolated from the sibling comments export with zero shared imports.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-16T01:27:00Z (approx, first read)
- **Completed:** 2026-09-16T02:02:16Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments
- `app/api/works/[workId]/versions/[versionId]/pins/export/route.ts` — a single `GET` handler: format validation, auth, a route-namespaced rate limit, `resolveWorkAccess('contribute')`, version-membership check, work-title load, a narrowly-scoped `work_version_pins` query filtered on work id, version id, AND an explicit `author_user_id` equality against the caller, `classifyPinExport`, a 409 refusal on empty, and a dispatch to the shared renderers (`renderMarkerCsv`, `renderAudacityLabels`, `renderAuditionMarkers`) with the `my-pins` filename kind.
- `__tests__/writer-room-pin-export-api.test.ts` — 18 passing source-assertion tests across six groups: authorship, D-11 silence, the pure-read shape (E-10), the E-03 separation from comments, the E-06/E-13 file contract, and the 409 refusal posture. Reuses the forbidden-token constants from `writer-room-private-pins.test.ts` verbatim rather than re-deriving them.
- Manually verified the load-bearing claim: removed the `.eq('author_user_id', user.id)` line, re-ran the suite (1 test failed as expected), restored the line, re-ran (18/18 green again). `writer-room-private-pins` suite unaffected throughout.

## Task Commits

Each task was committed atomically:

1. **Task 1: GET the author's own pins export** - `3d9730d1` (feat)
2. **Task 2: The pin export's own source-assertion test** - `8548b7cf` (test)

_No plan-metadata commit in this file — STATE.md/ROADMAP.md are owned by the orchestrator per this plan's parallel-execution instructions._

## Files Created/Modified
- `app/api/works/[workId]/versions/[versionId]/pins/export/route.ts` - GET-only route exporting an author's own pins for one take as a CSV/Audacity/Audition marker file
- `__tests__/writer-room-pin-export-api.test.ts` - source-assertion doctrine gate covering authorship, silence, pure-read shape, E-03 separation, and the file contract

## Decisions Made
- Rate-limit allowance of 200 attempts / 15-minute window under a route-specific key prefix (`work-version-pins-export:`), matching the "generous allowance" the sibling comments export uses for its own low-cost read, but never sharing the bucket — a shared bucket would let one export's rate reveal the other's activity.
- No `X-Funun-Skipped-Reposition` header on this route: a pin cannot be flagged for repositioning, and a header that always reads zero is a header someone would eventually wire to something non-zero.
- Empty-export refusal returns `{ error: refusalReason, message }` at status 409, mirroring the comments export's refusal shape so both controls behave identically when there is nothing to export.
- Did not attempt to read `__tests__/writer-room-comments-export-api.test.ts` or the comments export route from plan 40-04 as literal siblings to copy from — that plan runs in parallel in a separate worktree and its files are not present here. Instead, mirrored the comments-export shape as described in `40-04-PLAN.md`'s own task text (which is present in this worktree) and the established `writer-room-timed-track-comments-api.test.ts` / `writer-room-private-pins.test.ts` conventions already in the codebase.

## Deviations from Plan

None — plan executed as written. The one adaptation was informational, not a code deviation: 40-04's route/test files (the "sibling shape" reference) do not exist in this worktree because that plan builds in a parallel sibling worktree. This plan's own `read_first` list and the 40-04 plan document (present here) provided sufficient detail to build a structurally equivalent, independently-verified route without needing those files on disk.

## Issues Encountered
- First `git commit -m "$(cat <<'EOF' ... EOF)"` heredoc invocation for Task 2 failed with a shell quoting error (apostrophe inside `D-11's`). Resolved by writing the commit message to a scratch file and using `git commit -F <file>` instead. No impact on the commit content or task completion — the retry succeeded on the first attempt after the format change.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 40-06's doctrine gate can now assert the comments/pins separation from both sides using this route and 40-04's route.
- Plan 40-07 (the export UI) has a private-pin download endpoint ready to wire up with the same three format options as the comments export.
- Not resolved by this plan: D-11's behavioural cross-account verification (Phase 39's open item) — the explicit author filter holds independently, but the row policy's own live behavior remains unproven by any automated test in this repo.

---
*Phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv*
*Completed: 2026-09-16*

## Self-Check: PASSED

- FOUND: `app/api/works/[workId]/versions/[versionId]/pins/export/route.ts`
- FOUND: `__tests__/writer-room-pin-export-api.test.ts`
- FOUND commit `3d9730d1` (Task 1)
- FOUND commit `8548b7cf` (Task 2)
