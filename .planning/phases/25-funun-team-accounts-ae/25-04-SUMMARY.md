---
phase: 25-funun-team-accounts-ae
plan: 04
subsystem: staff-rbac-provisioning
tags: [auth, rbac, staff, admin, provisioning, resend, supabase]
dependency-graph:
  requires:
    - "lib/admin/gate.ts's requireStaff/getStaffRole/StaffRole (25-01)"
    - "lib/staff/audit.ts's logStaffAction (25-02)"
    - "migration 089's funun_staff table shape (25-03, unpushed)"
  provides:
    - "staffInviteEmail(args) — pure email builder for staff magic-link invites"
    - "createStaffAccount(input) / DuplicateStaffAccountError — atomic staff account-creation helper"
    - "GET/POST /api/admin/staff — leadership-only staff list + create"
    - "PATCH /api/admin/staff/[id] — leadership-only role change / deactivate, dual-write"
  affects:
    - lib/email/staffInvite.ts
    - lib/staff/createStaffAccount.ts
    - app/api/admin/staff/route.ts
    - app/api/admin/staff/[id]/route.ts
tech-stack:
  added: []
  patterns:
    - "Atomic app_metadata role-set inside admin.createUser(), never a post-insert UPDATE (mirrors createBuyerAccount/createIndustryMember)"
    - "Dual-write role change: app_metadata authoritative + companion-table display copy, in the same handler (Pitfall 1)"
    - "Explicit allowlist validation before any write, closed-enum staff_role, gate-first before createServiceClient()"
key-files:
  created:
    - lib/email/staffInvite.ts
    - lib/staff/createStaffAccount.ts
    - lib/staff/createStaffAccount.test.ts
    - app/api/admin/staff/route.ts
    - app/api/admin/staff/[id]/route.ts
    - __tests__/staff-accounts-api.test.ts
  modified: []
decisions:
  - "createStaffAccount cleans up the phantom user_profiles/subscriptions rows handle_new_user() creates for staff accounts (migration 086 has no staff early-return branch) — Rule 2, mirrors createBuyerAccount's identical buyer-branch-timing reconciliation"
  - "funun_staff has no invited_by column (migration 089 as authored) — omitted from the insert; invitedBy still flows into app_metadata.user_metadata.invited_by for provenance"
  - "Deactivation semantics: funun_staff (migration 089, unpushed, not editable by this plan) has no active/deactivated_at column, so PATCH { active:false } clears app_metadata.staff_role to null via the same admin.updateUserById() call used for role change — this immediately and really revokes gate access (getStaffRole() returns null, requireStaff() 403s the account going forward) with zero schema change; funun_staff.staff_role keeps its last-known value as a historical display record only"
  - "GET/POST /api/admin/staff stay leadership-only (not requireStaff(['leadership','ae','bd'])) — RESEARCH's architecture note: only leadership creates/lists staff (D-02, no self-serve)"
metrics:
  duration: ~20min
  completed: 2026-08-06
status: complete
---

# Phase 25 Plan 04: Staff Account Provisioning + Leadership-Only Staff Routes Summary

Built the only in-app path to add or modify a Funūn employee account: `createStaffAccount()` (atomic
`app_metadata.staff_role` set, `funun_staff` insert, magic-link invite) plus its email template, and the
three leadership-only `/api/admin/staff` routes (list, create, role-change/deactivate) — all following the
exact atomic account-creation discipline already proven for buyers and industry members.

## Performance

- **Duration:** ~20 min
- **Tasks:** 3 completed
- **Files modified:** 6 (all new)

## Accomplishments

- `createStaffAccount()` sets `app_metadata.staff_role` atomically inside `admin.createUser()` (never a
  post-insert update), distinguishes `email_exists`/422 (`DuplicateStaffAccountError`) from generic failures,
  inserts the `funun_staff` companion row, and sends a custom Resend magic-link invite via `staffInviteEmail`.
