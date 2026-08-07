---
phase: 23-buyer-onboarding-login-register
plan: 02
subsystem: routing
tags: [nextjs, app-router, buyer-portal, sync-namespace, rebrand]

requires:
  - phase: 16-buyer-catalogue-deals-room
    provides: buyer_orgs/buyer_members schema, license_requests, buyer-portal route group, RLS gating
  - phase: 22-buyer-catalogue-light-ui
    provides: CatalogBrowserLight (.fnbl light theme), BuyerTopNav, catalog-sample fixtures
provides:
  - "/sync/* route tree (catalog, shortlists, requests, requests/new, requests/[id], access) replacing app/(buyer-portal)/buyers/* and app/buyers/access"
  - "Non-gating app/sync/layout.tsx — no longer force-redirects logged-out visitors; each authenticated sub-page self-gates instead"
  - "Public app/sync/page.tsx landing page (hero, value prop, featured catalogue teaser, Browse + Log in/Request access CTAs)"
  - "Every /buyers/* page-route literal across app/components/lib swept to /sync/*"
affects: [23-03-public-catalog-browse, 23-07-login-register-modal, 24-model-b-self-serve, 26-sync-library]

tech-stack:
  added: []
  patterns:
    - "Non-gating layout + self-gating sub-pages: auth redirect responsibility moved from app/sync/layout.tsx into each authenticated page (catalog/shortlists/requests/requests-new/requests-id), so a future public page under the same layout needs no auth check at all"
    - "Lightweight inline SVG wordmark recreation (server component, no new asset/dependency) for the /sync landing hero, following one of the 5 explorations in ~/Desktop/Fununbuyerbrowse/FUNUN Logo Exploration.html"

key-files:
  created:
    - app/sync/layout.tsx
    - app/sync/page.tsx
    - app/sync/access/page.tsx
    - app/sync/catalog/page.tsx
    - app/sync/shortlists/page.tsx
    - app/sync/requests/page.tsx
    - app/sync/requests/new/page.tsx
    - app/sync/requests/[id]/page.tsx
  modified:
    - components/buyer/BuyerTopNav.tsx
    - components/buyer/CatalogBrowserLight.tsx
    - components/buyer/CatalogBrowser.tsx
    - components/buyer/ShortlistPanel.tsx
    - components/buyer/RequestComposer.tsx
    - components/buyer/OrgRequestDashboard.tsx
    - components/admin/BuyerOrgsAdmin.tsx
    - app/api/admin/deals/[id]/pay/route.ts
    - lib/deals/catalog-query.ts
    - lib/deals/request-target.ts
    - lib/deals/shortlists.ts

key-decisions:
  - "Catalog/shortlists/requests pages keep their existing self-gate (redirect to /sync/access when no buyer session) unchanged in this plan — the layout stops force-redirecting, but making /sync/catalog actually reachable while logged out is 23-03's scope, not this plan's"
  - "/sync landing page's featured teaser reuses SAMPLE_CATALOG_ROWS directly (not loadCatalogPage) to sidestep the anon-viewer UUID crash documented as RESEARCH.md Pitfall 3 (loadBlockedIds against a non-UUID buyerUserId) — that fix belongs to 23-03's public-catalog work, not this route-rename plan"
  - "components/buyer/CatalogBrowser.tsx (the dark, unused predecessor to CatalogBrowserLight) and app/api/admin/deals/[id]/pay/route.ts's Stripe redirect URLs were swept even though not listed in the plan's files_modified — both contained live /buyers/ page-route literals the plan's own must_haves truth ('No /buyers/* page route literal remains in code') requires fixed"
  - "lib/buyers/org.ts (listed in files_modified) had no /buyers/ page-route literal to change — grep-confirmed only an internal lib/buyers/permissions.ts module reference; left unmodified"

requirements-completed: [SYNC-09]

