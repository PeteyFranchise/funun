---
phase: 10-connections-notifications
plan: 04
subsystem: api
tags: [notifications, supabase, service-role, best-effort-side-effect, typescript]

# Dependency graph
requires:
  - phase: 10-connections-notifications
    provides: "buildXNotification() builders + createNotification() actor-snapshot args (Plan 01, lib/social/notifications.ts, lib/notifications/index.ts)"
  - phase: 10-connections-notifications
    provides: "migration 044 live (auto-follow-seed trigger etc.) confirmed on remote (Plan 02)"
provides:
  - "new_follower notification fired from app/api/follows/route.ts (explicit follow only)"
  - "wall_post notification fired from app/api/wall/route.ts (to wall owner)"
  - "endorsement notification fired from app/api/endorsements/route.ts (to endorsed member)"
  - "release_comment notification fired from app/api/release-comments/route.ts (to project owner, self-comment suppressed)"
affects: [10-05-notification-bell-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Best-effort notification side effect wrapped in try/catch AFTER the primary mutation via createServiceClient(), copied verbatim in structure from app/api/antenna/opportunities/[opportunityId]/apply/route.ts (RESEARCH Pattern 1)"
    - "Cross-entity recipient resolution: release_comment resolves the project owner (vault_projects.user_id) before notifying, since the comment row only carries author_id"

key-files:
  created: []
  modified:
    - app/api/follows/route.ts
    - app/api/wall/route.ts
    - app/api/endorsements/route.ts
    - app/api/release-comments/route.ts

key-decisions:
  - "Actor name falls back to 'Member' when artist_profiles.artist_name is null, matching lib/social/wall.ts's existing convention; actorHandle/ownHandle fall back to '' so a missing handle degrades the link gracefully rather than throwing"
  - "No connect-accept suppression logic added to follows/route.ts — trigger-seeded follow rows (migration 044) bypass this route entirely, so the route only ever sees genuine explicit follows (RESEARCH Open Question #1, no code change needed)"
  - "release_comment skips the notify (not errors) when project.user_id === user.id, so owners are never notified about their own comments"

requirements-completed: [CONNECT-01, NOTIF-01]

coverage:
  - id: D1
    description: "follows route fires new_follower to the followee on explicit follow only, wrapped in try/catch via createServiceClient() with actor snapshot populated"
    requirement: "NOTIF-01"
    verification:
      - kind: build
        ref: "grep buildNewFollowerNotification app/api/follows/route.ts + npx tsc --noEmit clean"
        status: pass
      - kind: manual
        ref: "VALIDATION.md live-DB check, deferred to /gsd-verify-work"
        status: deferred
    human_judgment: true
  - id: D2
    description: "wall route fires wall_post to the profile owner with actor snapshot, link anchored on the owner's own profile handle"
    requirement: "NOTIF-01"
    verification:
      - kind: build
        ref: "grep buildWallPostNotification app/api/wall/route.ts + npx tsc --noEmit clean"
        status: pass
      - kind: manual
        ref: "VALIDATION.md live-DB check, deferred to /gsd-verify-work"
        status: deferred
    human_judgment: true
  - id: D3
    description: "endorsements route fires endorsement to the endorsed member with actor snapshot"
    requirement: "NOTIF-01"
    verification:
      - kind: build
        ref: "grep buildEndorsementNotification app/api/endorsements/route.ts + npx tsc --noEmit clean"
        status: pass
      - kind: manual
        ref: "VALIDATION.md live-DB check, deferred to /gsd-verify-work"
        status: deferred
    human_judgment: true
  - id: D4
    description: "release-comments route resolves the project owner from vault_projects, fires release_comment to the owner, and suppresses the notify when the commenter is the owner"
    requirement: "CONNECT-01"
    verification:
      - kind: build
        ref: "grep buildReleaseCommentNotification + grep vault_projects app/api/release-comments/route.ts + npx tsc --noEmit clean"
        status: pass
      - kind: manual
        ref: "VALIDATION.md live-DB check, deferred to /gsd-verify-work"
        status: deferred
    human_judgment: true
  - id: D5
    description: "every notify is a best-effort try/catch AFTER the primary mutation and cannot throw out of the route (DoS mitigation T-10-12)"
    requirement: "NOTIF-01"
    verification:
      - kind: build
        ref: "npx tsc --noEmit clean (0 errors) + npm test 80/80 green"
        status: pass
    human_judgment: false

duration: 2min
completed: 2026-07-13
status: complete
---

# Phase 10 Plan 04: Notification Trigger Wiring Summary

**Wired createNotification() into the four existing Phase-10 mutation routes (follows, wall, endorsements, release-comments) as best-effort side effects that fire the correct per-type notification to the correct recipient with actor snapshot, never blocking or failing the primary mutation.**

## Performance

- **Duration:** ~2 min (task commits 462f04d, 47d6f98)
- **Started:** 2026-07-13T02:23:44Z
- **Completed:** 2026-07-13T02:25:51Z
- **Tasks:** 2
- **Files modified:** 4 (0 created, 4 modified)

## Accomplishments
- `app/api/follows/route.ts` — fires `new_follower` to the followee inside the `action === 'follow'` branch only (never on unfollow), best-effort, with actor snapshot (`artist_name`/`avatar_url`/`handle`) resolved from the caller's own `artist_profiles` row
- `app/api/wall/route.ts` — fires `wall_post` to the wall owner (`profileId`); resolves the actor snapshot from `user.id` and the owner's `handle` from `profileId` (the deep-link `/u/{ownHandle}#wall` anchors on the owner's own profile)
- `app/api/endorsements/route.ts` — fires `endorsement` to the endorsed member after the upsert, same owner-handle-for-link pattern (`/u/{ownHandle}#endorsements`)
- `app/api/release-comments/route.ts` — resolves the project OWNER (`vault_projects.user_id`) and release `title` before notifying, fires `release_comment` to the owner with `/r/{projectId}#comments`, and suppresses the notify when the commenter is the owner
- Every notify wraps `createNotification()` in try/catch AFTER the primary mutation via `createServiceClient()`, structurally identical to the canonical `app/api/antenna/opportunities/[opportunityId]/apply/route.ts` pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire new_follower + wall_post into follows/wall routes** - `462f04d` (feat)
2. **Task 2: Wire endorsement + release_comment into endorsements/release-comments routes** - `47d6f98` (feat)

