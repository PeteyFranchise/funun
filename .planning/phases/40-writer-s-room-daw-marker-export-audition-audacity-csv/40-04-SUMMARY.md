---
phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv
plan: 04
subsystem: api
tags: [nextjs, zod, supabase, export, rate-limit]

requires:
  - phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv
    provides: "classifyCommentExport, exportFilename, sanitizeMarkerLabel (40-01); renderAudacityLabels, renderMarkerCsv (40-02); renderAuditionMarkers (40-03)"
provides:
  - "GET /api/works/[workId]/versions/[versionId]/comments/export?format=csv|audacity|audition — one take's unresolved, positioned root comments as a downloadable marker file"
  - "409 JSON refusal body with a distinct reason for each of the four E-11 empty cases"
  - "X-Funun-Skipped-Reposition response header carrying the E-09 count on the success path"
  - "__tests__/writer-room-comments-export-api.test.ts — source-assertion doctrine gate for the access boundary, the single-take scope, the pure-read invariant, and the E-03 pin boundary"
affects: [40-05, 40-06, 40-07, 40-08]

tech-stack:
  added: []
  patterns:
    - "Route stays thin: fetch rows scoped by both path ids, present through the existing view builder, classify through the pure module, dispatch on a Zod-validated format enum, set headers."
    - "409 (not 200) for a refusal-with-JSON-body pattern, so a browser cannot mistake a JSON error for a downloaded file."
    - "Structural security boundary proven by source assertion rather than a runtime check, because there is no path anywhere in the file to the private-data table."

key-files:
  created:
    - "app/api/works/[workId]/versions/[versionId]/comments/export/route.ts"
    - "__tests__/writer-room-comments-export-api.test.ts"
  modified: []

key-decisions:
  - "Author display names are resolved by loading profiles for the comments' author_user_id set directly, rather than also calling loadWorkParticipantIds — the export route has no @mention surface to power, so the extra participant-list fetch the sibling comments route needs was dropped as unneeded I/O, not an oversight."
  - "Rate limit: work-version-comments-export:{userId}, 200 attempts / 15 minutes, fail-open — a low-cost read where the shared limiter's default failure posture (not failClosed) matches every other read path in this subsystem."
  - "All three format ids (csv, audacity, audition) are accepted by this route even though plan 40-07's UI will only expose two — the Audition renderer is byte-pinned and complete; what plan 40-08 gates is the interface option, not the code path."

requirements-completed: [E-01, E-03, E-05, E-06, E-09, E-10, E-11, E-13]