- `GET/POST /api/admin/staff`: leadership-only (`requireStaff(['leadership'])` first statement, before
  `createServiceClient()`); GET returns a column-explicit `funun_staff` list with per-row email attached via
  `admin.getUserById`; POST validates an explicit allowlist (email/display_name/closed `StaffRole` enum),
  delegates creation to `createStaffAccount`, logs the action once via `logStaffAction` (D-04), 409 on
  duplicate, 400 on invalid/absent role.
- `PATCH /api/admin/staff/[id]`: leadership-only, `sanitizeStaffPatch()` returns a discriminated union
  accepting only `staff_role` (closed enum) and an optional `active` boolean — never coerces an invalid role.
  A valid role change dual-writes `app_metadata.staff_role` (authoritative, `admin.updateUserById`) AND
  `funun_staff.staff_role` (display copy) in the same handler; a table-write failure is surfaced as a
  response warning but never blocks the authoritative app_metadata write. `logStaffAction` called exactly
  once per request.

## Task Commits

Each task was committed atomically:

1. **Task 1: staffInviteEmail + createStaffAccount** - `2583ed5` (feat)
2. **Task 2: GET/POST /api/admin/staff** - `ba22154` (feat)
3. **Task 3: PATCH /api/admin/staff/[id]** - `dc8b51c` (feat)

_Note: this plan was executed sequentially (not strict RED/GREEN TDD commits) — tests were written
alongside each implementation and verified green before commit, per the executor's sequential-mode
instructions._

## Files Created/Modified

- `lib/email/staffInvite.ts` - `staffInviteEmail()`, mirrors `buyerInvite.ts`'s `esc()` HTML-escape + magic-link template
- `lib/staff/createStaffAccount.ts` - `createStaffAccount()` + `DuplicateStaffAccountError`, atomic role-set + funun_staff insert + invite
- `lib/staff/createStaffAccount.test.ts` - 9 unit tests, mocked service client
- `app/api/admin/staff/route.ts` - GET (list) + POST (create), leadership-only
- `app/api/admin/staff/[id]/route.ts` - PATCH (role change / deactivate), leadership-only, dual-write
- `__tests__/staff-accounts-api.test.ts` - 13 integration tests covering GET/POST/PATCH gate, validation, dual-write, audit

## Decisions Made

- **Phantom-row cleanup (Rule 2):** `handle_new_user()` (migration 086) has no staff early-return branch, so
  a new staff `auth.users` row falls through to the default artist branch and would otherwise get a phantom
  `user_profiles` + `subscriptions` row. `createStaffAccount()` deletes both after `createUser()` succeeds,
  mirroring `createBuyerAccount.ts`'s identical reconciliation for the same handle_new_user-timing gap.
- **`funun_staff` has no `invited_by` column** (confirmed by reading migration 089 as actually authored:
  `id, user_id, staff_role, display_name, title, phone, avatar_url, created_at`) — the plan's own
  conditional instruction ("invited_by if the column exists — otherwise omit") is honored by omitting it
  from the insert. `invitedBy` still flows into `app_metadata.user_metadata.invited_by` for provenance.