## Files Created/Modified
- `app/api/follows/route.ts` - added best-effort `new_follower` notify in the follow branch
- `app/api/wall/route.ts` - added best-effort `wall_post` notify to the wall owner
- `app/api/endorsements/route.ts` - added best-effort `endorsement` notify to the endorsed member
- `app/api/release-comments/route.ts` - added project-owner resolution + best-effort `release_comment` notify with self-comment suppression

## Decisions Made
- Actor name falls back to `'Member'` (mirroring `lib/social/wall.ts`) and handles fall back to `''` so a missing handle degrades the link rather than throwing
- No connect-accept suppression added to `follows/route.ts`: trigger-seeded follows (migration 044) never pass through this route, so it only ever fires `new_follower` for genuine explicit follows (RESEARCH Open Question #1)
- `release_comment` skips (does not error) when `project.user_id === user.id` so owners aren't notified about their own comments

## Deviations from Plan

None - plan executed exactly as written.

## Threat Mitigations Applied
- **T-10-10 (Spoofing):** actor snapshot read from the caller's own `artist_profiles` row keyed by `auth.uid()`; recipient derived server-side (`followeeId`/`profileId`/resolved `vault_projects.user_id`) — no client identity trusted
- **T-10-11 (Information Disclosure):** the release_comment owner lookup uses the route's session-bound client; the comment insert already passed RLS, so no new disclosure surface
- **T-10-12 (Denial of Service):** every notify is try/catch AFTER the primary mutation — follow/post/endorse/comment always succeeds even if notification delivery fails

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All four Phase-10 notification event sources now write `notifications` rows with actor snapshots, unblocking Plan 05's notification bell/panel to render real data
- Manual live-DB verification (one correctly-shaped row per action for the correct recipient) is deferred to `/gsd-verify-work` per VALIDATION.md

## Self-Check: PASSED

All four modified route files confirmed present on disk. Both task commit hashes (`462f04d`, `47d6f98`) confirmed in `git log`. `npx tsc --noEmit` clean (0 errors); `npm test` 80/80 passing.

---
*Phase: 10-connections-notifications*
*Completed: 2026-07-13*
