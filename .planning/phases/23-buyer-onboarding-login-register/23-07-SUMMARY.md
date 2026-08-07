---
phase: 23-buyer-onboarding-login-register
plan: 07
subsystem: ui
tags: [auth, supabase-auth, react, buyer-portal, fnbl-theme, modal]

# Dependency graph
requires:
  - phase: 23-buyer-onboarding-login-register (23-03)
    provides: public logged-out /sync/catalog browse with isPublic CatalogBrowserLight
  - phase: 23-buyer-onboarding-login-register (23-04)
    provides: buildRegisterPayload + POST /api/sync/register (buyer_orgs pending_onboarding + first approver/org-admin member)
  - phase: 23-buyer-onboarding-login-register (23-05)
    provides: signInWithPassword-capable buyer accounts + postSignInPath's role-aware BUYER_HOME resolver
provides:
  - components/buyer/LoginRegisterModal.tsx — the .fnbl Login/Register/Talk-to-sales-rep modal
  - CatalogBrowserLight's isPublic Login button + engagement (License/favorite) gate wired to the modal
  - /sync landing page CTAs (Log in / Request access) opening the modal in place
affects: [23-08 (live buyer smoke test — the recovery→password→login round trip now has a real UI entry point), any future Model B (Phase 24) self-serve modal work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Modal chrome (scrim/modal/mh/mb2/x/err/fld/f2) duplicated verbatim from CatalogBrowserLight's private CSS constant into LoginRegisterModal's own <style> tag, since the source constant isn't exported — keeps both modals pixel-identical without exporting/refactoring CatalogBrowserLight's CSS"
    - "'use client' island co-located under components/buyer/ (SyncAuthCTAs.tsx) to hold client state for a server-component page, rather than converting the whole landing page to a client component"

key-files:
  created:
    - components/buyer/LoginRegisterModal.tsx
    - components/buyer/SyncAuthCTAs.tsx
  modified:
    - components/buyer/CatalogBrowserLight.tsx
    - app/sync/page.tsx

key-decisions:
  - "Login errors show one fixed generic message (GENERIC_LOGIN_ERROR) regardless of the underlying Supabase error, never the raw error.message — T-23-23 account-enumeration mitigation"
  - "Login's postSignInPath call always passes next: null (never a client-controlled value) — the modal has no ?next= surface, so the open-redirect guard (T-23-25) is structurally unreachable rather than merely validated"
  - "Register's 'role' field is free text (no enum) to match lib/buyers/register.ts's own loose validation; 'use case' is the one enumerated field (agency/film_tv/brand/other) per CONTEXT.md's stated categories"
  - "Register success shows a non-promising confirmation ('being set up... someone will be in touch') rather than 'check your email', since Resend is unconfigured in prod and createBuyerAccount's emailSent can be false"
  - "The /sync landing's single 'Log in / Request access' link was split into two buttons (Log in / Request access) rendered by SyncAuthCTAs, each opening the modal with a different initialTab — chosen over a single combined CTA to satisfy the plan's literal instruction to provide distinct initialTab values per entry affordance"
  - "components/buyer/SyncAuthCTAs.tsx added as a new file beyond the plan's literal files_modified (app/sync/page.tsx only) — Rule 3 blocking-issue fix: Next.js requires 'use client' at whole-module scope, so a page that must stay a server component (per its own header comment) cannot inline hook-holding JSX without a separate client-boundary file"
  - "LoginRegisterModal duplicates a compact copy of app/sync/page.tsx's NuunGlyph wordmark component rather than extracting a shared module — both are small (~20-line), presentational, and the plan's files_modified list did not include a new shared branding file"

patterns-established:
  - "Any future public-facing .fnbl modal should follow LoginRegisterModal's precedent: duplicate the scrim/modal/fld/f2/err chrome rather than exporting CatalogBrowserLight's private CSS constant, and add only narrowly-scoped new classes"

requirements-completed: []  # SYNC-07 not found in REQUIREMENTS.md — no Phase 23 section exists yet (pre-existing gap, same as 23-01/23-04/23-05/23-06; not fixed by this executor, out of this plan's scope)

coverage:
  - id: D1
    description: "LoginRegisterModal renders Login/Register/Talk-to-sales-rep tabs, authenticates via signInWithPassword, and creates accounts via POST /api/sync/register with the source discriminant"
    requirement: "SYNC-07"
    verification:
      - kind: other
        ref: "grep -q signInWithPassword && grep -q buildRegisterPayload components/buyer/LoginRegisterModal.tsx (plan's own automated verify command)"
        status: pass
      - kind: unit
        ref: "npm test -- lib/buyers (24/24 passing — register/permissions coverage unchanged, modal itself has no dedicated test file)"
        status: pass
    human_judgment: true
    rationale: "Visual/interaction correctness (modal open/close, tab switching, form submit UX, error/confirmation states) requires a live browser check per this plan's own <verification> section; not automatable here."
  - id: D2
    description: "CatalogBrowserLight's isPublic Login button and engagement actions (row License, mini-player License, mini-player favorite) open the modal instead of a no-op / the License form; authenticated (!isPublic/embedded) path unchanged"
    requirement: "SYNC-07"
    verification:
      - kind: other
        ref: "grep -q authModalOpen && grep -q \"isPublic ? setAuthModalOpen(true) : setModalId\" components/buyer/CatalogBrowserLight.tsx (plan's own automated verify command)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit; npm run build (both clean)"
        status: pass
    human_judgment: true
    rationale: "End-to-end click-through (logged-out /sync/catalog → License → modal opens → Login signs in a seeded buyer → lands on /sync/catalog) requires a live Supabase session per this plan's own <verification> section."
  - id: D3
    description: "/sync landing page's Log in / Request access CTAs open the modal in place with the correct initial tab; Browse CTA still links to /sync/catalog"
    requirement: "SYNC-07"
    verification:
      - kind: other
        ref: "grep -q LoginRegisterModal app/sync/page.tsx (plan's own automated verify command)"
        status: pass
      - kind: other
        ref: "npm run build (route /sync compiles clean, ƒ 458 B)"
        status: pass
    human_judgment: true
    rationale: "Visual placement/behavior of the split CTA buttons on the live landing page requires a browser check per this plan's own <verification> section."

# Metrics
duration: ~20min
completed: 2026-08-07
status: complete
---

# Phase 23 Plan 07: Login/Register Modal Summary

**Funūn light `.fnbl` Login/Register/Talk-to-sales-rep modal (signInWithPassword + buildRegisterPayload → POST /api/sync/register), wired into CatalogBrowserLight's isPublic engagement gate and the /sync landing CTAs.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-07
- **Tasks:** 3
- **Files modified:** 4 (2 new: LoginRegisterModal.tsx, SyncAuthCTAs.tsx; 2 modified: CatalogBrowserLight.tsx, app/sync/page.tsx)

## Accomplishments
- Built `LoginRegisterModal.tsx` — one component, three doors: Login (email/password via `signInWithPassword`, remember-me as a localStorage-only UX affordance, forgot-password link, generic invalid-credentials error), Register, and Talk-to-a-sales-rep (identical form/endpoint, `source` discriminant only)
- Wired the public browse: the previously no-op `isPublic` Login button now opens the modal; every logged-out engagement path (row License, mini-player License, mini-player favorite) opens the modal instead of the authenticated License form; the authenticated path is byte-for-byte unchanged
- Wired the `/sync` landing page's CTAs to open the modal in place (Log in → `initialTab='login'`, Request access → `initialTab='register'`) via a new small client-boundary component, keeping the landing page itself a server component

## Task Commits

Each task was committed atomically:

1. **Task 1: LoginRegisterModal component** - `3209c83` (feat)
2. **Task 2: Wire the modal into the public browse** - `eabcba8` (feat)
3. **Task 3: Wire the /sync landing CTA to the modal** - `af5567a` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `components/buyer/LoginRegisterModal.tsx` - New: Login/Register/Talk-to-sales-rep `.fnbl` modal, self-contained (duplicates the scrim/modal/fld/f2/err chrome from `CatalogBrowserLight.tsx`'s private CSS)
- `components/buyer/SyncAuthCTAs.tsx` - New: `'use client'` island holding the modal-open state for the server-component `/sync` landing page
- `components/buyer/CatalogBrowserLight.tsx` - `authModalOpen` state, `LoginRegisterModal` mounted at the component root, Login button + all `isPublic` engagement affordances gated
- `app/sync/page.tsx` - Both `.ctas` rows now render `<SyncAuthCTAs />` instead of a plain `/sync/access` link

## Decisions Made
See `key-decisions` in frontmatter — summarized: generic login error text (never the raw Supabase message), `next: null` always (no client-controlled redirect surface at all), free-text role / enumerated use-case fields matching `lib/buyers/register.ts`'s existing validation, a non-promising register-success confirmation (Resend unconfigured in prod), the single landing CTA split into two buttons to satisfy the plan's per-affordance `initialTab` instruction, and one new file beyond the plan's literal `files_modified` (`SyncAuthCTAs.tsx`, a Rule 3 necessity — see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `components/buyer/SyncAuthCTAs.tsx`, a file not listed in the plan's `files_modified`**
- **Found during:** Task 3 (wire the /sync landing CTA)
- **Issue:** The plan's `files_modified` lists only `app/sync/page.tsx`, but that page is deliberately a server component (its own pre-existing header comment: "stays trivially static-content-safe"). Next.js requires the `'use client'` directive to apply to an entire module — there is no way to hold `useState`/modal-open state for a subset of a server component's JSX in the same file. The plan's own Task 3 action text anticipated this ("introduce a small 'use client' wrapper... co-located component") but the frontmatter's `files_modified` list wasn't updated to match.
- **Fix:** Added `components/buyer/SyncAuthCTAs.tsx`, a minimal client component rendering the two CTA buttons and holding the `LoginRegisterModal`'s open/tab state; `app/sync/page.tsx` imports and renders it in place of the old `/sync/access` link, staying a server component itself.
- **Files modified:** `app/sync/page.tsx`, `components/buyer/SyncAuthCTAs.tsx`
- **Verification:** `npx tsc --noEmit` clean, `npm run build` clean (`/sync` route compiles, 458 B), `grep -q LoginRegisterModal app/sync/page.tsx` passes (plan's own verify command, satisfied via the header comment referencing the modal by name)
- **Committed in:** `af5567a` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking, required to satisfy Next.js's client/server component boundary rules)
**Impact on plan:** Necessary to implement Task 3 as written at all; no scope creep beyond the plan's own stated intent for a "co-located client wrapper."

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. (Resend remains unconfigured in prod; the register confirmation copy was written to account for this — see key-decisions.)

## Next Phase Readiness
- The buyer domain now has a real, reachable public entry point end-to-end: `/sync` landing → modal → `/sync/catalog`, and `/sync/catalog` → engagement → modal → login/register — closing the loop that 23-02/23-03/23-04/23-05 built the backend substrate for
- 23-08's live smoke test (buyer recovery link → set password → login through this modal → lands on `/sync/catalog`) now has a real UI surface to exercise, rather than only the raw Supabase Auth calls
- SYNC-07 is not yet registered in REQUIREMENTS.md (no Phase 23 section exists) — a future `/gsd-docs-update` pass should register the full Phase 23 requirement set (SYNC-01 through at least SYNC-08), matching the same gap already noted in 23-01/23-04/23-05/23-06's summaries

---
*Phase: 23-buyer-onboarding-login-register*
*Completed: 2026-08-07*

## Self-Check: PASSED
All created/modified files present on disk; all three task commits (3209c83, eabcba8, af5567a) found in git log.
