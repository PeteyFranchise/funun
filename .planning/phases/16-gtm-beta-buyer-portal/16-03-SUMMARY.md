---
phase: 16-gtm-beta-buyer-portal
plan: 03
subsystem: auth
tags: [buyer-portal, supabase-auth, admin-ui, magic-link, resend, nextjs]

# Dependency graph
requires:
  - phase: 16-gtm-beta-buyer-portal (plan 01)
    provides: buyer_orgs/buyer_members tables (migration 080), lib/buyers/schema.ts, lib/buyers/permissions.ts, lib/buyers/org.ts
provides:
  - createBuyerAccount() — atomic buyer account creation (admin.createUser + buyer_members insert + magic-link invite email), curator early-return shape, never touches user_profiles
  - Admin buyer-org management: POST/GET /api/admin/buyer-orgs, GET/POST /api/admin/buyer-orgs/[id]/members, app/(admin)/admin/buyer-orgs UI
  - Org-admin self-service member invite: POST /api/buyer/members (org-membership-gated, org_id forced server-side)
  - Buyer portal shell: app/(buyer-portal)/layout.tsx (role + membership gate), components/buyer/BuyerPortalNav.tsx, app/buyers/access/page.tsx (magic-link landing)
affects: [16-04-artist-deals-room, 16-05, 16-06-buyer-request-route, 16-07-admin-deal-workflow, 16-08, 16-09, 16-10, wave-3-buyer-catalog-shortlists-requests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "createBuyerAccount mirrors createIndustryMember line-for-line but follows the curator early-return shape — no user_profiles/subscriptions insert, app_metadata.role set atomically inside admin.createUser() to avoid the phantom-row race the repo has already fixed twice"
    - "Buyer-facing writes are gated by ORG MEMBERSHIP resolved via the session client (RLS self-select), not platform admin — org_id/is_org_admin are always server-derived, never trusted from the request body"
    - "(buyer-portal) route group deliberately excluded from middleware.ts isProtected — the layout's own getUser()+role+membership check is the sole gate, mirroring (curator-portal)"

key-files:
  created:
    - lib/buyers/createBuyerAccount.ts
    - lib/email/buyerInvite.ts
    - app/api/admin/buyer-orgs/route.ts
    - app/api/admin/buyer-orgs/[id]/members/route.ts
    - app/api/buyer/members/route.ts
    - app/(admin)/admin/buyer-orgs/page.tsx
    - components/admin/BuyerOrgsAdmin.tsx
    - app/(buyer-portal)/layout.tsx
    - components/buyer/BuyerPortalNav.tsx
    - app/buyers/access/page.tsx
  modified: []

key-decisions:
  - "Added a GET handler to app/api/admin/buyer-orgs/[id]/members/route.ts beyond the plan's explicit POST-only prose, so the admin UI's per-org expandable member list has a real data source (Rule 2 — missing critical functionality; the admin UI panel described in the plan cannot render a member list without it)."
  - "Deliberately did NOT touch app/(admin)/layout.tsx to add a Buyer orgs sidebar link — 16-07 (wave 3, depends_on 16-03) is the declared sole owner of that file this wave and adds both the Deals and Buyer orgs nav entries in one edit; the admin page is reachable directly at /admin/buyer-orgs until then."
  - "app/buyers/access/page.tsx is a client component that renders AuthLayout directly (no separate form sub-component file, matching the plan's exact files_modified list) — AuthLayout has no server-only dependencies so it bundles cleanly into the client boundary."
  - "signInWithOtp's emailRedirectTo omits an explicit next param, falling back to /auth/callback's existing /vault default — no protected buyer-portal page exists yet for the callback to target (Wave 3 adds the actual catalog/shortlists/requests routes); a buyer who resends their own magic link from /buyers/access lands on /vault today, which is an acknowledged gap for Wave 3 to close, not a correctness issue for this plan (createBuyerAccount's own generateLink invite is the primary onboarding path and is unaffected)."

requirements-completed: [BUYER-03, BUYER-04, BUYER-06]

coverage:
  - id: D1
    description: "A platform admin can create a buyer company and invite its first org admin from the admin panel (D-12) via POST /api/admin/buyer-orgs, which atomically creates the buyer_orgs row and calls createBuyerAccount with the approver tier + is_org_admin=true."
    requirement: BUYER-03
    verification:
      - kind: other
        ref: "npx tsc --noEmit && npm run lint && npm run build — app/api/admin/buyer-orgs/route.ts compiles, verifyAdmin gate present, /admin/buyer-orgs and /api/admin/buyer-orgs routes registered in build output"
        status: pass
    human_judgment: true
    rationale: "No test framework coverage exists for this route's live Supabase admin.createUser()/insert flow (mirrors createIndustryMember, which also has no route-level test); correctness of the end-to-end invite (email delivery, magic-link redemption) requires a human to exercise the admin panel against a real Supabase project."
  - id: D2
    description: "An org admin can invite additional employees with a scoped requester or approver tier (D-13) via POST /api/buyer/members, gated by canManageMembers() and with org_id forced server-side (T-16-09)."
    requirement: BUYER-04
    verification:
      - kind: other
        ref: "npx tsc --noEmit && npm run lint — canManageMembers gate present, org_id read from the caller's own buyer_members row (grep-verified), never from the request body"
        status: pass
    human_judgment: true
    rationale: "Requires a live org-admin session to exercise the invite flow and confirm cross-org isolation; no automated test harness exists for Supabase-session-gated routes in this repo."
  - id: D3
    description: "A buyer account's app_metadata.role is set atomically inside admin.createUser() — never a post-insert UPDATE — and every route under the buyer portal is gated by the layout's own getUser()+role check, with unauthenticated visitors landing on /buyers/access, never /signin."
    requirement: BUYER-06
    verification:
      - kind: unit
        ref: "lib/buyers/permissions.test.ts (pre-existing, still green — canManageMembers/hasApproverRole predicates reused unmodified by this plan's routes)"
        status: pass
      - kind: other
        ref: "grep -Eq app_metadata lib/buyers/createBuyerAccount.ts; grep -Eq getUser/app_metadata/buyers-access app/(buyer-portal)/layout.tsx; git diff --stat middleware.ts (empty — confirmed untouched)"
        status: pass
    human_judgment: true
    rationale: "Structural/static checks confirm the atomic-write and gate shape, but the end-to-end claim (unauthenticated visitor really lands on /buyers/access, a real buyer session really reaches portal children) requires a human to click through the flow against a live Supabase project — no Wave 3 buyer-portal pages exist yet to render inside the gate for an automated UI check."

# Metrics
duration: ~15min
completed: 2026-08-03
status: complete
---

# Phase 16 Plan 03: Buyer Account/Org Machinery Summary

**Atomic buyer account creation (curator early-return shape, no user_profiles row) wired to admin-created buyer orgs, org-admin self-service member invites, and a gated buyer portal shell — mirrors the proven curator/industry account primitives exactly.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-08-03
- **Tasks:** 3/3
- **Files modified:** 10 created, 0 modified

## Accomplishments
- `createBuyerAccount()` sets `app_metadata.role='buyer'` atomically inside `admin.createUser()`, inserts the `buyer_members` row via the service-role client (migration 080's write lockdown), sends a custom Resend magic-link invite, and never creates a `user_profiles` row.
- Admin panel (`/admin/buyer-orgs`) lets a platform admin create a buyer company and invite its first org admin in one request (D-12); a per-org expandable member list and add-member form round out the UI.
- Org admins invite their own employees at a chosen tier via `POST /api/buyer/members`, gated by `canManageMembers()` with `org_id` forced to the caller's own membership row (T-16-09 — an org admin cannot inject members into another company).
- `(buyer-portal)/layout.tsx` gates every future buyer route on `getUser()` + `app_metadata.role==='buyer'` + a real `buyer_members` row, redirecting to `/buyers/access` (never `/signin`); `middleware.ts` is deliberately untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Buyer account creation helper + invite email** - `406b5ea` (feat)
2. **Task 2: Admin buyer-org API + admin UI, org-admin member invites** - `6976716` (feat)
3. **Task 3: Buyer portal shell, nav, and access landing page** - `b2de369` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/buyers/createBuyerAccount.ts` - Atomic account-creation helper (createUser + buyer_members insert + invite email); `DuplicateBuyerAccountError`
- `lib/email/buyerInvite.ts` - Custom Resend invite email (subject + escaped HTML)
- `app/api/admin/buyer-orgs/route.ts` - verifyAdmin-gated GET (list + member counts) / POST (create org + invite first org admin)
- `app/api/admin/buyer-orgs/[id]/members/route.ts` - Admin GET (list org's members) / POST (add member to existing org)
- `app/api/buyer/members/route.ts` - Org-membership-gated employee invite; `org_id` server-derived
- `app/(admin)/admin/buyer-orgs/page.tsx` - Server component fetching orgs + member counts
- `components/admin/BuyerOrgsAdmin.tsx` - Client UI: create-org form, expandable per-org member list, add-member form
- `app/(buyer-portal)/layout.tsx` - Session + role + membership gate for all future buyer-portal routes
- `components/buyer/BuyerPortalNav.tsx` - Portal shell nav; static hrefs for catalog/shortlists/requests, company name + tier
- `app/buyers/access/page.tsx` - Invite-only-during-beta magic-link sign-in landing

## Decisions Made
- Added a `GET` handler to the nested `[id]/members` route (not explicitly named in the plan's POST-only prose) so the admin UI's per-org member list has a real data source — Rule 2 (missing critical functionality).
- Left `app/(admin)/layout.tsx` untouched: plan 16-07 (wave 3, `depends_on: ["16-02", "16-03"]`) is the declared sole owner of that file this wave and adds both the Deals and Buyer orgs sidebar links together. `/admin/buyer-orgs` is reachable by direct URL until then.
- `app/buyers/access/page.tsx` is a single client-component file (no separate form sub-component) to match the plan's exact `files_modified` list; `AuthLayout` has no server-only dependencies so it bundles cleanly into the client tree, same visual chrome as the curator claim page.
- `signInWithOtp`'s `emailRedirectTo` omits an explicit `next` param (falls back to `/auth/callback`'s existing `/vault` default) since no protected buyer-portal page exists yet for Wave 3 to target — the primary onboarding path (`createBuyerAccount`'s own `generateLink` invite) is unaffected; this is a known gap for Wave 3 to close when real portal pages land.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Auto-add missing critical functionality] Added GET /api/admin/buyer-orgs/[id]/members**
- **Found during:** Task 2
- **Issue:** The plan's Task 2 action prose only describes "POST on the nested members route lets an admin add a member to an existing org" — but the same task also asks for "the client component with the create-org form and per-org member list," which has no data source without a corresponding GET.
- **Fix:** Added an admin-gated `GET` handler alongside the required `POST`, using the same column-explicit select + per-row email attach pattern as `app/api/admin/members/route.ts`.
- **Files modified:** `app/api/admin/buyer-orgs/[id]/members/route.ts`
- **Verification:** `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean; route appears in build output.
- **Committed in:** `6976716` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2).
**Impact on plan:** Necessary for the admin UI described in the same task to function; no scope creep beyond what the task's own UI requirement implies.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. (Email delivery already depends on `RESEND_API_KEY`/`RESEND_FROM_EMAIL`, configured in a prior phase; `sendEmail()` no-ops safely and surfaces `emailSent: false` to the admin UI if unset.)

## Next Phase Readiness
- Buyer account/org machinery is live: admin org creation, org-admin employee invites, and the portal gate are all in place for Wave 3 page plans (16-04+) to build inside.
- `components/buyer/BuyerPortalNav.tsx`'s static hrefs (`/buyers/catalog`, `/buyers/shortlists`, `/buyers/requests`) establish the URL contract Wave 3 pages should implement under the `(buyer-portal)` route group.
- Outstanding/deferred: end-to-end human verification of the full admin-create → email → magic-link → portal-gate flow against a live Supabase project (all three D1–D3 coverage entries above are `human_judgment: true` pending that pass); `app/(admin)/layout.tsx` sidebar link for `/admin/buyer-orgs` is deferred to 16-07.

---
*Phase: 16-gtm-beta-buyer-portal*
*Completed: 2026-08-03*

## Self-Check: PASSED

All 10 created files confirmed present on disk; all 3 task commits (`406b5ea`, `6976716`, `b2de369`) confirmed present in git log. `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `npx jest` (103 suites / 1299 tests) all pass at HEAD.
