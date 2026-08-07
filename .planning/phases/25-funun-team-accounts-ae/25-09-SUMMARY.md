---
phase: 25-funun-team-accounts-ae
plan: 09
subsystem: staff-rbac-buyer-orgs
tags: [rbac, staff, buyer-orgs, ae-assignment, notifications, nextjs]

requires:
  - phase: 25-funun-team-accounts-ae (25-02)
    provides: "logStaffAction write-through audit helper, buildAeAssignedNotification pure builder"
  - phase: 25-funun-team-accounts-ae (25-05)
    provides: "PATCH /api/admin/buyer-orgs/[id]/ae (leadership-only AE assignment write path)"
  - phase: 25-funun-team-accounts-ae (25-06)
    provides: "app/(admin)/admin/buyer-orgs/page.tsx + BuyerOrgsAdmin.tsx (the Client Partners admin list)"
  - phase: 25-funun-team-accounts-ae (25-08)
    provides: "Team Console theme tokens (--ink/--ink-2/--ink-3/--panel-2/--border/--indigo/--rose-fg)"
provides:
  - "buildAeUnassignedNotification (lib/staff/notifications.ts) — pure builder for the losing AE"
  - "Reassignment-aware PATCH /api/admin/buyer-orgs/[id]/ae — reads prior ae_user_id before writing, notifies both the gaining and losing AE on a genuine reassignment"
  - "Leadership-only per-row AE reassign control on the Client Partners admin list (BuyerOrgsAdmin.tsx)"
affects: [phase-23-buyer-onboarding]

tech-stack:
  added: []
  patterns:
    - "Read-then-write in one handler: the prior ae_user_id is SELECTed before the UPDATE, in the same request, to compute a 'changed away from a different AE' predicate"
    - "New UI added to an otherwise-untouched legacy dark-only component is styled with the Team Console tokens (25-08) individually, rather than a full-file retheme"

key-files:
  created: []
  modified:
    - "lib/staff/notifications.ts"
    - "app/api/admin/buyer-orgs/[id]/ae/route.ts"
    - "__tests__/staff-buyer-orgs-api.test.ts"
    - "app/(admin)/admin/buyer-orgs/page.tsx"
    - "components/admin/BuyerOrgsAdmin.tsx"

key-decisions:
  - "changedAwayFromPrevAe = prevAeUserId !== null && prevAeUserId !== aeUserId — a single predicate covers reassign (A->B), unassign-with-prior-AE (A->null), and same-AE re-confirm (A->A stays a no-op for the unassigned notification) without branching per case"
  - "app/(admin)/admin/buyer-orgs/page.tsx's self-guard switched from the inline is_admin check to getStaffRole(user)==='leadership', matching the 25-06 team-members/page.tsx convention — the page stays leadership-only (unchanged scope); AE/BD already have their own scoped queue at /admin/my-client-partners"
  - "The AE pool for the reassign picker's OPTIONS is funun_staff filtered to staff_role='ae'; a separate full-staff name lookup resolves an org's CURRENT ae_user_id to a display name even if that staffer's role has since changed, so a stale assignment still renders a name instead of a blank"
  - "The reassign control's new markup uses Team Console tokens (var(--ink)/var(--ink-2)/var(--ink-3)/var(--border)/var(--panel-2)/var(--indigo)/var(--rose-fg)); the rest of BuyerOrgsAdmin.tsx is left on its existing legacy dark-only classes, matching 25-08's explicit decision that a full retheme of this legacy page is a follow-on, not this plan's scope"

patterns-established:
  - "A per-row inline reassign/error state pair (reassigningId + reassignError/reassignErrorOrgId) scoped by org id, mirroring MyCompanies.tsx's per-row edit state shape"

requirements-completed: [TEAM-04, TEAM-07]

