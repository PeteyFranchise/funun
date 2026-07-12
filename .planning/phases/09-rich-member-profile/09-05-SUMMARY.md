---
phase: 09-rich-member-profile
plan: 05
subsystem: ui
tags: [nextjs, react, tailwind, supabase, profile]

# Dependency graph
requires:
  - phase: 09-01b
    provides: allow_resharing column + migration 043 GRANT SELECT, featured_project_id API pre-check
  - phase: 09-02
    provides: AvatarBannerUpload component
  - phase: 09-04
    provides: ShareButton, ProfileMoreMenu, FeaturedPicker components
provides:
  - ProfileView.tsx fully assembled with all Phase 9 profile surfaces
  - Honest presence-dot slot (inert until Phase 11 wires Realtime Presence)
  - Placements landed stat row with money-gradient + self-reported caption
  - Owner Share/avatar-banner-upload/Featured-picker mounted and wired
  - Visitor more-options menu gated on allow_resharing (server-side)
  - app/u/[handle]/page.tsx and app/profile/page.tsx feed profileUrl/allowResharing/ownerReleases/currentFeaturedId into ProfileView
affects: [phase-10-connections-notifications, phase-11-presence-messaging, phase-13-network-trust-safety]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PresenceDot renders nothing when `online` is undefined/false — the honest-default pattern for slots awaiting a future phase's real signal"
    - "Absolute profileUrl resolved server-side from NEXT_PUBLIC_APP_URL (loud throw if unconfigured) so Web-Share can fire synchronously with no leading await"

key-files:
  created: []
  modified:
    - components/profile/ProfileView.tsx
    - app/u/[handle]/page.tsx
    - app/profile/page.tsx

key-decisions:
  - "app/profile/page.tsx (owner self-view) updated alongside the plan's two listed files — ProfileView's new profileUrl/allowResharing props are required, and this file also mounts <ProfileView mode=\"owner\">; leaving it unmodified would break `npm run build` (Rule 3 blocking-issue auto-fix)"
  - "FeaturedPicker mounted inside the existing `data.featured &&` section (matches plan's line-265 pointer); for owner mode `data.featured` is derived from ALL projects (not just public ones), so the picker is reachable whenever the owner has at least one project"
  - "profile.handle can be null for a brand-new owner; app/profile/page.tsx falls back to the bare NEXT_PUBLIC_APP_URL root rather than constructing an invalid /u/ path"

requirements-completed: [PROFILE-01, PROFILE-03, PROFILE-06, PROFILE-08, PROFILE-09]

