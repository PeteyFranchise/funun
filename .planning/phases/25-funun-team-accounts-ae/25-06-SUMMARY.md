---
phase: 25-funun-team-accounts-ae
plan: 06
subsystem: staff-rbac-admin-surface
tags: [rbac, staff, admin, nextjs, sidebar, buyer-orgs]

requires:
  - phase: 25-funun-team-accounts-ae (25-01)
    provides: "getStaffRole/requireStaff gate (lib/admin/gate.ts)"
  - phase: 25-funun-team-accounts-ae (25-04)
    provides: "GET/POST /api/admin/staff, PATCH /api/admin/staff/[id]"
  - phase: 25-funun-team-accounts-ae (25-05)
    provides: "PATCH /api/admin/buyer-orgs/[id] (scoped edit), scoped GET /api/admin/buyer-orgs"
provides:
  - "app/(admin)/layout.tsx admits any staff role (getStaffRole !== null); role-aware sidebar"
  - "/admin/team-members — leadership-only Team Members management UI"
  - "/admin/my-client-partners — AE/BD work queue, scoped by ae_user_id"
affects: [25-08, 25-09, 25-10]

tech-stack:
  added: []
  patterns:
    - "Layout gate widening never stands alone — every leadership-only page keeps its own inline self-guard (Pitfall 3)"
    - "Read-side scope mirrors the write-side scope exactly (Pitfall 4) — my-client-partners' GET .eq(ae_user_id) matches the existing scoped PATCH/GET API routes"

key-files:
  created:
    - "app/(admin)/admin/team-members/page.tsx"
    - "components/admin/StaffAdmin.tsx"
    - "app/(admin)/admin/my-client-partners/page.tsx"
    - "components/admin/MyCompanies.tsx"
  modified:
    - "app/(admin)/layout.tsx"

key-decisions:
  - "Sidebar wraps every pre-existing leadership-only link plus the new Team Members link in a single isLeadership conditional; My Client Partners and Directory (route stubbed for 25-10) render unconditionally for all staff"
  - "Buyer Orgs sidebar link relabeled 'Client Partners' per the phase's locked naming decision — route (/admin/buyer-orgs) and internal identifiers left unchanged"
  - "Pre-flight + post-build grep (is_admin|getStaffRole across every app/(admin)/**/page.tsx) confirmed every existing admin page already carries its own leadership self-guard — no page needed one added"
  - "MyCompanies' inline editor writes only the existing PATCH /api/admin/buyer-orgs/[id] allowlist (name); 404 (scope denial) and 400 (validation) responses are surfaced verbatim to the caller rather than swallowed"

patterns-established:
  - "Team Console surfaces (25-08+) will mount inside this same widened layout — no new route group introduced (D-01)"

requirements-completed: [TEAM-07, TEAM-06]

coverage:
  - id: D1
    description: "app/(admin)/layout.tsx admits any staff role (getStaffRole(user) !== null) and redirects non-staff to '/'; leadership-tier via the is_admin fallback still passes"
    requirement: "TEAM-07"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (clean) + npx eslint app/(admin)/layout.tsx (clean) + npm run build (exit 0, /admin/my-client-partners and /admin/team-members both compiled)"
        status: pass
    human_judgment: true
    rationale: "No test file exercises getStaffRole's three-branch redirect behavior against a live session; live AE/BD navigation smoke is explicitly deferred to the 25-07 post-push checkpoint per this plan's own <verification> section (migrations 089/090 must be pushed first)."
  - id: D2
    description: "Sidebar is role-aware: leadership-only links (including the new Team Members link) hidden from AE/BD; My Client Partners + Directory render for every staff role"
    requirement: "TEAM-07"
    verification:
      - kind: other
        ref: "Manual code read of app/(admin)/layout.tsx — isLeadership conditional wraps all 11 pre-existing leadership links + Team Members; My Client Partners/Directory sit outside the conditional"
        status: pass
    human_judgment: true
    rationale: "Visual/role-branch verification requires a live AE/BD session, deferred to the 25-07 checkpoint alongside D1."
  - id: D3
    description: "/admin/team-members is leadership-only, lists Team Members via funun_staff + per-row email, and its create form calls POST /api/admin/staff"
    requirement: "TEAM-07"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (clean) + npm run build (route /admin/team-members compiled, 1.78 kB)"
        status: pass
    human_judgment: true
    rationale: "No jest coverage for this page/component pair (UI-only plan, no test task specified); functional behavior against a live funun_staff table is deferred to the 25-07 checkpoint."
  - id: D4
    description: "/admin/my-client-partners lists only Client Partners assigned to the caller (ae_user_id === caller) for non-leadership; leadership sees all"
    requirement: "TEAM-06"
    verification:
      - kind: other
        ref: "Manual code read of app/(admin)/admin/my-client-partners/page.tsx — .eq('ae_user_id', user.id) conditionally appended when role !== 'leadership', mirroring the already-tested scoped GET /api/admin/buyer-orgs (25-05, __tests__/staff-buyer-orgs-api.test.ts)"
        status: pass
    human_judgment: true
    rationale: "Live cross-account scoping smoke (a real AE seeing only their assigned org) requires migration 090's ae_user_id column pushed live plus a second real AE account — deferred to 25-07 per this plan's own <verification> section."
  - id: D5
    description: "Every existing leadership-only admin page keeps its own inline leadership self-guard (Pitfall 3) — grep over app/(admin)/**/page.tsx returns no page lacking one"
    requirement: "TEAM-07"
    verification:
      - kind: other
        ref: "grep -rL 'is_admin|getStaffRole' app/(admin)/admin/*/page.tsx app/(admin)/*/page.tsx — empty output (pass)"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-08-07
