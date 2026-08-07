---
phase: 23-buyer-onboarding-login-register
plan: 06
subsystem: api
tags: [nextjs, supabase, staff-rbac, buyer-orgs, lead-routing, notifications]

# Dependency graph
requires:
  - phase: 23-buyer-onboarding-login-register (23-01)
    provides: "buyer_orgs.status/use_case/contact_*/source columns (migration 095, drafted); BUYER_ORG_STATUS_VALUES type"
  - phase: 25-funun-team-accounts-ae
    provides: "requireStaff/getStaffRole, isAssignedToOrg, logStaffAction, buyer_orgs.ae_user_id, /api/admin/buyer-orgs[/[id]][/ae], lib/staff/notifications.ts's link: '/admin/client-partners/${orgId}' (previously 404ing)"
  - phase: 16-gtm-beta-launch
    provides: "buyer_orgs/buyer_members schema, migration 081 cross-company license_requests RLS"
provides:
  - "PATCH /api/admin/buyer-orgs/[id] status transition — pending_onboarding -> active via the extended STAFF_EDITABLE_BUYER_ORG_FIELDS allowlist, validated against BUYER_ORG_STATUS_VALUES"
  - "/admin/client-partners/[orgId] — the Client Partner detail page every lead_routed/ae_assigned/ae_unassigned notification already links to"
  - "components/admin/ClientPartnerDetail.tsx — status badge, qualifying/lead fields, member list, Mark onboarding complete action"
  - "GET /api/admin/buyer-orgs?unassigned=1 — leadership's unassigned-lead queue (buyer_orgs WHERE ae_user_id IS NULL)"
  - "Confirmed (no new code): cross-company purchase visibility already delivered by migration 081 RLS + app/sync/requests/page.tsx"
affects: [23-07-login-register-modal, 23-08-migration-push-checkpoint]

tech-stack:
  added: []
  patterns:
    - "Staff-editable-field allowlist extension with per-field enum validation before the DB write (status validated against BUYER_ORG_STATUS_VALUES inside the same trim loop, never reaching update() when invalid)"
    - "Detail-page scope parity: notFound() on scope denial (page) mirrors 404-not-403 (API) — org existence never leaked to an unassigned AE/BD either way"
    - "Reusing the existing list GET for a leadership sub-view via a query param (?unassigned=1) instead of a parallel queue table/route"

key-files:
  created:
    - app/api/admin/buyer-orgs/[id]/route.test.ts
    - "app/(admin)/admin/client-partners/[orgId]/page.tsx"
    - components/admin/ClientPartnerDetail.tsx
  modified:
    - "app/api/admin/buyer-orgs/[id]/route.ts"
    - app/api/admin/buyer-orgs/route.ts
    - __tests__/staff-buyer-orgs-api.test.ts

key-decisions:
  - "GET /api/admin/buyer-orgs's request parameter changed from zero-arg to required Request (not optional) — Next.js's typed-route checker (next build) rejects an optional first-param type for a route handler; the existing test-suite call sites (orgsGET()) were updated to pass a Request instead of relaxing the type"
  - "contact_name/contact_email/contact_phone/contact_role/source stay OUT of STAFF_EDITABLE_BUYER_ORG_FIELDS for v1 — no edit surface for them on this plan; only status and use_case were added, per the plan's own Pattern 3 instruction"
  - "ClientPartnerDetail.tsx styled with the Team Console light/dark token idiom (console-theme.ts custom properties) rather than DealDetailPanel.tsx's legacy dark-only classes, per the plan's explicit instruction"
  - "Detail page scope denial resolves to notFound() (Next.js 404 page), not a redirect — matches the API's 404-not-403 discipline (T-23-18) exactly rather than approximating it with a role-based redirect"

patterns-established:
  - "?unassigned=1 sub-view on an existing scoped list GET, gated implicitly by the caller's own staffRole branch (leadership gets the filter; AE/BD's existing ae_user_id scope silently wins) — reusable pattern for any future leadership-only slice of an already-staff-scoped list"

requirements-completed: [SYNC-06, SYNC-10]

