---
phase: 25-funun-team-accounts-ae
plan: 01
subsystem: staff-rbac-foundation
tags: [auth, rbac, staff, admin-gate]
dependency-graph:
  requires: []
  provides:
    - "getStaffRole(user) — pure StaffRole resolver ('leadership'|'ae'|'bd'|null)"
    - "requireStaff(allowed?) — async gate, single authorization authority for staff routes"
    - "verifyAdmin() — preserved leadership-only alias, byte-compatible for ~20 existing callers"
    - "isAssignedToOrg(org, staffUserId) — pure assignment-scope predicate"
  affects:
    - lib/admin/gate.ts
    - lib/staff/scope.ts
tech-stack:
  added: []
  patterns:
    - "Widen an existing gate in place rather than fork a parallel auth path (D-01)"
    - "Pure, fail-closed predicates for permission checks (mirrors lib/buyers/permissions.ts)"
key-files:
  created:
    - lib/admin/gate.test.ts
    - lib/staff/scope.ts
    - lib/staff/scope.test.ts
  modified:
    - lib/admin/gate.ts
decisions:
  - "requireStaff() is the single authority every staff route calls before createServiceClient() — no parallel auth path (D-01)"
  - "is_admin===true treated as an implicit leadership fallback (D-02/A1) so the owner's bootstrap account isn't locked out on deploy"
  - "isAssignedToOrg ships as the pure row-predicate variant only — the I/O route-layer check is deferred to 25-05 where the org row is fetched"
metrics:
  duration: ~15min
  completed: 2026-08-07
status: complete
---

# Phase 25 Plan 01: Staff Role Gate & Assignment-Scope Predicate Summary

Generalized the existing binary `is_admin` admin gate in `lib/admin/gate.ts` into a three-tier staff role
system (`leadership | ae | bd`) via `getStaffRole()`/`requireStaff()`, while preserving `verifyAdmin()` as a
byte-compatible leadership-only alias for all ~20 existing `/api/admin/*` callers, and added the pure
`isAssignedToOrg()` scope predicate in a new `lib/staff/` module.

## What Was Built

### Task 1: `lib/admin/gate.ts` — `getStaffRole` / `requireStaff` (verifyAdmin preserved)

- `StaffRole` type (`'leadership' | 'ae' | 'bd'`) and module-level `ALL_STAFF_ROLES`.
- `getStaffRole(user)`: pure, fail-closed, zero-I/O. Reads `app_metadata.staff_role`; returns it when it
  matches the closed union. Falls back to `'leadership'` when `app_metadata.is_admin === true` (D-02/A1
  bootstrap compat). Returns `null` for absent/unrecognized values, never throws. `staff_role` wins over
  `is_admin` when both are present.
- `requireStaff(allowed = ALL_STAFF_ROLES)`: async, mirrors `verifyAdmin`'s `createApiClient()` +
  `getUser()` flow. Returns `{ error: 'Unauthorized', status: 401 }` (no session), `{ error: 'Forbidden',
  status: 403 }` (role missing/not allowed), or `{ user, staffRole }` on success.
- `verifyAdmin()` re-pointed to call `requireStaff(['leadership'])` internally and narrow the result back to
  its original `{ user } | { error, status }` shape — zero changes required in any of the ~20 existing
  `/api/admin/*` callers (verified by grep, listed below).
- The unrelated checklist constants (`EDITABLE_FIELDS`, `SECTION_VALUES`, `ACTION_TYPE_VALUES`, `KEY_REGEX`)
  were left untouched at the bottom of the file — confirmed present and unchanged via grep.

### Task 2: `lib/staff/scope.ts` — `isAssignedToOrg` pure predicate

- New module `lib/staff/scope.ts` exporting `isAssignedToOrg(org, staffUserId): boolean`.
- Pure, zero-I/O (no Supabase client import — confirmed by grep for `import` in the file, which returns
  nothing), fail-closed: `org?.ae_user_id === staffUserId`, guarded so an empty `staffUserId` never matches
  and `null`/`undefined` org never throws.
- Org row typed locally as `Pick<{ ae_user_id: string | null }, 'ae_user_id'>` rather than importing a
  heavy shared type, per the plan's explicit instruction.

## Deviations from Plan

None — plan executed exactly as written. Both tasks followed the RED/GREEN TDD flow: failing test committed
first (verified `TypeError: ... is not a function` / module-not-found failures), then the minimal
implementation committed second, both green.

One elaboration beyond the plan's literal instruction: `lib/admin/gate.test.ts` also covers `requireStaff()`'s
three discriminated-union branches and `verifyAdmin()`'s preserved shape/behavior (not just `getStaffRole()`),
since the plan's `<behavior>` bullets explicitly named those as required assertions. This required mocking
`createApiClient` (mirroring the existing pattern in `lib/split-sheets/attachment.test.ts`), which is a
standard, already-established test technique in this codebase — not a new pattern.

## Verification Results

- `npx jest lib/admin/gate.test.ts lib/staff/scope.test.ts` — 2 suites, 18 tests, all green.
- `npx tsc --noEmit` — clean.
- `npx eslint lib/admin/gate.ts lib/admin/gate.test.ts lib/staff/scope.ts lib/staff/scope.test.ts --max-warnings=0` — clean.
- Full repo suite (`npm test`) — 121 suites / 1472 tests, all green (no regressions).
- Manual grep: all 20 existing `/api/admin/*` (+ `app/(admin)/admin/deals/page.tsx`) call sites for
  `verifyAdmin` are unchanged files — this plan touched only `lib/admin/gate.ts` itself, so signature
  compatibility is preserved by construction.
- Grep confirms `EDITABLE_FIELDS` / `SECTION_VALUES` / `ACTION_TYPE_VALUES` / `KEY_REGEX` are still present
  and unchanged in `lib/admin/gate.ts`.

## Known Stubs

None.

## Threat Flags

None — this plan closes threats T-25-01, T-25-02, and T-25-13 from the plan's own threat model (closed
`StaffRole` enum, server-derived role, `is_admin` fallback grants no new privilege) rather than introducing
new surface. No new network endpoints, auth paths, or schema changes were made.

## Self-Check: PASSED

- FOUND: lib/admin/gate.ts
- FOUND: lib/admin/gate.test.ts
- FOUND: lib/staff/scope.ts
- FOUND: lib/staff/scope.test.ts
- FOUND commit d734fe1 (test: gate RED — getStaffRole)
- FOUND commit c7532e8 (test: gate RED — requireStaff/verifyAdmin)
- FOUND commit ce77dfb (feat: gate GREEN)
- FOUND commit 4103d3a (test: scope RED)
- FOUND commit 50ad509 (feat: scope GREEN)