status: complete
---

# Phase 25 Plan 06: Admin Gate Widening + Team Members + My Client Partners Summary

Widened `app/(admin)/layout.tsx`'s admin gate from binary `is_admin` to any staff role with a
role-aware sidebar, and shipped the two new admin surfaces the widened gate exists to serve:
`/admin/team-members` (leadership-only staff management) and `/admin/my-client-partners`
(the AE/BD scoped work queue).

## Performance

- **Duration:** ~25 min
- **Tasks:** 3 completed
- **Files modified:** 5 (1 modified, 4 new)

## Accomplishments

- `app/(admin)/layout.tsx` now calls `getStaffRole(user)` (from `lib/admin/gate.ts`, 25-01) instead
  of an inline `is_admin` check; redirects to `/` only when the resolved role is `null`. All 11
  pre-existing leadership-only sidebar links plus the new "Team Members" link are wrapped in a
  single `isLeadership` conditional; "My Client Partners" and "Directory" (route stubbed ahead of
  25-10) render for every staff role.
- `/admin/team-members` — a leadership-only server component (self-guarded independently of the
  layout) that reads `funun_staff` via the service client with per-row email attached, rendering
  the new `StaffAdmin` client component: a list (email · role · joined) and a create form (email,
  display name, role select over `leadership`/`ae`/`bd`) posting to the existing `POST
  /api/admin/staff` (25-04), surfacing 400/409 errors inline.
- `/admin/my-client-partners` — a server component admitting any staff role, reading `buyer_orgs`
  scoped by `.eq('ae_user_id', user.id)` for non-leadership callers (leadership unscoped) — the
  read-side twin of the already-shipped scoped `GET /api/admin/buyer-orgs` (25-05). Renders the new
  `MyCompanies` client component: assigned Client Partners with an inline name editor PATCHing the
  existing `PATCH /api/admin/buyer-orgs/[id]` (25-05), surfacing the 404 scope-denial and 400
  validation responses.
- Confirmed via `grep -rL 'is_admin|getStaffRole' app/(admin)/admin/*/page.tsx app/(admin)/*/page.tsx`
  (both before and after this plan's changes) that every existing admin page already carries its own
  leadership self-guard — no page needed one added (Pitfall 3 closed by construction, not by new work).

## Task Commits

Each task was committed atomically:

1. **Task 1: Widen `app/(admin)/layout.tsx` gate + role-aware sidebar** - `0cbbca1` (feat)
2. **Task 2: `/admin/team-members` page + `StaffAdmin` component** - `f4336c7` (feat)
3. **Task 3: `/admin/my-client-partners` work queue + self-guard confirmation** - `c2207b4` (feat)

## Files Created/Modified

- `app/(admin)/layout.tsx` - widened gate (`getStaffRole` instead of inline `is_admin`), role-aware sidebar
- `app/(admin)/admin/team-members/page.tsx` - leadership-only server component, reads `funun_staff` + per-row email
- `components/admin/StaffAdmin.tsx` - client component: staff list + create form → `POST /api/admin/staff`
- `app/(admin)/admin/my-client-partners/page.tsx` - any-staff server component, scoped `buyer_orgs` read
- `components/admin/MyCompanies.tsx` - client component: assigned-org list + inline name editor → `PATCH /api/admin/buyer-orgs/[id]`

## Decisions Made

- Sidebar wraps every pre-existing leadership-only link plus the new Team Members link in one
  `isLeadership` conditional block, rather than gating each link individually — matches the plan's
  explicit instruction and keeps the conditional boundary legible at a glance.
- The "Buyer Orgs" sidebar link is relabeled "Client Partners" (route `/admin/buyer-orgs` and every
  internal identifier stay unchanged) per the phase's locked naming decision (25-CONTEXT.md).
- `MyCompanies`' inline editor deliberately writes only the `name` field (the only entry in
  `STAFF_EDITABLE_BUYER_ORG_FIELDS` as of 25-05) and surfaces the API's 404/400 responses verbatim
  rather than generic messaging, so an AE immediately understands an unassigned-org denial versus a
  validation failure.