coverage:
  - id: D1
    description: "Staff PATCH {status:'active'} on an assigned org updates status and is audited; invalid status rejected 400 before any DB write; scope denial still 404 (not 403); name editing still works"
    requirement: "SYNC-06"
    verification:
      - kind: unit
        ref: "app/api/admin/buyer-orgs/[id]/route.test.ts (4 tests: status transition + audit, invalid status 400, 404 scope denial, name-edit preserved)"
        status: pass
      - kind: unit
        ref: "__tests__/staff-buyer-orgs-api.test.ts (unchanged 8 PATCH-route tests still green, confirming no regression to the existing allowlist/scope/audit behaviors)"
        status: pass
    human_judgment: false
  - id: D2
    description: "/admin/client-partners/[orgId] renders the qualifying fields + status, offers Mark onboarding complete, resolves the previously-404 notification links; leadership sees any org, AE/BD only an assigned org (notFound() otherwise)"
    requirement: "SYNC-06"
    verification:
      - kind: other
        ref: "test -f \"app/(admin)/admin/client-partners/[orgId]/page.tsx\" && grep -q status components/admin/ClientPartnerDetail.tsx (plan's own automated verify command) — DETAIL"
        status: pass
      - kind: e2e
        ref: "npm run build — /admin/client-partners/[orgId] compiles as a dynamic server route with zero errors"
        status: pass
    human_judgment: true
    rationale: "Live click-through of a lead_routed notification -> detail page -> Mark onboarding complete -> status flips to active is explicitly deferred to the 23-08 human-gated smoke test (this plan's own <verification> section); requires migration 095 to be pushed first."
  - id: D3
    description: "Leadership can list the unassigned lead pool via GET /api/admin/buyer-orgs?unassigned=1 (buyer_orgs WHERE ae_user_id IS NULL); AE/BD scoping unchanged and the param is silently ignored for them; status included in ORG_COLUMNS"
    requirement: "SYNC-06"
    verification:
      - kind: unit
        ref: "__tests__/staff-buyer-orgs-api.test.ts#23-06: ?unassigned=1 filters to ae_user_id IS NULL for leadership"
        status: pass
      - kind: unit
        ref: "__tests__/staff-buyer-orgs-api.test.ts#23-06: ?unassigned=1 is ignored for a non-leadership caller — still scoped to their own ae_user_id"
        status: pass
      - kind: other
        ref: "grep -q unassigned app/api/admin/buyer-orgs/route.ts && grep -q \"ae_user_id', null\" app/api/admin/buyer-orgs/route.ts (plan's own automated verify command) — QUEUE"
        status: pass
    human_judgment: false
  - id: D4
    description: "Cross-company purchase visibility (SYNC-10) is already satisfied by existing infrastructure — migration 081's license_requests_select_buyer_org_or_project_owner RLS + app/sync/requests/page.tsx's OrgRequestDashboard, which returns every org member's license requests to every org member with no explicit id-list step"
    requirement: "SYNC-10"
    verification:
      - kind: other
        ref: "supabase/migrations/081_license_requests_deals.sql:189 (policy exists, confirmed via grep); app/sync/requests/page.tsx's own doc comment: 'visible to every member (D-16a)', RLS scoped to .eq('buyer_org_id', member.org_id) with no created_by filter"
        status: pass
    human_judgment: true
    rationale: "This is a verification-only deliverable (RESEARCH Open Question #3 / this plan's own instruction: 'confirm, don't rebuild'). No new code was written; a human/live-DB check that the RLS policy actually enforces this at the database layer (not just reads correctly in code) is out of this plan's automated-test scope and was already noted as a Phase 16/22/23 pattern of deferring live-DB behavior to the 23-08 checkpoint."

# Metrics
duration: ~20min
completed: 2026-08-07
status: complete
---

# Phase 23 Plan 06: AE Onboarding Surface — Client Partner Detail + Status Transition + Unassigned Queue Summary