coverage:
  - id: D1
    description: "PATCH /api/admin/buyer-orgs/[id]/ae reads the prior ae_user_id before writing; reassigning A->B notifies BOTH the new AE (ae_assigned) and the previous AE (ae_unassigned)"
    requirement: "TEAM-04"
    verification:
      - kind: unit
        ref: "__tests__/staff-buyer-orgs-api.test.ts#reads the prior ae_user_id before writing, then reassigning from one AE to another notifies BOTH the new and the previous AE"
        status: pass
    human_judgment: false
  - id: D2
    description: "A first assignment (prior null) notifies only the new AE; unassigning an org that had a prior AE notifies only the previous AE; reassigning to the same AE it already has stays a single ae_assigned notification (no spurious unassign)"
    requirement: "TEAM-04"
    verification:
      - kind: unit
        ref: "__tests__/staff-buyer-orgs-api.test.ts#leadership assigning an AE sets ae_user_id, logs assign_ae, and notifies the AE; returns 200"
        status: pass
      - kind: unit
        ref: "__tests__/staff-buyer-orgs-api.test.ts#unassigning an org that had a prior AE notifies only the previous AE"
        status: pass
      - kind: unit
        ref: "__tests__/staff-buyer-orgs-api.test.ts#reassigning an org to the SAME AE it already has notifies the AE again but not as unassigned"
        status: pass
    human_judgment: false
  - id: D3
    description: "logStaffAction('assign_ae') is called exactly once per reassignment (the existing 25-05 audit path, reused, not duplicated)"
    requirement: "TEAM-04"
    verification:
      - kind: unit
        ref: "__tests__/staff-buyer-orgs-api.test.ts#reads the prior ae_user_id before writing, then reassigning from one AE to another notifies BOTH the new and the previous AE (logStaffAction toHaveBeenCalledTimes(1) assertion)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Leadership sees a current-AE column and a reassign picker (AE pool from funun_staff staff_role='ae' + an Unassign option) on the Client Partners admin list; the picker PATCHes /api/admin/buyer-orgs/[id]/ae and updates the row inline"
    requirement: "TEAM-07"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (clean) + npx eslint (clean) + npm run build (exit 0, /admin/buyer-orgs compiled)"
        status: pass
    human_judgment: true
    rationale: "No DOM/browser test harness in this repo (jest testEnvironment: node) to click the picker and assert the row updates — the component's fetch/state logic is code-reviewed and type-checked, but the actual reassign flow against a live funun_staff/buyer_orgs table (migrations 089/090 still unpushed) requires a live leadership session, deferred to the phase's standing 25-07 post-push checkpoint."
  - id: D5
    description: "The reassign control is leadership-only — the /ae route stays requireStaff(['leadership']) (already true pre-plan) and the page itself is leadership-gated (getStaffRole(user)==='leadership'), so an AE/BD forged request still 403s and an AE/BD navigating to the page is bounced"
    requirement: "TEAM-07"
    verification:
      - kind: unit
        ref: "__tests__/staff-buyer-orgs-api.test.ts#returns 403 for an AE/BD caller — assignment is leadership-only (D-03)"
        status: pass
      - kind: other
        ref: "Manual code read of app/(admin)/admin/buyer-orgs/page.tsx — if (!isLeadership) redirect('/') before any data fetch, unchanged scope from pre-plan is_admin gate"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-08-07
status: complete
---

# Phase 25 Plan 09: Leadership AE Reassignment (Reassignment-Aware Route + UI Control) Summary

Made the existing leadership-only `/ae` route reassignment-aware (reads the prior AE before writing,
notifies both the gaining and losing AE on a genuine handoff) and shipped the Leadership reassign UI —
a per-row Account Exec column and picker — on the Client Partners admin list.

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 completed
- **Files modified:** 5 (3 for Task 1, 2 for Task 2)

## Accomplishments

- `buildAeUnassignedNotification` added to `lib/staff/notifications.ts`, mirroring
  `buildAeAssignedNotification`'s exact shape for the losing AE ("A Client Partner was reassigned
  away from you").