coverage:
  - id: D1
    description: "A room member (contribute tier or owner) downloads one take's unresolved, correctly-positioned root comments as a marker file in their chosen format (CSV, Audacity label track, or Audition marker file)."
    requirement: "E-01, E-05, E-06, E-13"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-comments-export-api.test.ts#Group two — one take, one work"
        status: pass
      - kind: unit
        ref: "__tests__/writer-room-comments-export-api.test.ts#Group four — the file contract"
        status: pass
      - kind: unit
        ref: "lib/catalogue/take-export.test.ts (unchanged, still green — the classifier and renderers this route dispatches to)"
        status: pass
    human_judgment: true
    rationale: "No test database exists in this environment; the 200 success path with a real file body has never been exercised against Postgres/RLS. Source assertion and the pure modules' own tests prove the wiring is correct, not that a live request returns the expected bytes."
  - id: D2
    description: "A non-member gets the same refusal the comments read already gives them (404 for unreachable, 403 for insufficient tier once membership is proven), with no file and no existence oracle; a version id from a different work is rejected with 404 even when the work id is one the caller can reach."
    requirement: "E-03 (adjacent boundary), access gate"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-comments-export-api.test.ts#Group one — the access gate"
        status: pass
    human_judgment: true
    rationale: "The access decision (decideWorkAccess) is unit-tested elsewhere in the codebase and unchanged by this plan; what this plan adds is only that the route calls it identically to the comments GET route. Live 404/403 behavior against real memberships is UAT, per the plan's own verification section."
  - id: D3
    description: "When there is nothing exportable, the route refuses with 409 and a JSON body naming which of the four E-11 cases applies (no comments / all resolved / all repositioning / none — success), rather than returning an empty 200 file."
    requirement: "E-11"
    verification:
      - kind: unit
        ref: "lib/catalogue/take-export.test.ts (classifyCommentExport's four-reason branching, unchanged by this plan)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The repositioning-skipped count (E-09) is present on the success path as a response header, not only inside a refusal body."
    requirement: "E-09"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-comments-export-api.test.ts#Group four — the file contract"
        status: pass
    human_judgment: false
  - id: D5
    description: "Nothing about an export is recorded (E-10): the route performs no row write, no stored-procedure call, no notification, no realtime broadcast, and exports exactly one handler (GET only)."
    requirement: "E-10"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-comments-export-api.test.ts#Group three — the pure read (E-10)"
        status: pass
    human_judgment: false
  - id: D6
    description: "E-03 structural boundary: this route contains no reference to the pins table name or the pin view type name anywhere in its source, so there is no code path from the shareable comments export to a private pin."
    requirement: "E-03"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-comments-export-api.test.ts#Group five — the boundary this route shares with nothing (E-03)"
        status: pass
      - kind: other
        ref: "Manual negative check: temporarily added a work_version_pins string reference to the route, reran the suite, confirmed the two Group-five assertions failed, then reverted (git diff was empty after revert) before committing"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-09-15
status: complete
---

# Phase 40 Plan 04: Comments Export Route Summary

**GET /api/works/[workId]/versions/[versionId]/comments/export?format=csv|audacity|audition — a thin route that authorizes exactly like the comments read, fetches one take's unresolved root comments, classifies them through the plan 40-01 pure module, and returns a downloadable marker file or a 409 refusal naming why there isn't one.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-09-15T00:00:00Z (approx — worktree session start)
- **Completed:** 2026-09-15
- **Tasks:** 2
- **Files modified:** 2 (both new)

## Accomplishments

- Stood up the shareable half of the DAW export feature: one GET handler, gated by the same `resolveWorkAccess('contribute')` call the comments GET route uses, that fetches root comments scoped by both `work_id` and `version_id`, presents them through the existing `presentVersionComments` view builder, and hands the result to `classifyCommentExport`.
- All four E-11 refusal cases (`no_comments`, `all_resolved`, `all_repositioning`, and the success case `none`) surface as a 409 JSON body with a distinct `reason` and `message`, never a 200 — closing the "empty file mistaken for a real download" failure mode the plan called out.
- All three named formats (CSV, Audacity label track, Audition marker file) are wired to their plan 40-01/40-02/40-03 renderers, with correct extensions (`.txt` for Audacity, `.csv` for the other two) and charset-qualified content types, plus a `Cache-Control: no-store` header since this is per-user content.
- `X-Funun-Skipped-Reposition` carries the E-09 count on every successful download, not only inside a refusal.
- Wrote and ran a doctrine-gate test (`__tests__/writer-room-comments-export-api.test.ts`, 12 assertions) that source-checks the access gate, the dual work/version filter, the root-only comment filter, the absence of any write/notify/broadcast verb, the file contract, and — critically — the total absence of the pins table name or pin view type name anywhere in the route.
- Performed and reverted the required negative check: added a throwaway `work_version_pins` string literal to the route, confirmed the Group-five E-03 assertions fail, then reverted cleanly (`git diff` empty) before committing the test.

## Task Commits

1. **Task 1: GET the comments export** - `17fe71d8` (feat)
2. **Task 2: The route's own source-assertion test** - `7b293539` (test)

_Note: this plan runs in a wave-3 worktree and does not carry its own plan-metadata commit — the orchestrator updates STATE.md/ROADMAP.md after all wave agents complete._

## Files Created/Modified