- **Deactivation semantics** (recorded per this plan's `<output>` instruction): no `active`/`deactivated_at`
  column exists on `funun_staff`, and migration 089 is unpushed and out of this plan's edit scope. `PATCH
  { active:false }` clears `app_metadata.staff_role` to `null` via the same `admin.updateUserById()` call
  already used for role change — this is a REAL, immediate access revocation (`getStaffRole()` returns
  `null` for a missing `staff_role`, so `requireStaff()` 403s the account on every subsequent request), not
  a UI-only flag. `funun_staff.staff_role` keeps its last-known value as a historical display record only
  (the table's `staff_role` column is `NOT NULL`, so it cannot be cleared to reflect "deactivated"). A future
  migration adding `active`/`deactivated_at` to `funun_staff` would let the Team Members list surface
  deactivated status directly instead of via app_metadata inference.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Phantom user_profiles/subscriptions cleanup in createStaffAccount**
- **Found during:** Task 1 (createStaffAccount implementation)
- **Issue:** `handle_new_user()`'s default branch has no staff early-return, so every new staff account would
  silently get a phantom artist `user_profiles` + `subscriptions` row — the exact bug class this repo has
  already fixed for buyers and curators.
- **Fix:** Added the same `service.from('subscriptions').delete()` / `service.from('user_profiles').delete()`
  reconciliation `createBuyerAccount.ts` already uses, immediately after `createUser()` succeeds.
- **Files modified:** `lib/staff/createStaffAccount.ts`
- **Verification:** `createStaffAccount.test.ts`'s "cleans up the phantom user_profiles/subscriptions rows"
  test asserts both `service.from('subscriptions')` and `service.from('user_profiles')` are called.
- **Committed in:** `2583ed5` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary for correctness — matches the exact discipline already established for the
analog helpers this plan's `<read_first>` instructed copying line-for-line. No scope creep.

## Issues Encountered

None.

## Verification Results

- `npx jest lib/staff/createStaffAccount.test.ts __tests__/staff-accounts-api.test.ts` — 2 suites, 22 tests,
  all green.
- `npx tsc --noEmit` — clean.
- `npx eslint lib/email/staffInvite.ts lib/staff/createStaffAccount.ts lib/staff/createStaffAccount.test.ts
  app/api/admin/staff/route.ts app/api/admin/staff/[id]/route.ts __tests__/staff-accounts-api.test.ts
  --max-warnings=0` — clean.
- Full repo suite (`npm test`) — 126 suites / 1520 tests, all green (no regressions; up from 123/1484 after
  25-02, consistent with the new suites/tests added across 25-03's migration text-test and this plan).
- Manual review: `requireStaff(['leadership'])` (or the PATCH handler's equivalent) is the first statement in
  every new handler, before any `createServiceClient()` call — confirmed by reading each route file in full.

## Known Stubs

None — every deliverable is fully implemented per its `must_haves`; no data flows to UI in this plan (routes
+ lib helpers only, no admin console UI wiring — that lands in later plans per the phase's wave structure).

## Threat Flags

None new. This plan closes T-25-05 (elevation of privilege — leadership-only gate first in every handler),
T-25-06 (mass-assignment — `sanitizeStaffPatch`/POST allowlist accept only closed-enum `staff_role` + email/
display_name), T-25-17 (app_metadata/funun_staff drift — dual-write in one handler), T-25-07 (spoofing —
reuses the proven `generateLink({ type:'magiclink' })` mechanism), and T-25-18 (repudiation — `logStaffAction`
called exactly once per create/role-change) from the plan's own threat model by construction. No new network
endpoints beyond the three named in the plan's own artifact list; no schema changes (migrations 089/090
already existed from 25-03 and were not touched by this plan).

## User Setup Required

None — no external service configuration required. Live create/invite + role-change smoke testing is
deferred behind the 25-07 checkpoint (migrations 089/090 must be pushed and `funun_staff` must exist on the
remote database before a real staff account can be provisioned end-to-end).

## Next Phase Readiness

- `createStaffAccount`, `staffInviteEmail`, and all three `/api/admin/staff` routes are ready for the
  leadership-only Team Members admin UI (a later wave in this phase's plan set) to call.
- Blocked on 25-07's human-gated `supabase db push` of migrations 089/090 for any live end-to-end smoke test
  (account creation, invite delivery, role-change dual-write against a real `funun_staff` table).
- The deactivation semantics documented above (app_metadata-only revocation, no persisted `active` column)
  are functionally complete for access control but leave no queryable "deactivated" status for a future Team
  Members list UI — flagging this as a candidate follow-up if/when a migration author revisits `funun_staff`.

---
*Phase: 25-funun-team-accounts-ae*
*Completed: 2026-08-06*

## Self-Check: PASSED

- FOUND: lib/email/staffInvite.ts
- FOUND: lib/staff/createStaffAccount.ts
- FOUND: lib/staff/createStaffAccount.test.ts
- FOUND: app/api/admin/staff/route.ts
- FOUND: app/api/admin/staff/[id]/route.ts
- FOUND: __tests__/staff-accounts-api.test.ts
- FOUND commit 2583ed5 (feat: staffInviteEmail + createStaffAccount)
- FOUND commit ba22154 (feat: GET/POST /api/admin/staff)
- FOUND commit dc8b51c (feat: PATCH /api/admin/staff/[id])