- `PATCH /api/admin/buyer-orgs/[id]/ae` now reads `ae_user_id` BEFORE the update, in the same
  handler, and computes `changedAwayFromPrevAe = prevAeUserId !== null && prevAeUserId !== aeUserId`.
  On a genuine reassignment (A→B) both AEs are notified; a first assignment (prior null) notifies
  only the new AE; an unassign of a previously-assigned org notifies only the previous AE; a
  same-AE re-confirm (A→A) stays a single `ae_assigned` notification with no spurious unassign.
  `logStaffAction('assign_ae')` is still called exactly once per write — the audit path is reused,
  not duplicated.
- `app/(admin)/admin/buyer-orgs/page.tsx`'s self-guard switched from the inline `is_admin` check to
  `getStaffRole(user) === 'leadership'`, matching the 25-06 `team-members/page.tsx` convention. The
  page now also reads the AE pool (`funun_staff` where `staff_role='ae'`) and each org's
  `ae_user_id`, resolving a display name for whoever the org's current AE is (even if that
  staffer's role has since changed) via a separate full-staff lookup.
- `components/admin/BuyerOrgsAdmin.tsx` gained a per-row "Account Exec" column: leadership sees a
  `<select>` of the AE pool plus an "Unassign" option that PATCHes
  `/api/admin/buyer-orgs/[id]/ae` on change and updates the row's `aeUserId`/`aeName` inline,
  surfacing per-org errors below the row; non-leadership renders the assigned AE's name read-only
  (defense in depth — the page itself already blocks non-leadership from reaching this component
  at all). The new markup uses the Team Console tokens (25-08) so it reads in both light and dark;
  the rest of the component's pre-existing legacy dark-only markup is untouched, matching 25-08's
  documented decision that a full retheme of this legacy page is a follow-on.

## Task Commits

Both tasks were committed atomically:

1. **Task 1: Make the /ae route reassignment-aware (notify both AEs)** - `d70c070` (feat)
2. **Task 2: Leadership reassign control on the Client Partners admin list** - `616f52c` (feat)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `lib/staff/notifications.ts` - added `buildAeUnassignedNotification`
- `app/api/admin/buyer-orgs/[id]/ae/route.ts` - reads prior `ae_user_id`, notifies both AEs on a
  genuine reassignment
- `__tests__/staff-buyer-orgs-api.test.ts` - extended `mockAssignService` with a prior-read select
  chain; added reassign-both, unassign-with-prior-AE, and same-AE-reconfirm test cases
- `app/(admin)/admin/buyer-orgs/page.tsx` - `getStaffRole` self-guard, AE pool + current-AE read
- `components/admin/BuyerOrgsAdmin.tsx` - `AePoolOption` type, `isLeadership`/`aePool` props,
  per-row Account Exec column + reassign picker + inline error state

## Decisions Made

- `changedAwayFromPrevAe` is a single predicate (`prevAeUserId !== null && prevAeUserId !== aeUserId`)
  covering reassign, unassign-with-prior-AE, and same-AE re-confirm — no per-case branching needed.
- `app/(admin)/admin/buyer-orgs/page.tsx` stays leadership-only (scope unchanged from pre-plan) —
  the plan's own instruction to gate on `getStaffRole(user) === 'leadership'` is satisfied by the
  page-level redirect itself; AE/BD already have `/admin/my-client-partners` (25-06) as their
  scoped queue, so widening this full unscoped list to them was out of scope for this plan.
- The reassign picker's OPTIONS come strictly from `funun_staff` rows with `staff_role='ae'`
  (must_haves truth), while the CURRENT-AE display name is resolved from the full staff list so a
  formerly-AE staffer whose role has since changed still shows a real name rather than a blank —
  a minor robustness addition beyond the plan's literal wording, not a scope change.
- New reassign-control markup uses Team Console tokens (`var(--ink)` family); the rest of
  `BuyerOrgsAdmin.tsx` (create-org form, member list, etc.) is left exactly as it was pre-plan —
  full retheme of this legacy page is 25-08's documented follow-on, not this plan's job.