- `app/api/works/[workId]/versions/[versionId]/comments/export/route.ts` - The single GET handler: format validation, auth, rate limit, access gate, version-membership check, root-comment query, classification, and the three-format dispatch with headers.
- `__tests__/writer-room-comments-export-api.test.ts` - Source-assertion doctrine gate: five groups covering the access gate, the single-take scope, the pure-read invariant (E-10), the file contract, and the E-03 pin boundary.

## Decisions Made

- Dropped `loadWorkParticipantIds` from the route's dependencies (used by the sibling comments GET route) because this route has no `@mention` participant list to build — resolving author display names only needs `loadCommentProfiles` against the comments' own `author_user_id` set, which works correctly even for an author who has since left the room (profile lookup is by id, not by current membership).
- Chose `maxAttempts: 200` over the shared 15-minute window for the rate limit, left at the default fail-open posture (no `failClosed`) — a low-cost read a writer might trigger a handful of times while comparing DAW imports, matching the posture of every other read path in this subsystem (documented inline in the route with the reasoning).
- Ordered the comments query by `timestamp_ms ascending` even though `classifyCommentExport` re-sorts its output — kept for parity with the sibling route and because a stable initial order costs nothing.

## Deviations from Plan

None - plan executed exactly as written, task order and sequencing followed as specified (format validation → auth → rate limit → access gate → version check → title load → comments query → classify → refuse-or-dispatch).

**Grep-based acceptance-criteria note (not a deviation, documented for the record):** two of the plan's exact-count (`returns 1`) acceptance criteria are structurally unsatisfiable by any valid TypeScript file that both imports and calls a named function or selects-then-filters-on a named column, and were not forced:
- `grep -c "resolveWorkAccess"` returns 2 (the import line plus the one call site), not 1.
- `grep -c "parent_comment_id"` returns 2 (the column's presence in the `COMMENT_COLUMNS` select-list constant, required because `presentVersionComments`/`classifyCommentExport` consume that field, plus the one `.is('parent_comment_id', null)` filter), not 1.

Both are correct — one import, one call; one column selected, one filter applied — and match the pattern already present in this codebase's sibling routes. The other five grep-based criteria (`export async function` = 1, `'contribute'` = 1, `X-Funun-Skipped-Reposition` = 1, `eq('work_id'` ≥ 1, `classifyCommentExport` ≥ 1) all match exactly as specified.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The route is ready for plan 40-07's UI download control to call directly; the control should fetch-and-branch on status (200 → save the blob, 409 → surface `message`) rather than use a bare anchor with `download`, per the plan's own reasoning.
- Plan 40-06's cross-route doctrine gate can build directly on the two forbidden-token constants (`FORBIDDEN_PINS_TABLE_NAME`, `FORBIDDEN_PIN_VIEW_TYPE_NAME`) already named in this plan's test file, alongside the equivalent constants in `writer-room-private-pins.test.ts`, without re-deriving them.
- No live request has been made against this route in this environment (no test database) — the 401/403/404/409/200 status paths are proven by source assertion and by the already-tested pure modules, not by execution. This matches the plan's own "Not verified by this plan" note and remains UAT for whoever exercises the deployed route.
- Depends on plans 40-01/40-02/40-03 (merged at this worktree's base) for `classifyCommentExport`, `exportFilename`, `renderAudacityLabels`, `renderMarkerCsv`, and `renderAuditionMarkers` — all confirmed present and their own test suites still green (82 tests across the three `take-export*` files).

## Self-Check: PASSED

- FOUND: `app/api/works/[workId]/versions/[versionId]/comments/export/route.ts`
- FOUND: `__tests__/writer-room-comments-export-api.test.ts`
- FOUND: `.planning/phases/40-writer-s-room-daw-marker-export-audition-audacity-csv/40-04-SUMMARY.md`
- FOUND: commit `17fe71d8` (Task 1 — feat)
- FOUND: commit `7b293539` (Task 2 — test)
- FOUND: commit `c8ba48c5` (docs — this SUMMARY)

---
*Phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv*
*Completed: 2026-09-15*