**A real Client Partner detail page at `/admin/client-partners/[orgId]` (resolving three previously-404ing Phase 25 notification links), a staff-editable `pending_onboarding → active` status transition, a leadership unassigned-lead queue, and confirmation that cross-company purchase visibility is already delivered by migration 081's RLS.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3/3 completed
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- Extended `STAFF_EDITABLE_BUYER_ORG_FIELDS` in `app/api/admin/buyer-orgs/[id]/route.ts` from `['name']` to `['name', 'status', 'use_case']`, with `status` validated against `BUYER_ORG_STATUS_VALUES` (`lib/buyers/schema.ts`) before any write reaches the DB — an invalid status returns 400 with zero side effects. The pre-existing 404-on-scope-denial and unconditional `logStaffAction` audit are unchanged.
- Built `/admin/client-partners/[orgId]` (server component, `app/(admin)/admin/client-partners/[orgId]/page.tsx`) — the AE onboarding-completion surface every `lead_routed`/`ae_assigned`/`ae_unassigned` notification (`lib/staff/notifications.ts`) already linked to but which 404'd until now (RESEARCH Pitfall 4). Leadership sees any org; AE/BD only an org assigned to them, `notFound()` otherwise — parity with the API's 404-not-403 scope-denial discipline.
- `components/admin/ClientPartnerDetail.tsx` renders the company header, a status badge (amber = pending onboarding, green = active), the staff-only qualifying/lead fields captured at register (contact name/email/phone/role, use case, source), the member list, and a "Mark onboarding complete" button (hidden once already active) that PATCHes `{ status: 'active' }` to the Task 1 route.
- `GET /api/admin/buyer-orgs?unassigned=1` adds leadership's unassigned-lead queue (`buyer_orgs WHERE ae_user_id IS NULL`) by extending the existing scoped query rather than building a parallel queue table/route (RESEARCH anti-pattern warning honored). Non-leadership callers' existing `ae_user_id` scoping is untouched — the param is silently a no-op for them. `status` was added to `ORG_COLUMNS` so a future queue UI can show `pending_onboarding`.
- Verified (no new code) that cross-company purchase visibility (SYNC-10) is already satisfied: migration 081's `license_requests_select_buyer_org_or_project_owner` RLS + `app/sync/requests/page.tsx`'s `OrgRequestDashboard` already return every org member's license requests to every org member.

## Task Commits

Each task was committed atomically:

1. **Task 1: Status transition via the existing staff-edit allowlist** - `ccf8537` (feat)
2. **Task 2: Client Partner detail page (the notification-link target)** - `3ccd0c1` (feat)
3. **Task 3: Leadership unassigned-lead queue + confirm cross-company visibility** - `da28ac2` (feat, includes a Rule 3 fix — see Deviations)

**Plan metadata:** (this commit)

## Files Created/Modified
- `app/api/admin/buyer-orgs/[id]/route.ts` - `STAFF_EDITABLE_BUYER_ORG_FIELDS` extended with `status`/`use_case`; status validated against `BUYER_ORG_STATUS_VALUES` before the DB write
- `app/api/admin/buyer-orgs/[id]/route.test.ts` - New colocated test (4 tests) covering this task's four behaviors
- `app/(admin)/admin/client-partners/[orgId]/page.tsx` - New server component: staff scope check (leadership any org, AE/BD assigned-only), reads org + members via service client with an explicit staff-only column list
- `components/admin/ClientPartnerDetail.tsx` - New client component: status badge, qualifying-fields grid, member list, Mark-onboarding-complete action
- `app/api/admin/buyer-orgs/route.ts` - `GET` gains `?unassigned=1` (leadership-only `.is('ae_user_id', null)` branch); `status` added to `ORG_COLUMNS`; `request: Request` parameter added (was zero-arg)
- `__tests__/staff-buyer-orgs-api.test.ts` - `mockListService` extended with an `.is()` spy; two new tests for the unassigned-queue behavior; existing zero-arg `orgsGET()` call sites updated to pass a `Request` (Rule 3 fix, see below)

