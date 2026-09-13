---
phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor
plan: 04
subsystem: api
tags: [nextjs, supabase-rpc, zod, jest, catalogue]

# Dependency graph
requires:
  - phase: 39-01
    provides: "migration 224 (end_timestamp_ms/needs_reposition columns, seven-argument create_work_version_comment RPC) and matching type-level fields on WorkVersionComment/WorkVersionCommentView"
  - phase: 39-02
    provides: "lib/catalogue/take-spans.ts (clampCarriedSpan, spanNeedsReposition) as the client-side twin of the SQL clamp"
provides:
  - "POST /api/works/[workId]/versions/[versionId]/comments accepts and validates an optional endTimestampMs and forwards p_end_timestamp_ms to the validated RPC"
  - "GET on the same route (and its carry-offer branch) selects end_timestamp_ms and needs_reposition via COMMENT_COLUMNS"
  - "presentVersionComments normalises end_timestamp_ms/needs_reposition into endTimestampMs (number|null) and needsReposition (boolean) on every WorkVersionCommentView"
  - "RPC error classification reads the real Postgres error.message instead of a dead constant-string check"
affects: ["39-06 (carried-from copy)", "39-08 (shaded span + amber flagged pill, carry-offer preview)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Edge Zod validation stays a strict subset of the database CHECK — refine only checks end > start, never restates the duration bound the database alone knows"
    - "RPC error classification reads error.message content rather than a locally-assigned constant string"

key-files:
  created: []
  modified:
    - "app/api/works/[workId]/versions/[versionId]/comments/route.ts"
    - "__tests__/writer-room-timed-track-comments-api.test.ts"
    - "lib/catalogue/version-comments.ts"
    - "lib/catalogue/version-comments.test.ts"

key-decisions:
  - "Kept the 400 response body wording generic and span-aware ('a valid track position, an optional end position after it, and 1-2000 characters') without leaking raw Postgres error text, per T-39-12"
  - "Fixed the pre-existing dead error-classification bug (assigning a constant to `message` then testing `message.includes`) inline as a Rule 1 auto-fix, since the plan explicitly required it to correctly classify the new span error codes"

patterns-established:
  - "A span is presented but never inferred: a comment with no stored end is a point comment and stays one (documented inline in presentVersionComments)"

requirements-completed: [D-04, D-07, D-09]

coverage:
  - id: D1
    description: "A comment can be posted with a span; the route validates end > start at the edge and forwards p_end_timestamp_ms to the seven-argument create_work_version_comment RPC"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-timed-track-comments-api.test.ts#carries a span both ways through the validated RPC only"
        status: pass
    human_judgment: false
  - id: D2
    description: "An invalid span (end not strictly after start, or a database-rejected span) returns 400, not 500, and the RPC-only write invariant holds (no direct insert/update against work_version_comments)"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-timed-track-comments-api.test.ts#carries a span both ways through the validated RPC only"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every presented comment carries endTimestampMs (number|null, never undefined) and needsReposition (boolean, never undefined), including for carried comments that also keep their carriedFromVersionDisplay"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "lib/catalogue/version-comments.test.ts#presents the span and the reposition flag in a normalised shape"
        status: pass
      - kind: unit
        ref: "lib/catalogue/version-comments.test.ts#preserves carry provenance and lets a former author remain visible"
        status: pass
    human_judgment: false
  - id: D4
    description: "The live database path (real end_timestamp_ms round trip against the seven-argument RPC and its CHECK constraints) is unverified until migration 224 is pushed in plan 39-11"
    human_judgment: true
    rationale: "Plan explicitly scopes this out — migration 224 is human-gated and not applied to any database yet; only source-level and unit-level assertions are possible pre-push"
    verification: []

duration: 25min
completed: 2026-09-13
status: complete
---

# Phase 39 Plan 04: Comments route and presenter carry a span end-to-end Summary

**A comment's optional end timestamp now survives POST → validated RPC → GET → presenter, with a normalised `endTimestampMs`/`needsReposition` shape and a real Postgres-error-driven 400/409/500 split.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-13T21:56:00Z
- **Completed:** 2026-09-13T22:11:00Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments
- `COMMENT_COLUMNS` and `CommentBodySchema` extended with `end_timestamp_ms`/`endTimestampMs`; the schema refines `endTimestampMs > timestampMs` at the edge without restating the database's duration bound
- `p_end_timestamp_ms` now flows into the `create_work_version_comment` RPC call
- RPC error classification reads the real `error.message` (fixing a pre-existing dead `message.includes` check that always fell through to 500) and correctly routes `comment_thread_resolved` → 409, timestamp/span errors → 400
- `presentVersionComments` normalises `end_timestamp_ms`/`needs_reposition` into `endTimestampMs: number | null` and `needsReposition: boolean`, never `undefined`, leaving `carriedFromVersionDisplay` and `canResolve` untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: The comments route carries a span both ways** - `bdfd551a` (feat)
2. **Task 2: The presenter exposes the span, the flag and the carry provenance (RED)** - `dff79471` (test)
2. **Task 2: The presenter exposes the span, the flag and the carry provenance (GREEN)** - `89f8dadb` (feat)

_Note: Task 2 was TDD (`tdd="true"`) — RED commit `dff79471` followed by GREEN commit `89f8dadb`; no refactor step was needed._

## Files Created/Modified
- `app/api/works/[workId]/versions/[versionId]/comments/route.ts` - COMMENT_COLUMNS + CommentBodySchema gain the span; RPC call forwards p_end_timestamp_ms; error classification reads error.message
- `__tests__/writer-room-timed-track-comments-api.test.ts` - new `it` asserting span fields, RPC call, and no direct table write
- `lib/catalogue/version-comments.ts` - presentVersionComments normalises endTimestampMs/needsReposition
- `lib/catalogue/version-comments.test.ts` - new `it` covering span-present, span-absent, and reposition-flag cases

## Decisions Made
- Fixed the dead `message.includes(...)` classification bug in-line (Rule 1 — it made every RPC failure a 500 today, and the plan explicitly required correct classification for the new span error codes) rather than leaving it and layering a second broken check on top.
- Widened the 400 response body copy to mention the span, per the plan's `<action>` guidance, without leaking the raw Postgres error string (T-39-12).

## Deviations from Plan

None beyond the explicitly-directed error-classification fix, which was itself called out in the plan's `<action>` block as required work for this task ("Fix the error classification while you are in it, because the new failure modes need it"). No architectural changes, no new tables, no second validation layer duplicating the database CHECK.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Migration 224 (span columns, RPC signature) remains human-gated for plan 39-11; this plan's route and presenter code are correct against that migration's contract but unverified against a live database until it is pushed.

## Next Phase Readiness
- `endTimestampMs`/`needsReposition` are available on every `WorkVersionCommentView` the API returns, including inside `carryOffer.comments` — ready for plan 39-08's shaded span and amber flagged-pill UI, and for plan 39-06's carried-from copy.
- No blockers. The one open dependency is the human-gated `supabase db push` for migration 224 in plan 39-11, tracked separately and not blocking this plan's completion.

---
*Phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor*
*Completed: 2026-09-13*

## Self-Check: PASSED

All modified files verified present on disk; all four task/plan commits
(`bdfd551a`, `dff79471`, `89f8dadb`, `add2b0b9`) verified present in
`git log --oneline`.
