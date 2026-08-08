---
phase: 26-sync-library-inclusion
plan: 08
subsystem: ui
tags: [nextjs, react, tailwind, server-component, capability-grants, sync-library]

# Dependency graph
requires:
  - phase: 26-sync-library-inclusion (26-01)
    provides: sync_listings table (migration 096, live) and capability_grants sync_library/admin_invited extension
  - phase: 26-sync-library-inclusion (26-05)
    provides: "POST /api/sync-library/invite mints the approved, admin_invited sync_library capability_grants row this card's visibility check reads"
provides:
  - "InvitedSpotlightCard: non-dismissible gradient-CTA card, locked copy per 26-UI-SPEC.md Screen B / Per-Surface Copywriting #1"
  - "Server-gated mount at the top of /dashboard: approved admin_invited sync_library grant AND zero sync_listings rows"
affects: [26-09 (nav 'New' dot / hub gating), sync-library-admin-console]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Service-role capability_grants + sync_listings read inside the dashboard server component, mirroring app/(artist)/layout.tsx's existing capability read doctrine (never fetched client-side)"

key-files:
  created:
    - components/sync-library/InvitedSpotlightCard.tsx
  modified:
    - app/(artist)/dashboard/page.tsx

key-decisions:
  - "Visibility check reads capability_grants unfiltered on status/source (just profile_id + capability='sync_library'), then checks status==='approved' && source==='admin_invited' in code — mirrors the exact read shape already used by app/api/sync-library/submit/route.ts, rather than pushing the filter into the query."
  - "DEMO mode (NEXT_PUBLIC_VAULT_DEMO=true) never shows the card — there is no real authenticated user/capability_grants row to resolve against, consistent with how the DEMO branch already skips credits preview and Your next moves."
  - "Card is a plain server component (no 'use client', no dismiss state) per 26-CONTEXT.md decision #3 (not dismissible) and the plan's explicit instruction."

requirements-completed: [SYNCLIB-05]

coverage:
  - id: D1
    description: "InvitedSpotlightCard renders the locked copy (eyebrow 'Invitation', heading 'You're invited to the Sync Library', body, gradient 'Review invitation' CTA to /vault) using artist dark tokens, no dismiss control"
    requirement: SYNCLIB-05
    verification:
      - kind: other
        ref: "npx tsc --noEmit (clean)"
        status: pass
    human_judgment: true
    rationale: "Visual/copy fidelity to 26-UI-SPEC.md and non-dismissible interaction behavior require a rendered-page check; no automated UI test exists for this component."
  - id: D2
    description: "Card renders only for an artist with an approved admin_invited sync_library grant and zero sync_listings rows; absent for uninvited artists and for invited artists with ≥1 listing"
    requirement: SYNCLIB-05
    verification:
      - kind: other
        ref: "npx tsc --noEmit (clean); npm run build (green); npx jest (146 suites / 1723 tests, all pass)"
        status: pass
    human_judgment: true
    rationale: "Gating logic depends on live capability_grants/sync_listings rows against a real Supabase session — deferred to manual verification per this plan's own <verification> section (create an admin_invited grant, confirm the card shows, add a song, confirm it disappears)."

# Metrics
duration: 20min
completed: 2026-08-08
status: complete
---

# Phase 26 Plan 08: Invited Spotlight Card Summary

**Non-dismissible gradient-CTA spotlight card at the top of `/dashboard`, gated server-side on an approved `admin_invited` sync_library grant with zero `sync_listings` rows — the artist's single entry point into the invited sync-library path.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2/2 complete
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `InvitedSpotlightCard` — a server component rendering the locked copy from 26-UI-SPEC.md Screen B / Per-Surface Copywriting #1 exactly: "Invitation" eyebrow, "You're invited to the Sync Library" heading, the Funūn-representation body copy, and a single gradient "Review invitation" CTA linking to `/vault`. Built entirely from artist dark tokens (`bg-card2`, `border-hairstrong`, `bg-grad`, `.gtext`, `shadow-cta`) — no admin `.fncon` classes, no dismiss affordance, `font-semibold` only.
- `/dashboard` resolves the card's visibility server-side before render: a service-role read of `capability_grants` (filtered by `profile_id` + `capability='sync_library'`, checked in code for `status==='approved' && source==='admin_invited'`) combined with a `sync_listings` row-count check for the same artist. The card mounts above "Your next moves", below the page header, only when both conditions hold.
- The card disappears on its own the moment the artist adds a song to the sync-library flow (a `sync_listings` row then exists) — no dismiss flag was needed to satisfy the locked non-dismissible + auto-disappearing behavior.
- DEMO mode (`NEXT_PUBLIC_VAULT_DEMO=true`) never renders the card, matching the existing DEMO-branch convention of skipping features that require a real authenticated session.

## Task Commits

Each task was committed atomically:

1. **Task 1: InvitedSpotlightCard component** - `d2cadc8` (feat)
2. **Task 2: Server-gated mount at the top of /dashboard** - `6f8a439` (feat)

## Files Created/Modified
- `components/sync-library/InvitedSpotlightCard.tsx` - Non-dismissible spotlight card, locked copy, gradient CTA to `/vault`
- `app/(artist)/dashboard/page.tsx` - `resolveInvitedSpotlightVisibility()` helper (service-role `capability_grants` + `sync_listings` read) and the gated mount above "Your next moves"

## Decisions Made
- Read `capability_grants` unfiltered on `status`/`source` in the query (just `profile_id` + `capability='sync_library'`), then apply the `status==='approved' && source==='admin_invited'` check in code — mirrors the exact single-row read shape `app/api/sync-library/submit/route.ts` already established for the same table, rather than inventing a narrower filtered query.
- Skipped the card entirely in the `DEMO` branch — there's no real authenticated user or `capability_grants` row to resolve against in demo mode, consistent with how credits preview and "Your next moves" already behave there.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The dashboard now has a working, server-gated invited-spotlight surface for 26-09 (new-feature highlight / nav "New" dot / hub gating) to build alongside without any further schema or read-pattern work.
- Manual end-to-end verification (mint an `admin_invited` grant via `POST /api/sync-library/invite`, confirm the card renders, add a song via the Vault self-apply flow from 26-07, confirm it disappears) is deferred to the phase gate per this plan's own `<verification>` section — no blocker, `npx tsc --noEmit`, `npm run build`, and the full `npx jest` suite (146 suites / 1723 tests) all pass.

---
*Phase: 26-sync-library-inclusion*
*Completed: 2026-08-08*

## Self-Check: PASSED

- FOUND: components/sync-library/InvitedSpotlightCard.tsx
- FOUND: app/(artist)/dashboard/page.tsx
- FOUND: .planning/phases/26-sync-library-inclusion/26-08-SUMMARY.md
- FOUND commit: d2cadc8
- FOUND commit: 6f8a439