- "Directory" sidebar link (`/admin/directory`) is wired now per the plan's explicit instruction even
  though the page itself ships in 25-10 — it will 404 until then, a known, plan-authorized gap (not a
  stub in this plan's own deliverables).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Verification Results

- `npx tsc --noEmit` — clean.
- `npx eslint "app/(admin)/layout.tsx" "app/(admin)/admin/team-members/page.tsx" "components/admin/StaffAdmin.tsx" "app/(admin)/admin/my-client-partners/page.tsx" "components/admin/MyCompanies.tsx"` — clean, zero warnings.
- `npm run build` — exit 0; `/admin/team-members` (1.78 kB) and `/admin/my-client-partners` (1.34 kB) both compiled as dynamic routes.
- `grep -rL "is_admin\|getStaffRole" app/(admin)/admin/*/page.tsx app/(admin)/*/page.tsx` — empty output (every existing admin page already self-guards; task's own acceptance criterion satisfied with zero pages needing a guard added).
- Full repo suite (`npm test`) — 127 suites / 1539 tests, all green (no regressions; this plan added no new test files, being a UI/routing-only plan with no new pure-logic module).

## Known Stubs

None in this plan's own deliverables. Note: the layout's new "Directory" link (`/admin/directory`)
points to a route that does not yet exist — it is explicitly the plan's own instruction ("render...
a 'Directory' link... from plan 25-10") and will resolve once 25-10 ships; not a stub introduced by
this plan's scope.

## Threat Flags

None new. This plan closes T-25-11 (Elevation of Privilege — AE/BD reaching a leadership-only page)
by construction: the sidebar hides leadership links from non-leadership roles, and the Task 3 grep
confirms every existing leadership page still bounces direct navigation via its own inline guard. It
closes T-25-08 (Information Disclosure — my-client-partners leaking unassigned Client Partners) via
the `.eq('ae_user_id', user.id)` server-side scope on the read path, mirroring the already-tested
scoped write path. T-25-12 (client trusting `app_metadata` for sensitive render) is not applicable —
role is used only for nav/affordance hints; every write still routes through the already-gated,
already-tested API routes from 25-04/25-05. No new network endpoints, auth paths, or schema changes
were introduced by this plan — it is UI/routing surface over existing, already-audited API routes.

## User Setup Required

None — no external service configuration required. Live AE/BD navigation and the scoped-queue
visual smoke this plan's own `<verification>` section calls for are deferred to the 25-07 post-push
checkpoint (migrations 089/090 must be live for `funun_staff`/`ae_user_id` to exist on the remote
database), per this phase's standing convention.

## Next Phase Readiness

- The Team Console shell (25-08, per 25-CONTEXT.md) mounts inside this same widened `app/(admin)/layout.tsx`
  — no new route group needed.
- The leadership reassign control (25-09) and Team Member Directory (25-10, `/admin/directory`) both
  build directly on this plan's sidebar/nav scaffolding.
- REQUIREMENTS.md still has no Phase 25 section registering TEAM-06/TEAM-07 (`requirements
  mark-complete` returns `not_found` for both) — same pre-existing documentation gap noted at
  25-03/25-04/25-05 and Phases 16/22/28 in STATE.md; deferred to a future `/gsd-docs-update` pass,
  not fixed by this executor.
- Live smoke (AE/BD login, scoped My Client Partners queue, Team Members create flow against a real
  `funun_staff` row) remains fully blocked on the 25-07 `supabase db push` of migrations 089/090.

---
*Phase: 25-funun-team-accounts-ae*
*Completed: 2026-08-07*

## Self-Check: PASSED

- FOUND: app/(admin)/layout.tsx
- FOUND: app/(admin)/admin/team-members/page.tsx
- FOUND: components/admin/StaffAdmin.tsx
- FOUND: app/(admin)/admin/my-client-partners/page.tsx
- FOUND: components/admin/MyCompanies.tsx
- FOUND commit 0cbbca1 (feat: widen admin gate + role-aware sidebar)
- FOUND commit f4336c7 (feat: /admin/team-members)
- FOUND commit c2207b4 (feat: /admin/my-client-partners)