coverage:
  - id: D1
    description: "Presence-dot slot renders nothing until Phase 11 wires a real online signal (no hardcoded Online)"
    requirement: "PROFILE-01"
    verification:
      - kind: unit
        ref: "grep -c '>Online<' components/profile/ProfileView.tsx -> 0"
        status: pass
      - kind: unit
        ref: "grep -Ec '\\.channel\\(|postgres_changes' components/profile/ProfileView.tsx -> 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "Placements landed stat renders in Followers -> Monthly listeners -> Placements landed -> Avg. readiness order with money-gradient value and a single self-reported caption"
    requirement: "PROFILE-06"
    verification:
      - kind: unit
        ref: "grep -c 'Placements landed' components/profile/ProfileView.tsx -> 1"
        status: pass
      - kind: unit
        ref: "grep -c 'Self-reported by artist' components/profile/ProfileView.tsx -> 1"
        status: pass
    human_judgment: false
  - id: D3
    description: "Owner sees a working Share button, avatar/banner upload affordances, and a Featured picker"
    requirement: "PROFILE-09"
    verification:
      - kind: unit
        ref: "grep -c 'ShareButton\\|AvatarBannerUpload\\|FeaturedPicker' components/profile/ProfileView.tsx -> >=1 each"
        status: pass
    human_judgment: true
    rationale: "Visual/functional confirmation (upload persistence, share sheet behavior, picker pin/unpin flow) requires a human to click through the running app per 09-VALIDATION.md"
  - id: D4
    description: "Visitor sees Follow/Message plus a one-item more-options menu, omitted server-side when allow_resharing is false"
    requirement: "PROFILE-08"
    verification:
      - kind: unit
        ref: "grep -c 'allowResharing' components/profile/ProfileView.tsx -> >=1 (ProfileMoreMenu gated inside allowResharing && conditional)"
        status: pass
    human_judgment: true
    rationale: "Confirming the affordance actually disappears for a logged-out viewer when the owner toggles resharing off requires a live manual check per 09-VALIDATION.md"
  - id: D5
    description: "PROFILE-03 (location + tenure) confirmed unchanged after this plan's edits"
    requirement: "PROFILE-03"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (data.location/data.since render block untouched)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Whole app type-checks and builds with the assembled profile (new required ProfileView props wired everywhere it's mounted)"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: unit
        ref: "npm run build"
        status: pass
      - kind: unit
        ref: "npx jest (58/58 passing)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-12
status: complete
---

# Phase 9 Plan 05: Rich Member Profile Integration Summary

**Wired every Phase 9 profile surface (presence dot, placements stat, Share/upload/Featured-picker for owners, gated more-options menu for visitors) into ProfileView.tsx and its two page callers, closing out the rich member profile milestone.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-12T09:57:47Z
- **Completed:** 2026-07-12T10:06:23Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Presence-dot slot on the avatar renders nothing until Phase 11 wires a real signal — no false "Online", no Realtime subscription
- Placements landed stat inserted in the correct order (Followers → Monthly listeners → Placements landed → Avg. readiness) with money-gradient styling and a single "Self-reported by artist" caption under the Stats card header
- Owner view: dead Share stub replaced with a wired `ShareButton`; `AvatarBannerUpload` mounted on both banner and avatar; `FeaturedPicker` mounted as an owner-only control in the Featured section header
- Visitor view: `ProfileMoreMenu` mounted after Follow/Message, server-side gated on the owner's `allow_resharing` setting (never a CSS-only hide)
- `app/u/[handle]/page.tsx` reads `allow_resharing` (kept in sync with migration 043's GRANT SELECT) and builds an absolute `profileUrl` from `NEXT_PUBLIC_APP_URL` server-side
- `app/profile/page.tsx` (owner self-view) updated to supply the same new required props, keeping the whole app buildable

## Task Commits

Each task was committed atomically:

1. **Task 1: Presence dot slot + placements stat + self-reported caption in ProfileView** - `87e0f14` (feat)
2. **Task 2: Mount Share button, avatar/banner upload, Featured picker (owner) + more-options menu (visitor)** - `9ded970` (feat)
3. **Task 3: Feed allow_resharing, owner releases, and profileUrl from the page** - `47810e0` (feat)

_No TDD tasks in this plan._

## Files Created/Modified
- `components/profile/ProfileView.tsx` - Added `PresenceDot`, Placements landed stat row + caption, mounted `ShareButton`/`AvatarBannerUpload`/`FeaturedPicker`/`ProfileMoreMenu`, new props (`profileUrl`, `allowResharing`, `ownerReleases`, `currentFeaturedId`)
- `app/u/[handle]/page.tsx` - Added `allow_resharing` to the public SELECT list, builds absolute `profileUrl`, `allowResharing`, `ownerReleases`, `currentFeaturedId` and passes them to `ProfileView`
- `app/profile/page.tsx` - Updated (out-of-plan-scope but required for build compatibility) to supply the same new `ProfileView` props for the owner self-view path

## Decisions Made
- `app/profile/page.tsx` was modified even though it wasn't in this plan's `files_modified` list, because `ProfileView`'s new `profileUrl`/`allowResharing` props are required (not optional) and this file mounts `<ProfileView mode="owner">` — leaving it unmodified would break `npm run build` (Rule 3: auto-fix blocking issue).
- `FeaturedPicker` is mounted inside the existing `data.featured &&` conditional (per the plan's line-265 pointer) rather than restructured to always render — for owner mode, `data.featured` derives from ALL of the owner's projects (not just public ones, per `buildProfileData({ publicOnly: false })`), so the picker is reachable as soon as the owner has at least one project, matching the plan's intent without rebuilding already-correct shipped UI.
- `app/profile/page.tsx`'s `profileUrl` falls back to the bare `NEXT_PUBLIC_APP_URL` root when `profile.handle` is null (new owner, no handle set yet) rather than constructing an invalid `/u/` path; `app/u/[handle]/page.tsx` never hits this case since it's reached via a resolved handle.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated app/profile/page.tsx to supply ProfileView's new required props**
- **Found during:** Task 3 (`npx tsc --noEmit` after wiring `app/u/[handle]/page.tsx`)
- **Issue:** `ProfileView`'s signature now requires `profileUrl: string` and `allowResharing: boolean` (Task 2). `app/profile/page.tsx` — the owner self-view page, not listed in this plan's `files_modified` — also renders `<ProfileView mode="owner">` and was missing these props, breaking `tsc --noEmit` and `npm run build`.
- **Fix:** Added the same absolute-URL-from-`NEXT_PUBLIC_APP_URL` computation (with a handle-null fallback to the app root), `allowResharing` from `profile.allow_resharing`, and `ownerReleases`/`currentFeaturedId` built from the already-fetched `projects`, mirroring the pattern used in `app/u/[handle]/page.tsx`.
- **Files modified:** `app/profile/page.tsx`
- **Verification:** `npx tsc --noEmit` clean, `npm run build` succeeds, `npx jest` 58/58 passing
- **Committed in:** `47810e0` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to keep the whole app buildable with ProfileView's new required props; no scope creep — the fix mirrors the exact pattern the plan specified for `app/u/[handle]/page.tsx`.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. `NEXT_PUBLIC_APP_URL` is an existing env var already consumed elsewhere in the app (`lib/notifications/index.ts`, `app/api/pitches/route.ts`, etc.); no new secret or dashboard step is introduced.

## Next Phase Readiness
- Phase 9 (Rich Member Profile) is now fully assembled: all 9 PROFILE-* requirements are wired into the live `/u/[handle]` and `/profile` pages.
- Manual UAT still outstanding per `09-VALIDATION.md`: owner avatar/banner upload persistence, resharing-toggle-off visitor-affordance disappearance, presence-dot honest-nothing confirmation, Placements landed row visual check.
- Phase 11 (Presence & Messaging) is the natural next consumer of the `PresenceDot`'s `online` prop slot — no code changes needed here, just pass a real value once Realtime Presence exists.

---
*Phase: 09-rich-member-profile*
*Completed: 2026-07-12*

## Self-Check: PASSED

All created/modified files confirmed present on disk; all 3 task commit hashes (87e0f14, 9ded970, 47810e0) confirmed in git log.