## Deviations from Plan

None - plan executed exactly as written. All acceptance criteria satisfied without any Rule 1/2/3
auto-fixes and no Rule 4 architectural questions.

## Issues Encountered

None.

## Verification Results

- `npx jest __tests__/staff-buyer-orgs-api.test.ts -t "assign"` — 10 passed, 12 skipped (filter
  matched only "assign"-named tests; run again unfiltered below).
- `npx jest __tests__/staff-buyer-orgs-api.test.ts` (full file) — 22 passed, 22 total.
- `npx tsc --noEmit` — clean.
- `npx eslint "app/(admin)/admin/buyer-orgs/page.tsx" "components/admin/BuyerOrgsAdmin.tsx"` —
  clean, zero warnings.
- `npm run build` — exit 0; `/admin/buyer-orgs` compiled.
- `npm test` (full repo suite) — 127 suites / 1542 tests, all green, no regressions.

## Known Stubs

None.

## Threat Flags

None new. This plan closes T-25-15 (Elevation of Privilege — AE/BD self-assigning via a forged
reassign request) by construction: the `/ae` route was already `requireStaff(['leadership'])`
pre-plan and stays so; the new UI control only renders reachably behind the page's own
leadership-only redirect. T-25-16 (Repudiation) is satisfied — `logStaffAction('assign_ae')` fires
exactly once per write, covering reassignment the same as a fresh assignment. T-25-17 (Information
Disclosure via notifying the wrong/previous AE) is satisfied — both notification payloads carry
only `orgId`/`orgName`, and the previous AE's scoped read access ends at the same write
(`ae_user_id` no longer matches their id) that triggers their notification. No new network
endpoints, auth paths, or schema changes were introduced — this plan is entirely new application
code over the already-audited `/ae` write path and the already-gated Client Partners admin page.

## User Setup Required

None — no external service configuration required. Live verification (a real leadership account
reassigning a real Client Partner, confirming both AE inboxes receive their notification and a
`staff_audit_log` `assign_ae` row is written) remains deferred behind the phase's standing 25-07
checkpoint, which pushes migrations 089/090 (`funun_staff`, `staff_audit_log`,
`buyer_orgs.ae_user_id`) live — the same deferral pattern already recorded at 25-05/25-06/25-08.

## Next Phase Readiness

- The reassignment-aware `/ae` route and its notify-both behavior are shipped, unit-tested, and
  reuse the existing single `assign_ae` audit path — no new endpoint was created.
- The Client Partners admin list now has a working (type-checked, build-clean) leadership reassign
  UI; live click-through verification is gated behind the 25-07 migration push, consistent with
  every other Phase 25 UI plan's deferral (25-06, 25-08).
- REQUIREMENTS.md still has no Phase 25 section registering TEAM-04/TEAM-07 (`requirements
  mark-complete` will report `not_found`) — same pre-existing documentation gap noted at
  25-03/25-04/25-05/25-06/25-08 and Phases 16/22/28 in STATE.md; deferred to a future
  `/gsd-docs-update` pass, not fixed by this executor.
- 25-10 (Team Member Directory) is unaffected by this plan and can proceed independently.

---
*Phase: 25-funun-team-accounts-ae*
*Completed: 2026-08-07*

## Self-Check: PASSED

- FOUND: lib/staff/notifications.ts
- FOUND: app/api/admin/buyer-orgs/[id]/ae/route.ts
- FOUND: app/(admin)/admin/buyer-orgs/page.tsx
- FOUND: components/admin/BuyerOrgsAdmin.tsx
- FOUND: __tests__/staff-buyer-orgs-api.test.ts
- FOUND commit d70c070 (feat: reassignment-aware /ae route, notify both AEs)
- FOUND commit 616f52c (feat: leadership reassign control on Client Partners admin list)