coverage:
  - id: D1
    description: "Buyer route tree moved from app/(buyer-portal)/buyers/* + app/buyers/access to app/sync/* with a non-gating layout"
    requirement: SYNC-09
    verification:
      - kind: unit
        ref: "npm run build (route manifest lists /sync, /sync/access, /sync/catalog, /sync/shortlists, /sync/requests, /sync/requests/new, /sync/requests/[id]; no (buyer-portal) or /buyers/* routes)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every /buyers/* page-route literal (hrefs, redirects, Stripe checkout URLs, admin copy) swept to /sync/* across app/components/lib; internal names (buyer_orgs, buyer_members, /api/buyer/*, components/buyer, lib/buyers) untouched"
    requirement: SYNC-09
    verification:
      - kind: other
        ref: "grep -rn '\"/buyers/\\|href=\"/buyers\\|redirect(./buyers/' app components lib | grep -v /api/buyer -> empty (SWEPT)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Public /sync landing page renders logged-out with hero, value prop, featured catalogue teaser, and Browse + Log in/Request access CTAs"
    requirement: SYNC-09
    verification:
      - kind: unit
        ref: "npm run build (app/sync/page.tsx compiles; no auth/session read in the page itself)"
        status: pass
    human_judgment: true
    rationale: "Visual fidelity of the wordmark/hero/teaser layout against the CONTEXT.md Marmoset-mirror + wordmark-exploration intent needs a human look — build/type success proves it renders and is session-independent, not that it looks right"

# Metrics
duration: ~25min
completed: 2026-08-07
status: complete
---

# Phase 23 Plan 02: /sync Route Unification + Public Landing Summary

**Renamed the entire buyer route namespace `/buyers/* → /sync/*`, made the layout non-gating (auth moved into each authenticated sub-page), and added a new public `/sync` marketing landing page.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-07T08:53:00Z
- **Tasks:** 3/3 completed
- **Files modified:** 8 created, 11 modified

## Accomplishments
- Moved `app/(buyer-portal)/buyers/*` and `app/buyers/access` to a real `/sync/*` path segment (catalog, shortlists, requests, requests/new, requests/[id], access) and deleted the old route group/directory
- Rebuilt the buyer-portal layout as `app/sync/layout.tsx`, which no longer force-redirects logged-out visitors — each authenticated sub-page now owns its own `getUser()` + `buyer_members` check and redirects to `/sync/access`; `BuyerTopNav` renders only when a buyer session exists
- Swept every `/buyers/` page-route literal (nav hrefs, redirects, Stripe checkout success/cancel URLs, admin invite-failure copy, doc comments) across `app`, `components`, and `lib` to `/sync/`, including two files outside the plan's stated `files_modified` list (`components/buyer/CatalogBrowser.tsx`, `app/api/admin/deals/[id]/pay/route.ts`) found via the required grep sweep
- Built the public `/sync` landing page: a lightweight inline-SVG Funūn/Nūn wordmark recreation, value-prop row, a non-interactive featured-catalogue teaser (4 `SAMPLE_CATALOG_ROWS`), and Browse (`/sync/catalog`) + Log in/Request access (`/sync/access`) CTAs — renders with no session and no live-data auth risk

## Task Commits

Each task was committed atomically:

1. **Task 1: Move the buyer route tree to /sync/* with a non-gating layout** - `78188bc` (feat)
2. **Task 2: Sweep every /buyers/* route literal to /sync/*** - `76eb7b2` (feat)
3. **Task 3: Public /sync landing page** - `fac94f1` (feat, includes a Rule 1 type-narrowing fix to Task 1's layout found during this task's `tsc`/`build` verification)

**Plan metadata:** committed with this summary (see final commit)

## Files Created/Modified
- `app/sync/layout.tsx` - non-gating buyer shell; conditional membership lookup + `BuyerTopNav`
- `app/sync/page.tsx` - public Funūn Sync landing page
- `app/sync/access/page.tsx` - buyer magic-link sign-in, copy revised off "invite-only during beta"
- `app/sync/catalog/page.tsx`, `app/sync/shortlists/page.tsx`, `app/sync/requests/page.tsx`, `app/sync/requests/new/page.tsx`, `app/sync/requests/[id]/page.tsx` - moved portal routes, self-gating to `/sync/access`
- `components/buyer/BuyerTopNav.tsx`, `components/buyer/CatalogBrowserLight.tsx`, `components/buyer/CatalogBrowser.tsx`, `components/buyer/ShortlistPanel.tsx`, `components/buyer/RequestComposer.tsx`, `components/buyer/OrgRequestDashboard.tsx` - nav hrefs / redirect targets / doc comments updated to `/sync/*`
- `components/admin/BuyerOrgsAdmin.tsx` - invite-failure fallback copy updated to `/sync/access`
- `app/api/admin/deals/[id]/pay/route.ts` - Stripe checkout success/cancel URLs updated to `/sync/requests/${id}`
- `lib/deals/catalog-query.ts`, `lib/deals/request-target.ts`, `lib/deals/shortlists.ts` - doc-comment call-site references updated to `/sync/*`

## Decisions Made
- Kept catalog/shortlists/requests pages' existing self-gate logic unchanged (still redirects logged-out visitors) — this plan's job was the route rename + non-gating layout, not opening the catalog to anonymous browsing (23-03's scope)
- Landing-page featured teaser uses the static `SAMPLE_CATALOG_ROWS` fixture directly rather than `loadCatalogPage`, avoiding the anon-viewer UUID crash RESEARCH.md flags as Pitfall 3 (that fix belongs to 23-03)
- Swept two files not in the plan's `files_modified` list (`components/buyer/CatalogBrowser.tsx`, `app/api/admin/deals/[id]/pay/route.ts`) because they contained live `/buyers/` page-route literals — required by the plan's own must_haves truth and Task 2's explicit "grep across app components lib first" instruction

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] app/sync/layout.tsx buyer-membership type narrowed to `never`**
- **Found during:** Task 3 (`npx tsc --noEmit` verification)
- **Issue:** `member = memberRow as typeof member` self-referential cast confused TypeScript's control-flow narrowing against the untyped Supabase query builder result, making `member.org_id`/`member.buyer_role`/`member.is_org_admin` all resolve to `never` at the JSX usage sites
- **Fix:** Introduced a named `BuyerMembership` type alias and cast to it explicitly instead of `typeof member`
- **Files modified:** `app/sync/layout.tsx`
- **Verification:** `npx tsc --noEmit` clean; `npm run build` compiles all `/sync/*` routes
- **Committed in:** `fac94f1` (bundled with Task 3's commit since it was caught by that task's own build-verification step)

---

**Total deviations:** 1 auto-fixed (Rule 1 — type bug)
**Impact on plan:** Necessary for `npm run build`/`tsc` to pass; no scope creep. The two extra swept files (CatalogBrowser.tsx, deals pay route) are documented above as decisions rather than deviations since Task 2's own instructions explicitly call for a full grep-based sweep beyond the "known" file list.

## Issues Encountered
- Stale `.next/types` build cache referenced the deleted `(buyer-portal)`/`app/buyers` routes and produced spurious `tsc` errors after the file moves; resolved by removing `.next` before re-running `tsc --noEmit`. No source change required — recorded here only because it could otherwise look like a real regression.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `/sync/*` is now the sole buyer-facing namespace; `23-03` can build public catalogue browse directly on `app/sync/catalog/page.tsx` + the already-non-gating `app/sync/layout.tsx` without any further route-group restructuring
- `23-07`'s Login/Register modal has a real landing page (`app/sync/page.tsx`) and CTA target (`/sync/access`) to wire into, per this plan's own key_links note
- Full verification: `npx tsc --noEmit` clean, `npm run lint` clean (0 warnings), `npm run build` compiles all `/sync/*` routes with zero `/buyers/*` remnants, full Jest suite 131 suites / 1570 tests green

---
*Phase: 23-buyer-onboarding-login-register*
*Completed: 2026-08-07*

## Self-Check: PASSED

All 8 created files verified present on disk; all 3 task commits (78188bc, 76eb7b2, fac94f1) plus the summary docs commit (69aa8d8) verified present in git log.