## Decisions Made
- `GET /api/admin/buyer-orgs`'s new `request` parameter is required (`Request`), not optional — `next build`'s typed-route generator rejects `Request | undefined` as not satisfying its `ParamCheck<Request | NextRequest>` constraint. The alternative (keeping it optional) would have failed the build; making it required and updating the test call sites is the correct fix, not a workaround.
- The plan's Task 1 behavior list didn't mention `use_case`, but the plan's own action text and RESEARCH Pattern 3 both explicitly say to add it alongside `status` — included per the plan's literal instruction, not scope creep.
- `ClientPartnerDetail.tsx` uses inline `style` for the status-badge/error-banner color triples (`var(--green-fg)`/`var(--amber-fg)`/`var(--rose-fg)` etc.) rather than Tailwind arbitrary-value classes, since those color tokens don't have matching Tailwind utility names in this codebase's config — mirrors how `StatusBadge`-style components elsewhere in this repo handle multi-property token-driven styling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made GET's new `request` parameter required, not optional, and fixed the pre-existing test call sites**
- **Found during:** Task 3 (`npx tsc --noEmit` / `next build` verification)
- **Issue:** The most direct read of the task ("accept an optional `?unassigned=1` query param") is a query-string concept, not a TypeScript parameter-optionality concept — but the first attempt made the JS parameter itself optional (`request?: Request`) for backward compatibility with the existing zero-arg test call sites (`orgsGET()` in `__tests__/staff-buyer-orgs-api.test.ts`). `next build`'s typed-route checker failed: `Type '{ ...__param_type__: Request | undefined }' does not satisfy the constraint 'ParamCheck<Request | NextRequest>'` — Next.js requires a route handler's declared parameter type to be exactly `Request` (or `NextRequest`), never a union with `undefined`.
- **Fix:** Changed the signature to `request: Request` (required) and updated the three pre-existing `orgsGET()` call sites in `__tests__/staff-buyer-orgs-api.test.ts` to `orgsGET(new Request('http://t.local/api/admin/buyer-orgs'))`, preserving their original (non-unassigned) behavior exactly.
- **Files modified:** `app/api/admin/buyer-orgs/route.ts`, `__tests__/staff-buyer-orgs-api.test.ts`
- **Verification:** `npx tsc --noEmit` clean; `npm run build` compiles `/api/admin/buyer-orgs` with zero errors; `npm test -- __tests__/staff-buyer-orgs-api.test.ts` 24/24 passing (22 pre-existing + 2 new)
- **Committed in:** `da28ac2` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking build-type error, not a logic change; the feature behavior is identical to the plan's intent)
**Impact on plan:** No scope creep. The route's actual runtime behavior (optional `?unassigned=1` query string, still working with or without it) is exactly what the plan asked for; only the TypeScript parameter's optionality needed correcting to satisfy Next.js's build-time route typing.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None. `PATCH .../status` and the new detail page write/read columns added by migration 095, which remains unpushed (HUMAN-GATED per 23-01's own directive) — the owner pushes it (alongside any other Phase 23 migrations) via Codex at the 23-08 checkpoint. This plan's PATCH-route test mocks the service client entirely and does not require a live database to pass; the detail page's live render (with real `status`/`use_case`/`contact_*` data) can only be exercised after that push.

## Next Phase Readiness
- The `lead_routed`/`ae_assigned`/`ae_unassigned` notification links (`lib/staff/notifications.ts`) now resolve to a real page instead of 404ing — closes RESEARCH Pitfall 4.
- 23-07 (Login/Register modal) is unaffected by this plan and can proceed independently — no shared files.
- 23-08's live smoke test (click a `lead_routed` notification → detail page renders → Mark onboarding complete → status flips to `active`) is the first point this plan's end-to-end behavior can be verified against a real Supabase environment with migration 095 pushed; flagged `human_judgment: true` (D2) in this SUMMARY's coverage block.
- Full verification: `npm test` — 135 suites / 1610 tests green; `npx tsc --noEmit` clean; `npm run lint` clean (0 warnings); `npm run build` compiles cleanly, including the new `/admin/client-partners/[orgId]` dynamic route.
- No blockers for subsequent Phase 23 plans. The only outstanding item is the human-gated `supabase db push` for migration 095, already deferred by design to the 23-08 checkpoint (unchanged by this plan).

---
*Phase: 23-buyer-onboarding-login-register*
*Completed: 2026-08-07*

## Self-Check: PASSED

All 6 created/modified files verified present on disk; all 3 task commits (ccf8537, 3ccd0c1, da28ac2) verified present in git log.
