---
phase: 25-funun-team-accounts-ae
plan: 05
subsystem: staff-rbac-buyer-orgs
tags: [rbac, staff, buyer-orgs, audit, notifications, assignment-scoping]

requires:
  - phase: 25-funun-team-accounts-ae (25-01)
    provides: "getStaffRole/requireStaff gate, isAssignedToOrg predicate"
  - phase: 25-funun-team-accounts-ae (25-02)
    provides: "logStaffAction write-through audit helper, buildAeAssignedNotification/resolveLeadRecipient builders"
provides:
  - "PATCH /api/admin/buyer-orgs/[id] — assignment-scoped, field-allowlisted, audited buyer-org edit"
  - "PATCH /api/admin/buyer-orgs/[id]/ae — leadership-only AE (re)assignment with audit + AE notification"
  - "POST /api/admin/buyer-orgs widened to requireStaff(['leadership','ae','bd']); create_buyer_account audited"
  - "GET /api/admin/buyer-orgs scoped by ae_user_id for non-leadership staff"
affects: [25-06, 25-09, phase-23-buyer-onboarding]

tech-stack:
  added: []
  patterns:
    - "Assignment-scope check gates BOTH the read (GET list) and the write (PATCH) — never one without the other"
    - "requireStaff() is the first statement in every handler, before createServiceClient()"
    - "Mass-assignment allowlist loop (STAFF_EDITABLE_BUYER_ORG_FIELDS) mirrors app/api/profile/route.ts's EDITABLE_FIELDS"

key-files:
  created:
    - "app/api/admin/buyer-orgs/[id]/route.ts"
    - "app/api/admin/buyer-orgs/[id]/ae/route.ts"
    - "__tests__/staff-buyer-orgs-api.test.ts"
  modified:
    - "app/api/admin/buyer-orgs/route.ts"

key-decisions:
  - "STAFF_EDITABLE_BUYER_ORG_FIELDS = ['name'] only for v1 (A3) — the only non-audit, non-system column on buyer_orgs today; Phase 23 is expected to add company-profile columns for staff to edit later"
  - "Scope denial on PATCH /api/admin/buyer-orgs/[id] returns 404 (not 403), for both an unassigned-to-this-AE org and a nonexistent org id — avoids leaking org existence to a staff caller"
  - "ae_user_id is never in the edit allowlist — AE assignment lives exclusively on the leadership-only .../ae route, closing the AE-self-assignment threat (T-25-19)"
  - "AE-assignment notification is best-effort (.catch(() => {})) after the primary write/audit — never blocks the PATCH response; unassign (ae_user_id: null) skips the notification entirely"

patterns-established:
  - "Scoped listing pattern: GET query built as select().order() then conditionally .eq('ae_user_id', caller) appended for non-leadership — read path scoped identically to the write path (Pitfall 4)"

requirements-completed: [TEAM-04, TEAM-06]

coverage:
  - id: D1
    description: "PATCH /api/admin/buyer-orgs/[id] — leadership edits any org; an AE edits only an org they are assigned to; an unassigned AE gets 404, writes nothing"
    requirement: "TEAM-04"
    verification:
      - kind: unit
        ref: "__tests__/staff-buyer-orgs-api.test.ts#PATCH /api/admin/buyer-orgs/[id] — scoped, allowlisted, audited edit"
        status: pass
    human_judgment: false
  - id: D2
    description: "PATCH body allowlist — only `name` ever reaches the buyer_orgs update; verified/ae_user_id/is_personal are silently ignored"
    requirement: "TEAM-04"
    verification:
      - kind: unit
        ref: "__tests__/staff-buyer-orgs-api.test.ts#never writes non-allowlisted fields (verified, ae_user_id, is_personal)"
        status: pass
    human_judgment: false
  - id: D3
    description: "PATCH /api/admin/buyer-orgs/[id]/ae — leadership-only AE (re)assignment, UUID-validated, audited, and notifies the newly-assigned AE"
    requirement: "TEAM-06"
    verification:
      - kind: unit
        ref: "__tests__/staff-buyer-orgs-api.test.ts#PATCH /api/admin/buyer-orgs/[id]/ae — leadership-only AE assignment + notify"
        status: pass
    human_judgment: false
  - id: D4
    description: "POST /api/admin/buyer-orgs widened so leadership/AE/BD can all create Client Partner accounts, audited as create_buyer_account; GET listing scoped to ae_user_id for non-leadership callers, unscoped for leadership"
    requirement: "TEAM-04"
    verification:
      - kind: unit
        ref: "__tests__/staff-buyer-orgs-api.test.ts#POST /api/admin/buyer-orgs — widened staff-create gate"
        status: pass
      - kind: unit
        ref: "__tests__/staff-buyer-orgs-api.test.ts#GET /api/admin/buyer-orgs — scoped listing for non-leadership"
        status: pass
    human_judgment: false
  - id: D5
    description: "Live cross-account scope smoke test on the real DB (AE cannot touch an unassigned org) — deferred behind migrations 089/090's push per the plan's own verification section"
    verification: []
    human_judgment: true
    rationale: "Requires the live ae_user_id column (migration 090, currently unpushed/human-gated) plus a real second AE account — not exercisable from a mocked unit test; deferred to the 25-07 checkpoint per plan instruction."

duration: ~20min
completed: 2026-08-07
status: complete
---

# Phase 25 Plan 05: Assignment-Scoped Buyer-Org Editing + AE Assignment Summary

