---
phase: 10-connections-notifications
plan: 01
subsystem: api
tags: [jest, ts-jest, notifications, connections, supabase, typescript]

# Dependency graph
requires:
  - phase: 08-identity-schema-foundation
    provides: connections/blocks/notifications tables, no_block() helper, actor-snapshot columns on notifications (migration 036)
provides:
  - "NOTIFICATION_TYPES catalog + NotificationType union (lib/social/notifications.ts)"
  - "Six pure buildXNotification() payload builders (new_follower, connection_request, connection_accepted, wall_post, endorsement, release_comment)"
  - "buildMarkAllReadFilter() pure query-shape helper for NOTIF-03's mark-all-read PATCH"
  - "buildConnectRequest()/buildRespondTransition() pure connect state-transition builders (lib/social/connections.ts)"
  - "createNotification() + Notification type extended with actor_id/actor_name/actor_avatar_url"
affects: [10-02-connections-migration, 10-03-connections-notifications-api, 10-04-notification-trigger-wiring, 10-05-notification-bell-panel, 10-06-connect-button]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Notification-type catalog as a discriminated-union-style const object (icon + inlineAction metadata), extensible by later phases without touching render logic"
    - "Pure payload-builder modules (lib/social/*.ts) with zero Supabase/client imports, unit-tested directly with plain object assertions — no mocking required"

key-files:
  created:
    - __tests__/connections.test.ts
    - __tests__/notification-triggers.test.ts
    - __tests__/notifications-api.test.ts
    - lib/social/notifications.ts
    - lib/social/connections.ts
  modified:
    - lib/notifications/index.ts
    - types/index.ts

key-decisions:
  - "new_follower notifications are suppressed for connect-accept trigger-seeded follows — only connection_accepted fires on accept, per RESEARCH Open Question #1's spam-avoidance recommendation"
  - "buildConnectRequest()/buildRespondTransition() throw descriptive Error instances (this codebase's established error convention, mirrors lib/capabilities/grant.ts) rather than returning an { error } result shape"
  - "Note-length validation (<=200 chars) lives in TS as a friendly pre-check; the Postgres CHECK constraint (Plan 02 migration) remains the hard backstop"

patterns-established:
  - "Pure builder module convention: lib/social/notifications.ts and lib/social/connections.ts import nothing from @/lib/supabase — verified via grep, keeps Wave-0 test files mock-free"

requirements-completed: [CONNECT-01, CONNECT-02, NOTIF-01, NOTIF-03]

coverage:
  - id: D1
    description: "NOTIFICATION_TYPES catalog covers all 6 phase-owned types + 2 pre-existing types; only connection_request carries a truthy inlineAction"
    requirement: "NOTIF-01"
    verification:
      - kind: unit
        ref: "__tests__/notification-triggers.test.ts#NOTIFICATION_TYPES catalog"
        status: pass
    human_judgment: false
  - id: D2
    description: "Six per-type buildXNotification() builders produce title/link/actor-snapshot payloads matching UI-SPEC's Copywriting Contract and deep-link catalog verbatim"
    requirement: "NOTIF-01"
    verification:
      - kind: unit
        ref: "__tests__/notification-triggers.test.ts#new_follower, #connection_request, #connection_accepted, #wall_post, #endorsement, #release_comment"
        status: pass
    human_judgment: false
  - id: D3
    description: "buildConnectRequest()/buildRespondTransition() enforce valid state transitions and note-length validation before any DB write"
    requirement: "CONNECT-02"
    verification:
      - kind: unit
        ref: "__tests__/connections.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "buildMarkAllReadFilter() scopes the mark-all-read mutation to the caller's own userId and read=false rows only"
    requirement: "NOTIF-03"
    verification:
      - kind: unit
        ref: "__tests__/notifications-api.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "createNotification() and the Notification type carry actor_id/actor_name/actor_avatar_url so Plan 03/04 call sites can populate actor-snapshot data without a build break"
    requirement: "CONNECT-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (clean for lib/notifications/index.ts, types/index.ts) + npm test (80/80 passing)"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-07-12
status: complete
---

