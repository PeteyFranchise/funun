---
phase: 11-presence-messaging
plan: 06
subsystem: ui
tags: [react, nextjs, supabase-realtime-presence, profile]

requires:
  - phase: 11-presence-messaging (Plan 03)
    provides: dm_threads status/requester_id/last_seen_at schema (migration 054/055)
  - phase: 11-presence-messaging (Plan 04)
    provides: presence-global Realtime channel via PresenceTracker (tracked in app/(artist)/layout.tsx)
provides:
  - ProfilePresenceDot client component reading presence-global for live Online pill
  - Profile Message button now links to /messages?with={ownerId} instead of mounting an in-place widget
  - app/u/[handle]/page.tsx no longer builds DmState
affects: [11-05 (/messages page — must handle ?with= query param), 11-presence-messaging phase verification]

tech-stack:
  added: []
  patterns:
    - "Read-only Realtime Presence subscriber: join the shared channel without calling track(), derive membership from presenceState() on sync/join/leave"

key-files:
  created:
    - components/profile/ProfilePresenceDot.tsx
  modified:
    - components/profile/ProfileView.tsx
    - app/u/[handle]/page.tsx
    - lib/profile/load.ts

key-decisions:
  - "Added ProfileData.id (populated in lib/profile/load.ts from profile.id) so ProfileView has the owner's user id for both the presence dot and the Message link — plan explicitly authorized threading this through if not already present on the data shape"
  - "Deleted components/profile/DmWidget.tsx outright (grepped for other importers first — only ProfileView.tsx and app/u/[handle]/page.tsx referenced it); its bubble/composer/realtime JSX patterns are documented as already carrying forward into DockedWidget/ConversationView per Plan 05"
  - "Removed the stale 'Direct messaging is rolling out next' placeholder notice in ProfileView since the Message link is now live (Rule 1 — the notice contradicted the new behavior)"

patterns-established:
  - "ProfilePresenceDot: presence-global read-only join (key: '') vs. PresenceTracker's write join (key: userId) — same channel name, two distinct join purposes"

requirements-completed: [PRESENCE-01, CONNECT-03, CONNECT-05]

coverage:
  - id: D1
    description: "Profile avatar renders a live emerald 'Online' pill only when the profile owner currently has a presence-global entry, never from a stale last_seen_at"
    requirement: "PRESENCE-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (components/profile/ProfilePresenceDot.tsx clean)"
        status: pass
    human_judgment: true
    rationale: "Realtime Presence behavior (two browser sessions, one going online/offline) can only be confirmed by live manual verification against a running Supabase Realtime connection — no automated test harness exists for Presence channel behavior in this repo."
  - id: D2
    description: "Profile Message button for visitors is a Link to /messages?with={ownerId}; in-place DmWidget mount removed from ProfileView"
    requirement: "CONNECT-03"
    verification:
      - kind: unit
        ref: "grep '/messages?with=' components/profile/ProfileView.tsx"
        status: pass
      - kind: unit
        ref: "__tests__/profile-load.test.ts, __tests__/profile-roles-validation.test.ts (11/11 pass)"
        status: pass
    human_judgment: false
  - id: D3
    description: "app/u/[handle]/page.tsx no longer builds DmState (loadConversation/findThread removed); explicit-column artist_profiles select preserved"
    requirement: "CONNECT-05"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (repo-wide clean)"
        status: pass
      - kind: unit
        ref: "grep -c \"select('*')\" on artist_profiles in app/u/[handle]/page.tsx → 0"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-07-13
status: complete
---

# Phase 11 Plan 06: Profile Presence & Message Link Summary

**ProfilePresenceDot reads the shared presence-global Realtime Presence channel to drive the profile avatar's live "Online" pill; the profile Message button now links to /messages?with={ownerId} and the in-place DmWidget is retired.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-13T19:14:16-04:00 (base commit)
- **Completed:** 2026-07-13T19:21:44-04:00
- **Tasks:** 2
- **Files modified:** 4 (1 created, 2 modified, 1 deleted) + 1 additional file (`lib/profile/load.ts`) threaded through for `ProfileData.id`

## Accomplishments
- `ProfilePresenceDot` client component: joins the shared `presence-global` channel read-only (no `track()` call), derives `online` from `presenceState()[targetUserId]` on `sync`/`join`/`leave`, renders the exact emerald "Online" pill markup only when truthy — otherwise renders `null` (honesty rule, PRESENCE-01/D-22)
- `ProfileView.tsx` mounts `<ProfilePresenceDot targetUserId={data.id} />` in the avatar's live-pill slot, replacing the honest-stub `PresenceDot({ online })` function which is now removed
- Visitor Message affordance is a single `<Link href="/messages?with={ownerId}">` (D-02) — the `DmWidget` mount and its `dm`/`DmState` prop are gone from `ProfileView`
- `components/profile/DmWidget.tsx` deleted (confirmed no other importers via grep); its JSX/realtime patterns are documented in the UI-SPEC as already carrying forward into Plan 05's `DockedWidget`/`ConversationView`
- `app/u/[handle]/page.tsx` no longer builds `DmState` — the `loadConversation`/`findThread` calls and the demo/real `dm = {...}` blocks are removed; every other prop (connect/follow/wall/endorsements/comments/activity) is unchanged and the explicit-column `artist_profiles` select is untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: ProfilePresenceDot — live 'Online' pill from the presence channel** - `0ccd91c` (feat)
2. **Task 2: ProfileView — mount live dot, Message button → /messages link; simplify DmWidget + page** - `356ca0e` (feat)