Shipped assignment-scoped and field-allowlisted buyer-org editing, a leadership-only AE
(re)assignment route with audit + AE notification, and widened buyer-account creation to all
permissioned staff — all on the existing service-role write path with zero new RLS.

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-07T00:38:00Z (approx, first file read)
- **Completed:** 2026-08-07T00:58:06Z
- **Tasks:** 3
- **Files modified:** 4 (2 new routes, 1 modified route, 1 test file grown across all 3 tasks)

## Accomplishments

- `PATCH /api/admin/buyer-orgs/[id]` — leadership edits any Client Partner org; AE/BD edit only
  an org where `ae_user_id === caller` (via `isAssignedToOrg`, 404-not-403 on denial); writes are
  restricted to `STAFF_EDITABLE_BUYER_ORG_FIELDS = ['name']`; every successful edit is audited via
  `logStaffAction`.
- `PATCH /api/admin/buyer-orgs/[id]/ae` — leadership-only AE (re)assignment; accepts a UUID
  (assign) or `null` (unassign); non-UUID rejected with 400 before any write; assignment is
  audited (`assign_ae`) and, on a fresh assignment, best-effort notifies the AE via
  `buildAeAssignedNotification` + `createNotification`.
- `POST /api/admin/buyer-orgs` widened from `verifyAdmin()` (leadership-only) to
  `requireStaff(['leadership','ae','bd'])` so permissioned staff can create Client Partner
  accounts (D-03); every successful creation now logs `create_buyer_account`.
- `GET /api/admin/buyer-orgs` widened to `requireStaff()` with the read path scoped identically
  to the write path: non-leadership callers get `.eq('ae_user_id', caller)` appended to the
  query; leadership stays unscoped (Pitfall 4 — never widen a list read without adding the same
  scope filter the write already has).

## Task Commits

Each task followed the RED → GREEN TDD flow:

1. **Task 1: PATCH /api/admin/buyer-orgs/[id]** — `20134e3` (test, RED) → `653a8b4` (feat, GREEN)
2. **Task 2: PATCH /api/admin/buyer-orgs/[id]/ae** — `73a7b64` (test, RED) → `2493e1a` (feat, GREEN)
3. **Task 3: widen POST + scope GET** — `024dc17` (test, RED) → `6ddfd10` (feat, GREEN)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `app/api/admin/buyer-orgs/[id]/route.ts` — new PATCH handler: scope check, field-allowlist
  loop, service-role update, unconditional `logStaffAction`.
- `app/api/admin/buyer-orgs/[id]/ae/route.ts` — new PATCH handler: leadership-only, UUID
  validation, service-role update, audit, best-effort AE notification.
- `app/api/admin/buyer-orgs/route.ts` — GET/POST gates widened from `verifyAdmin()` to
  `requireStaff(...)`; GET query conditionally scoped by `ae_user_id`; POST now audits creation.
- `__tests__/staff-buyer-orgs-api.test.ts` — new file, grown across all three tasks; 19 tests
  covering every `<behavior>` bullet in the plan (edit scoping, allowlist, AE assignment/notify,
  widened create, scoped list, and the 401/403 gate paths).

## Decisions Made

- `STAFF_EDITABLE_BUYER_ORG_FIELDS = ['name']` is the v1 allowlist (per the plan's own A3
  reference) — flagged in-code and here for Phase 23 to extend once company-profile columns land.
- Scope denial on the edit route returns 404 for both "org exists but not mine" and "org doesn't
  exist" — a single `isAssignedToOrg(orgRow, callerId)` check after one `maybeSingle()` fetch,
  never distinguishing the two cases in the response.
- `ae_user_id` is deliberately absent from the edit route's allowlist — the only write path to
  that column is the leadership-only `.../ae` route, closing the AE-self-assignment threat
  (T-25-19) by construction rather than by an extra runtime check.
- The AE-assignment notification uses `.catch(() => {})` after the `await` — matches
  `lib/social/activity-emit.ts`'s "never block on a best-effort side effect" convention already
  established in this codebase and referenced by 25-PATTERNS.md.

## Deviations from Plan

None — plan executed exactly as written. All three tasks followed the plan's literal action
descriptions; no Rule 1/2/3 auto-fixes and no Rule 4 architectural questions arose.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. Migrations 089/090 (which this plan's
`ae_user_id`/`staff_audit_log`/`funun_staff` reads depend on) remain unpushed/human-gated per
Wave 2's standing convention (25-03); this plan only writes application code against those
already-drafted schema objects and does not touch the migration files.

## Next Phase Readiness

- All three buyer-org staff routes are shipped, tested, and audited — 25-06 (Team Console shell)
  and 25-09 (leadership reassign control, reusing this plan's `.../ae` route) can build directly
  on top.
- Live cross-account scope smoke test (AE genuinely blocked from an unassigned org on the real
  DB) remains deferred behind the 25-07 checkpoint that pushes migrations 089/090 — recorded as
  coverage item D5 above, not silently dropped.
- REQUIREMENTS.md still has no Phase 25 section registering TEAM-04/TEAM-06 (same pre-existing
  documentation gap noted at 25-03/25-04 and Phases 16/22/28 in STATE.md) — `requirements
  mark-complete` will report `not_found`; deferred to a future `/gsd-docs-update` pass, not fixed
  by this executor.

---
*Phase: 25-funun-team-accounts-ae*
*Completed: 2026-08-07*
