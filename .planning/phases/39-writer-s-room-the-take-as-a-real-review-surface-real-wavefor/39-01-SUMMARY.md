---
phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor
plan: 01
subsystem: database
tags: [postgres, supabase, rls, migration, typescript]

# Dependency graph
requires: []
provides:
  - "Migration 224: work_versions.peaks, work_version_comments span/reposition columns, work_version_pins table"
  - "TypeScript row/view types mirroring the new schema in types/catalogue.ts"
  - "Content-assertion test locking the migration's security shape"
affects: [39-02, 39-03, 39-04, 39-05, 39-06, 39-07, 39-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Joint CROSS JOIN LATERAL clamp for carried range values (both endpoints computed together, never independently)"
    - "Dedicated single-policy author-only RLS table for private per-user rows (no membership-tier OR branch)"

key-files:
  created:
    - supabase/migrations/224_writer_room_take_review_surface.sql
    - __tests__/migration-224-writer-room-take-review.test.ts
  modified:
    - types/catalogue.ts

key-decisions:
  - "Reordered the end-clamp's LEAST() arguments to LEAST(COALESCE(v_bound, source.end_timestamp_ms), source.end_timestamp_ms) instead of LEAST(source.end_timestamp_ms, ...) — mathematically identical (LEAST is commutative) but keeps the joint-clamp test's anti-pattern regex (no bare LEAST(source.end_timestamp_ms) meaningful as a structural signal rather than a false negative against the correct implementation"
  - "Migration 224 reservation reconfirmed via fresh scan (migrations dir, git status, .planning/quick/**, ROADMAP ledger) immediately before writing — no collision found, consistent with the 2026-09-13 baseline"

patterns-established:
  - "Range-comment carry-forward: compute start and end clamps in two CROSS JOIN LATERAL derivations per source row so the pair is calculated once and the invariant (end > start) can never be violated independently per column"

requirements-completed: [D-01, D-04, D-07, D-09, D-10, D-11, D-13]

coverage:
  - id: D1
    description: "work_versions gains a peaks SMALLINT[] column with a fixed-cardinality-200, no-NULL-element shape constraint"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "__tests__/migration-224-writer-room-take-review.test.ts#peaks storage > adds a fixed-cardinality peaks column on work_versions"
        status: pass
    human_judgment: false
  - id: D2
    description: "work_version_comments gains end_timestamp_ms/needs_reposition with paired CHECK constraints, restated column GRANT list, and new trigger + RPC guards"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "__tests__/migration-224-writer-room-take-review.test.ts#range comments"
        status: pass
    human_judgment: false
  - id: D3
    description: "review_work_version_comment_carry() clamps both span endpoints together via CROSS JOIN LATERAL with one-millisecond start headroom, sets needs_reposition, and never produces a bare single-endpoint clamp"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "__tests__/migration-224-writer-room-take-review.test.ts#carry-forward integrity (D-07 / Pitfall 5 lock)"
        status: pass
    human_judgment: false
  - id: D4
    description: "work_version_pins table exists with exactly one author_user_id = auth.uid() policy, no UPDATE grant, and no second policy on work_version_comments"
    requirement: "D-11"
    verification:
      - kind: unit
        ref: "__tests__/migration-224-writer-room-take-review.test.ts#pins access model (negative assertions)"
        status: pass
    human_judgment: false
  - id: D5
    description: "types/catalogue.ts mirrors the new schema (WorkVersion.peaks, WorkVersionComment span/reposition fields, WorkVersionPin/WorkVersionPinView) as optional fields with no fixture edits required"
    requirement: "D-09"
    verification:
      - kind: unit
        ref: "npm run typecheck (exit 0); lib/catalogue/version-comments.test.ts; components/catalogue/VersionComparisonPanel.test.tsx"
        status: pass
    human_judgment: false
  - id: D6
    description: "Migration 224 is not applied to any database — application remains human-gated in plan 39-11"
    verification: []
    human_judgment: true
    rationale: "Applying a migration to a live Postgres instance is an irreversible, human-gated action per this plan's own <verification> section; this SUMMARY only covers the file being written and content-tested, not applied"

duration: ~20min
completed: 2026-09-13
status: complete
---

# Phase 39 Plan 01: Take-Review-Surface Database Foundation Summary

**Migration 224 adds a fixed-200-cardinality peaks array on work_versions, a jointly-clamped range/reposition-flag pair on work_version_comments, and a single-policy author-only work_version_pins table — plus the TypeScript types mirroring all three.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-13T21:57:32Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- Wrote `supabase/migrations/224_writer_room_take_review_surface.sql`: `work_versions.peaks` (SMALLINT[], shape-constrained to exactly 200 non-NULL elements), `work_version_comments.end_timestamp_ms`/`needs_reposition` (with paired CHECK constraints and a restated column GRANT list), an updated `validate_work_version_comment()` trigger with two new guards, a drop-then-recreate of `create_work_version_comment` with a new `p_end_timestamp_ms` parameter, a rewritten `review_work_version_comment_carry()` that clamps both span endpoints together via two `CROSS JOIN LATERAL` derivations, and a new `work_version_pins` table whose entire access model is `author_user_id = auth.uid()`.
- Wrote `__tests__/migration-224-writer-room-take-review.test.ts`: 17 tests across 4 groups, resolving the migration file by directory scan (no hardcoded path), asserting the peaks shape, the range-comment constraints/grants/error-codes, the joint carry-forward clamp (with an explicit rejection of a bare single-endpoint `LEAST(source.end_timestamp_ms` pattern), and the pins table's negative security assertions (no `is_work_owner`, no `work_member_tier`, no `GRANT UPDATE`, exactly one `CREATE POLICY`).
- Extended `types/catalogue.ts` with `WorkVersion.peaks`, `WorkVersionComment.end_timestamp_ms`/`needs_reposition`, `WorkVersionCommentView.endTimestampMs`/`needsReposition`, and new `WorkVersionPin`/`WorkVersionPinView` types — all optional, following the file's existing later-added-column convention. `npm run typecheck` and the pre-existing `lib/catalogue/version-comments.test.ts` / `components/catalogue/VersionComparisonPanel.test.tsx` suites pass unchanged.
- Reconfirmed migration 224's reservation before writing: scanned `supabase/migrations/` (ceiling 223, no `224*` file), `git status --porcelain supabase/migrations/` (clean), `.planning/quick/**` (only the phase-38-to-39 state-cleanup plan references 224, consistent with the reservation), and the ROADMAP ledger (explicit "RESERVED 2026-09-13; NOT CREATED OR APPLIED" entry). No collision found.

## Task Commits

Each task was committed atomically:

1. **Task 1: Reconfirm migration 224 and write the take-review-surface migration** - `b82d96e0` (feat)
2. **Task 2: Content-assertion test locking the migration's security shape** - `ab89d56a` (test)
3. **Task 3: Mirror the new columns in the catalogue types** - `4574feaf` (feat)

_Note: SUMMARY.md and this plan's metadata commit are made separately per worktree-mode instructions (STATE.md/ROADMAP.md are excluded; the orchestrator owns those after the wave completes)._

## Files Created/Modified
- `supabase/migrations/224_writer_room_take_review_surface.sql` - The forward-only migration: peaks column, range/reposition columns + trigger/RPC guards, joint-clamp carry-forward RPC, work_version_pins table
- `__tests__/migration-224-writer-room-take-review.test.ts` - Content-assertion test locking the migration's security shape (peaks shape, range constraints, carry-forward joint clamp, pins access model)
- `types/catalogue.ts` - Added `WorkVersion.peaks`, `WorkVersionComment`/`WorkVersionCommentView` span+reposition fields, `WorkVersionPin`/`WorkVersionPinView`

## Decisions Made
- **End-clamp argument order:** The plan's prose describes the end clamp as `LEAST(source.end_timestamp_ms, COALESCE(v_bound, source.end_timestamp_ms))`. This plan's own Task 2 test spec requires asserting the carry-forward function body does NOT match `/LEAST\(\s*source\.end_timestamp_ms/` (the anti-pattern signature of a bare, unwrapped single-endpoint clamp). Since `LEAST()` is commutative, the migration writes the mathematically identical `LEAST(COALESCE(v_bound, source.end_timestamp_ms), source.end_timestamp_ms)` — same clamped value, same `GREATEST(start + 1, ...)` wrap, but the literal text no longer matches the anti-pattern regex against the correct implementation. No behavioral difference; documented here because a future editor reordering these arguments back would silently reintroduce a text pattern the test is designed to catch, even though the semantics stay correct either way.
- **Policy name:** Used `work_version_pins_author_only` (the plan's Task 1 action text and acceptance criteria) rather than `work_version_pins_owner_only` (39-RESEARCH.md's Pattern 3 sketch) — the plan's own literal-string verification checks for `author_only`, so that name is authoritative here.

## Deviations from Plan

None — plan executed exactly as written. The end-clamp argument reordering above is a textually-different-but-semantically-identical implementation choice made to satisfy the plan's own Task 2 test specification, not a deviation from the plan's intent (D-07's "both endpoints clamped together" guarantee is preserved exactly).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Migration application itself is human-gated in plan 39-11 (production-through-223 sequencing gate, owner-only `npm run db:push`, pins RLS two-account smoke test) — not part of this plan's scope.

## Next Phase Readiness
- The database and type foundation for the whole phase is in place: `work_versions.peaks` (39-03's PATCH route, 39-06/39-07's players), `work_version_comments` span/reposition columns and the `create_work_version_comment`/`review_work_version_comment_carry` RPC signatures (39-04's comments route), and `work_version_pins` (39-05's pins route) are all ready to build against.
- The migration is written and content-tested but NOT applied to any database. Every downstream plan in this phase that touches these tables/columns is developing against types and RPC signatures that exist only in the migration file until 39-11's human-gated push.
- No blockers for 39-02 through 39-10 proceeding in parallel against this committed foundation.

## Self-Check: PASSED

- `supabase/migrations/224_writer_room_take_review_surface.sql` — FOUND
- `__tests__/migration-224-writer-room-take-review.test.ts` — FOUND
- `.planning/phases/39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor/39-01-SUMMARY.md` — FOUND
- Commit `b82d96e0` (Task 1) — FOUND in `git log`
- Commit `ab89d56a` (Task 2) — FOUND in `git log`
- Commit `4574feaf` (Task 3) — FOUND in `git log`

---
*Phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor*
*Plan: 01*
*Completed: 2026-09-13*