_Note: Task 2's commit also includes the `lib/profile/load.ts` change (adding `ProfileData.id`) and the removal of the stale "Direct messaging is rolling out next" notice, both deviations documented below._

## Files Created/Modified
- `components/profile/ProfilePresenceDot.tsx` - New read-only presence-global subscriber; renders the live Online pill
- `components/profile/ProfileView.tsx` - Mounts `ProfilePresenceDot`, removes the old `PresenceDot` stub, replaces the DmWidget mount with a `/messages?with=` Link, removes the `dm`/`DmState` prop, removes the stale DM-placeholder stub
- `app/u/[handle]/page.tsx` - Removes `DmState` construction (`loadConversation`/`findThread` calls, demo and real `dm` objects) and the `dm={dm}` prop pass
- `components/profile/DmWidget.tsx` - **Deleted** (no remaining importers)
- `lib/profile/load.ts` - Adds `id: profile.id` to the `ProfileData` object built by `buildProfileData()`

## Decisions Made
- Threaded `ProfileData.id` through `lib/profile/load.ts` (not in the plan's `files_modified` list) because `ProfileView` needed the profile owner's user id for both `ProfilePresenceDot`'s `targetUserId` and the Message link's `href` — the plan explicitly authorized this ("If `data` does not already carry the owner user id, thread it through... it is available at the page as `profile.id`"). This is additive only (new field, no existing consumer broken) and used identically by both `/u/[handle]` and `/profile` (owner mode) callers of `buildProfileData()`.
- Deleted `DmWidget.tsx` rather than leaving it orphaned, per the plan's explicit choice — grepped for `import.*DmWidget` / `import.*DmState` first and confirmed only `ProfileView.tsx` and `app/u/[handle]/page.tsx` referenced it (both already being updated in this plan).
- Removed the "Direct messaging is rolling out next" placeholder `<div>` in `ProfileView.tsx` (Rule 1 — auto-fix bug): this notice was left over from before DMs existed and now directly contradicts the live Message link sitting right above it in the action row.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Threaded `ProfileData.id` through `lib/profile/load.ts`**
- **Found during:** Task 2 (ProfileView mount changes)
- **Issue:** Neither `ProfileView`'s `ProfileData` type nor `buildProfileData()`'s return object carried the profile owner's raw user id — both `ProfilePresenceDot`'s `targetUserId` prop and the new Message `Link`'s `href` need it, and no other prop reliably carries it in every calling context (owner mode has no `connect`/`follow` state).
- **Fix:** Added `id: string` to `ProfileData` and populated it as `profile.id` in `buildProfileData()`.
- **Files modified:** `components/profile/ProfileView.tsx`, `lib/profile/load.ts`
- **Verification:** `npx tsc --noEmit` clean; `__tests__/profile-load.test.ts` (11/11) still passes.
- **Committed in:** `356ca0e` (Task 2 commit)

**2. [Rule 1 - Bug] Removed stale "Direct messaging is rolling out next" stub notice**
- **Found during:** Task 2 (ProfileView Message-button block edit)
- **Issue:** A dashed-border placeholder div below the Releases card still told visitors "Direct messaging is rolling out next," directly contradicting the now-live Message link in the action row above it.
- **Fix:** Removed the stub `<div>` and its stale comment.
- **Files modified:** `components/profile/ProfileView.tsx`
- **Verification:** Visual inspection of the diff; no other reference to the stub text found via grep.
- **Committed in:** `356ca0e` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both were necessary to complete the plan's stated `must_haves` without breaking the build or leaving contradictory UI copy. No scope creep — no new features added beyond what the plan specified.

## Issues Encountered
- `npm run build` fails at the static-export stage on `/signup` with `either NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY env variables ... are required!` — this worktree has no `.env.local` (only `.env.example` is present) and the failure is unrelated to this plan's files (compilation itself succeeded: "Compiled successfully in 26.7s"; the error occurs during page prerendering for an unrelated auth route). `npx tsc --noEmit` is clean repo-wide and the full `npm test` suite (154/154, 22 suites) passes, including both profile-load test files. This is an environment/secrets gap, not a regression introduced by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 05 (`/messages` page) must handle the `?with={ownerId}` query param on load to resolve/open the correct thread — the profile Message link now depends on that contract (already anticipated in the UI-SPEC's `MessagesPageClient` `initialWith` handling).
- `PresenceTracker` (Plan 04) must remain mounted at the layout root for `ProfilePresenceDot` to ever observe a non-empty `presenceState()` — no new dependency introduced beyond what Plan 04 already established.
- No blockers for the remaining phase verification; live-backend manual verification (two-session Online pill check, Message-link click-through once `/messages` exists) is still needed per this plan's `<verification>` block and is deferred to end-of-phase human UAT per project config (`human_verify_mode: end-of-phase`).

---
*Phase: 11-presence-messaging*
*Completed: 2026-07-13*
