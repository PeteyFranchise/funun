---
phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1
plan: 01
subsystem: auth
tags: [typescript, jest, staff-role, admin-gate, rbac]

# Dependency graph
requires: []
provides:
  - "'it' StaffRole recognized across the union, ALL_STAFF_ROLES, and getStaffRole()"
  - "requireStaffPage() page-context fail-closed guard in lib/admin/gate.ts"
affects: [33-02, 33-03, 33-04, 33-05, 33-06, 33-07, 33-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Union-widen + comment-block pattern for adding a new StaffRole (mirrors the Phase 30 'anr' addition exactly)"
    - "requireStaffPage() page-context guard: createServerClient + getUser + redirect(), distinct shape from requireStaff()'s API-route {error,status} object"

key-files:
  created:
    - __tests__/staff-role-it.test.ts
  modified:
    - lib/admin/staff-role.ts
    - lib/admin/gate.ts
    - components/admin/StaffAdmin.tsx
    - components/admin/TeamDirectory.tsx

key-decisions:
  - "'it' excluded from the create-staff dropdown (STAFF_ROLE_VALUES) until migration 114_it_staff_role.sql is owner-applied, mirroring the existing 'anr'/migration-108 precedent exactly"
  - "requireStaffPage() built as a net-new export rather than modifying requireStaff()'s shape — API-route callers stay on {error,status}, page callers get redirect()-based fail-closed semantics"

patterns-established:
  - "Every new StaffRole must be added to any Record<StaffRole, string> exhaustive map at the same time as the union widen, or tsc --noEmit fails downstream consumers"

requirements-completed: [PLAYBOOK-01, PLAYBOOK-04]

coverage:
  - id: D1
    description: "'it' is a recognized StaffRole across StaffRole union, ALL_STAFF_ROLES, and getStaffRole(); existing roles + is_admin bootstrap fallback unchanged"
    requirement: "PLAYBOOK-01"
    verification:
      - kind: unit
        ref: "__tests__/staff-role-it.test.ts#staff-role.ts getStaffRole — it role (Phase 33)"
        status: pass
    human_judgment: false
  - id: D2
    description: "requireStaffPage() is a fail-closed page-context guard returning {user,staffRole} for it/leadership callers and redirect()-ing all others ('/' for wrong role, '/signin' for no session)"
    requirement: "PLAYBOOK-04"
    verification:
      - kind: unit
        ref: "__tests__/staff-role-it.test.ts#gate.ts requireStaffPage"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-08-18
status: complete
---

# Phase 33 Plan 01: IT StaffRole + requireStaffPage() Access-Control Primitives Summary

**Widened StaffRole to recognize 'it' and added a redirect()-based requireStaffPage() page guard, mirroring the Phase 30 'anr' precedent and the existing app/(admin)/layout.tsx idiom exactly**

## Performance

- **Duration:** 9 min
- **Started:** 2026-08-18T01:15:09Z
- **Completed:** 2026-08-18T01:24:34Z
- **Tasks:** 2
- **Files modified:** 5 (4 modified, 1 created)

## Accomplishments
- `StaffRole` union, `ALL_STAFF_ROLES`, and `getStaffRole()` now recognize `'it'` — additive only, `is_admin → leadership` bootstrap fallback and existing leadership/ae/bd/anr behavior byte-for-byte unchanged
- New `requireStaffPage()` export in `lib/admin/gate.ts`: a fail-closed, `redirect()`-based page-context guard (distinct shape from `requireStaff()`'s API-route `{error,status}` object) that every future IT-room page will call inline
- Wave 0 test `__tests__/staff-role-it.test.ts` locks both behaviors — 10 tests, all green

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the `it` StaffRole to the union, ALL_STAFF_ROLES, and getStaffRole()** - `0a91366` (feat)
2. **Task 2: Add requireStaffPage() page-context guard to lib/admin/gate.ts** - `2c73917` (feat)

_Note: Task 1 was `tdd="true"` — the test file was written and run RED (confirmed failing: `getStaffRole` returned `null`/missing `'it'`) before the union/branch implementation, then GREEN, then committed as a single atomic `feat` commit per the standard task-commit protocol (see Deviations)._

## Files Created/Modified
- `lib/admin/staff-role.ts` - Widened `StaffRole` union + `ALL_STAFF_ROLES` + `getStaffRole()` to recognize `'it'`, with a Phase-33/D-01 comment block mirroring the existing `'anr'` block
- `lib/admin/gate.ts` - Added `requireStaffPage(allowed)` export + `RequireStaffPageResult` type; `requireStaff()`/`verifyAdmin()` untouched
- `__tests__/staff-role-it.test.ts` - Wave 0 test: 6 cases for `getStaffRole`/`ALL_STAFF_ROLES`, 4 cases for `requireStaffPage` (it/leadership authorized, ae → redirect('/'), no session → redirect('/signin'))
- `components/admin/StaffAdmin.tsx` - Added `it: 'IT'` to the exhaustive `STAFF_ROLE_LABELS` map (Rule 3 fix, see Deviations); `STAFF_ROLE_VALUES` (create-staff dropdown) deliberately left without `'it'`
- `components/admin/TeamDirectory.tsx` - Added `it: 'IT'` to the exhaustive `STAFF_ROLE_LABELS` map (Rule 3 fix, see Deviations)

## Decisions Made
- `'it'` is additive-only and forward-compatible for a future non-leadership IT hire; the owner reaches the IT room via the leadership branch (D-03 single-slot model — a person is `it` OR `leadership`, never both)
- `requireStaffPage()` is a net-new export, not a modification of `requireStaff()` — keeps the API-route auth path and the page-context auth path structurally distinct so neither shape leaks into the other's callers

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Widening `StaffRole` broke two exhaustive `Record<StaffRole, string>` maps**
- **Found during:** Task 1 (after implementing the union widen, `npx tsc --noEmit` surfaced 2 new errors)
- **Issue:** `components/admin/StaffAdmin.tsx` and `components/admin/TeamDirectory.tsx` both declare `STAFF_ROLE_LABELS: Record<StaffRole, string>` — TypeScript's exhaustiveness check on `Record` rejected both objects once `'it'` was added to the union, since neither map had an `'it'` key. This is a compile-blocking issue directly caused by Task 1's change, not a pre-existing/out-of-scope failure.
- **Fix:** Added `it: 'IT'` to both `STAFF_ROLE_LABELS` maps. Mirrored the existing `'anr'` precedent in `StaffAdmin.tsx` by explicitly excluding `'it'` from `STAFF_ROLE_VALUES` (the create-staff dropdown) with an updated comment, since `funun_staff`'s DB-side CHECK constraint won't accept `'it'` until migration `114_it_staff_role.sql` is owner-applied — offering it in the dropdown today would let leadership submit a create that 500s on the DB write.
- **Files modified:** `components/admin/StaffAdmin.tsx`, `components/admin/TeamDirectory.tsx`
- **Verification:** `npx tsc --noEmit` clean after the fix; full suite `npx jest` 197/197 suites, 2294/2294 tests passing
- **Committed in:** `0a91366` (part of Task 1 commit)

**2. [Process note, not a Rule 1-4 deviation] Task 1's RED/GREEN combined into a single commit**
- **Found during:** Task 1
- **Issue:** Task 1 is `tdd="true"`, and the general TDD execution flow calls for separate `test(...)` RED and `feat(...)` GREEN commits. The test was written and run RED first (confirmed failing before any implementation change), then the implementation was added and the test re-run GREEN — but both were committed together as one `feat` commit, following this plan's per-task commit protocol rather than the more granular RED/GREEN commit split.
- **Fix:** None needed — RED was independently verified (test failures observed pre-implementation) even though the git history doesn't carry a standalone `test(...)` commit. Documented here for TDD gate transparency.
- **Files modified:** none (process note only)
- **Committed in:** `0a91366`

---

**Total deviations:** 1 auto-fixed (1 blocking); 1 process note (no code impact)
**Impact on plan:** The exhaustive-map fix was necessary for the build to stay green and directly caused by this task's own union widen — no scope creep. The RED/GREEN commit-granularity note has no functional impact; the Wave 0 test is fully green and locks the exact behaviors specified in the plan's `must_haves.truths`.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. (Migration `114_it_staff_role.sql` referenced in code comments is a future plan's owner-run deliverable, not part of this plan's scope.)

## Next Phase Readiness
- `getStaffRole()`/`ALL_STAFF_ROLES` recognize `'it'` — ready for any future plan that assigns `app_metadata.staff_role='it'` (still requires owner-run migration 114 before a `funun_staff` row can persist it, per the existing 'anr' pattern)
- `requireStaffPage(['leadership','it'])` is ready to be called inline by every IT-room page in later plans of this phase (33-02 through 33-08), per D-02/D-04
- No blockers for downstream plans in this wave

---
*Phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1*
*Completed: 2026-08-18*
