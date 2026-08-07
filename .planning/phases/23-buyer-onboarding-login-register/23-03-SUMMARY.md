---
phase: 23-buyer-onboarding-login-register
plan: 03
subsystem: api
tags: [nextjs, supabase, rls, buyer-catalog, jest]

# Dependency graph
requires:
  - phase: 23-buyer-onboarding-login-register (plan 02)
    provides: "/sync route namespace + non-gating /sync layout + public /sync landing page"
provides:
  - "Anonymous-safe loadCatalogPage(service, buyerUserId: string | null, filter, page)"
  - "First test coverage for lib/deals/catalog-query.ts (anon + authenticated paths)"
  - "/sync/catalog reachable and browsable by logged-out visitors"
affects: [23-07-login-register-modal, 23-buyer-catalogue-engagement-gating]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Null-safe optional-block-exclusion: skip loadBlockedIds entirely when the caller has no real account id, rather than passing a sentinel into a uuid .or() filter"

key-files:
  created:
    - lib/deals/catalog-query.test.ts
  modified:
    - lib/deals/catalog-query.ts
    - app/sync/catalog/page.tsx

key-decisions:
  - "buyerUserId widened to string | null on the single loadCatalogPage implementation (no parallel public function) — preserves the file's own single-implementation doctrine"
  - "Public /sync/catalog render uses CatalogBrowserLight isPublic (its own self-contained header + Login button), not embedded — BuyerTopNav stays authenticated-member-only"

patterns-established:
  - "Anonymous-visitor branch skips block resolution entirely (blocks rows only ever reference real auth.users ids) rather than querying with an empty/sentinel id"

requirements-completed: [SYNC-02]

coverage:
  - id: D1
    description: "loadCatalogPage(service, null, filter, page) resolves without calling loadBlockedIds and returns rights-ready public cards, never throwing for an anonymous caller"
    requirement: "SYNC-02"
    verification:
      - kind: unit
        ref: "lib/deals/catalog-query.test.ts#loadCatalogPage — anonymous visitor (buyerUserId = null)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Authenticated block exclusion is unchanged — loadBlockedIds is still called with the real buyer id and blocked owners are filtered out"
    requirement: "SYNC-02"
    verification:
      - kind: unit
        ref: "lib/deals/catalog-query.test.ts#loadCatalogPage — authenticated buyer (buyerUserId = real id)"
        status: pass
    human_judgment: false
  - id: D3
    description: "/sync/catalog is reachable and renders the catalogue for a logged-out visitor (isPublic branch); authenticated non-buyer still redirects to /sync/access; buyer session renders the unchanged embedded experience"
    requirement: "SYNC-02"
    verification:
      - kind: unit
        ref: "grep verification: isPublic + loadCatalogPage(service, null in app/sync/catalog/page.tsx"
        status: pass
      - kind: other
        ref: "npm run build (Next.js route compiles /sync/catalog cleanly, no type errors)"
        status: pass
    human_judgment: true
    rationale: "No browser/live-session smoke test was run against a real logged-out request in this environment — the SSR branch logic and build output were verified statically, but an actual anonymous page load has not been visually confirmed."

# Metrics
duration: ~15min
completed: 2026-08-07
status: complete
---

# Phase 23 Plan 03: Public Catalogue Browse (Anonymous-Safe loadCatalogPage) Summary

**Made `loadCatalogPage` null-safe for anonymous callers and opened `/sync/catalog` to logged-out visitors, closing RESEARCH Pitfall 3's uuid-filter crash.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2
- **Files modified:** 3 (1 new test file, 2 modified)

## Accomplishments
- `loadCatalogPage`'s `buyerUserId` parameter widened to `string | null`; when `null`, `loadBlockedIds` is skipped entirely instead of being called with an anonymous sentinel that would throw `invalid input syntax for type uuid` against a `uuid` column
- First test coverage for `lib/deals/catalog-query.ts` (previously untested): 5 tests covering the anonymous no-throw/no-call path, the empty-projects short-circuit for anon, and the authenticated block-exclusion path (both blocked-owner and non-blocked-owner cases)
- `/sync/catalog` now branches on session presence: no user → public browse via `loadCatalogPage(service, null, ...)` rendered with `CatalogBrowserLight isPublic`; authenticated non-buyer → unchanged redirect to `/sync/access`; buyer → unchanged authenticated embedded experience

## Task Commits

Each task was committed atomically (Task 1 followed the RED/GREEN TDD cycle per its `tdd="true"` flag):

1. **Task 1: Null-safe loadCatalogPage for anonymous callers**
   - `926c1f5` (test — RED, failing against the old string-only signature)
   - `3743028` (feat — GREEN, null-safe branch added, all 5 tests pass)
2. **Task 2: Open /sync/catalog to logged-out visitors** - `115e889` (feat)

**Plan metadata:** committed with this SUMMARY (docs)

## Files Created/Modified
- `lib/deals/catalog-query.ts` - `loadCatalogPage`'s `buyerUserId` widened to `string | null`; skips `loadBlockedIds` when null
- `lib/deals/catalog-query.test.ts` - new: 5 tests (anonymous no-throw/no-call, empty-projects short-circuit, authenticated block-exclusion applied and unblocked-pass-through)
- `app/sync/catalog/page.tsx` - branches on `user` presence: anonymous → public `isPublic` render; authenticated non-buyer → redirect; buyer → unchanged embedded render

## Decisions Made
- Kept the single `loadCatalogPage` implementation rather than forking a parallel public function, per the file's own existing single-implementation doctrine (both the SSR page and any future public API path share this one fix)
- Anonymous visitors render `CatalogBrowserLight isPublic` (not `embedded`) — the public visitor gets the component's own self-contained header with its Login button; `BuyerTopNav` remains reserved for authenticated buyer-portal members (this matches the plan's explicit direction and RESEARCH's system architecture diagram)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `/sync/catalog` is now publicly browsable, satisfying locked directive 4 (logged-out browse + simulated preview playback, no auth wall)
- Engagement gating (shortlist/License popping the login/register modal for an anonymous visitor) is intentionally left as a hook point for 23-07, which will wire the actual `LoginRegisterModal` — `CatalogBrowserLight`'s `isPublic` Login button remains a no-op until then, matching the plan's stated scope boundary
- No blockers for subsequent Phase 23 plans

---
*Phase: 23-buyer-onboarding-login-register*
*Completed: 2026-08-07*

## Self-Check: PASSED

All created/modified files found on disk; all 3 task commits (926c1f5, 3743028, 115e889) verified present in git log.