# Phase 10 Plan 01: Notification & Connection Builders Foundation Summary

**Pure notification-type catalog, six per-type payload builders, connect request/respond/withdraw builders, and the createNotification()/Notification actor-snapshot extension — all unit-tested with zero mocking (no Supabase client imports in the new modules).**

## Performance

- **Duration:** ~3 min (task commits 15:10:42Z–15:12:06Z)
- **Started:** 2026-07-12T15:10:42Z
- **Completed:** 2026-07-12T15:12:06Z
- **Tasks:** 4
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments
- Built `lib/social/notifications.ts`: `NOTIFICATION_TYPES` catalog (8 entries: 6 phase-owned + `antenna_match`/`application_received`), `NotificationType` union, six pure `buildXNotification()` builders, and `buildMarkAllReadFilter()`
- Built `lib/social/connections.ts`: `buildConnectRequest()` (note trim/null-coercion/200-char cap/self-request rejection) and `buildRespondTransition()` (accept/decline/withdraw → accepted/declined/withdrawn)
- Extended `createNotification()` (`lib/notifications/index.ts`) and the `Notification` type (`types/index.ts`) with `actor_id`/`actor_name`/`actor_avatar_url` — closes RESEARCH Pitfall 3 before any downstream call site passes actor data
- Authored and confirmed RED, then turned GREEN, all three Wave-0 Jest scaffolds (`connections.test.ts`, `notification-triggers.test.ts`, `notifications-api.test.ts`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave-0 RED test scaffolds for connections, notification triggers, and notifications API** - `47c2b54` (test)
2. **Task 2: Notification type catalog + per-type payload builders (GREEN for notification-triggers.test.ts)** - `778c915` (feat)
3. **Task 3: Connect state-transition payload builders (GREEN for connections.test.ts)** - `515bd78` (feat)
4. **Task 4: Extend createNotification() + Notification type for actor-snapshot columns** - `9a8aca3` (feat)

## Files Created/Modified
- `__tests__/connections.test.ts` - RED→GREEN unit tests for `buildConnectRequest`/`buildRespondTransition`
- `__tests__/notification-triggers.test.ts` - RED→GREEN unit tests for the catalog + six builders
- `__tests__/notifications-api.test.ts` - RED→GREEN unit tests for `buildMarkAllReadFilter`
- `lib/social/notifications.ts` - `NOTIFICATION_TYPES`, `NotificationType`, six `buildXNotification()` builders, `buildMarkAllReadFilter()`
- `lib/social/connections.ts` - `buildConnectRequest()`, `buildRespondTransition()`
- `lib/notifications/index.ts` - `createNotification()` args + insert extended with `actorId`/`actorName`/`actorAvatarUrl`
- `types/index.ts` - `Notification` type extended with `actor_id`/`actor_name`/`actor_avatar_url: string | null`

## Decisions Made
- Suppressed `new_follower` notifications for connect-accept trigger-seeded follows — only `connection_accepted` fires (RESEARCH Open Question #1)
- Chose throw-Error over `{ error }`-result shape for `buildConnectRequest()`/`buildRespondTransition()` rejections, matching `lib/capabilities/grant.ts`'s established convention in this codebase
- Kept note-length validation as a TS-layer friendly pre-check only; the hard backstop is Plan 02's Postgres CHECK constraint

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `lib/social/notifications.ts` and `lib/social/connections.ts` are ready for Plan 03's API routes (`app/api/connections/route.ts`, `app/api/notifications/route.ts`) to consume as thin adapters
- `createNotification()`'s actor-snapshot args are live, unblocking Plan 04's 8 new trigger call sites (`follows`, `wall`, `endorsements`, `release-comments`, `connections`)
- Plan 02's migration (connections.note column + no_block() wiring + auto-follow trigger) is the next dependency; no blockers identified

## Self-Check: PASSED

All created files confirmed present on disk (test files, lib modules, this summary). All four task commit hashes (`47c2b54`, `778c915`, `515bd78`, `9a8aca3`) confirmed in `git log`.

---
*Phase: 10-connections-notifications*
*Completed: 2026-07-12*
