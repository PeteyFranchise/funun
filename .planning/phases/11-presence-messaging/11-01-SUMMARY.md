---
phase: 11-presence-messaging
plan: "01"
subsystem: testing
tags: [jest, typescript, pure-functions, rate-limiting, presence, notifications]

# Dependency graph
requires:
  - phase: 10-connections-notifications
    provides: NotificationPayload shape + NOTIFICATION_TYPES catalog + connections table
provides:
  - formatPresenceStatus() — D-21 bucket formatter in lib/social/presence.ts
  - countRecentRequests() + isConnected() + hasUnread() + BASELINE/VERIFIED/PENDING constants in lib/social/dm.ts
  - message_request + new_dm catalog entries + builders in lib/social/notifications.ts
  - RED/GREEN Jest test coverage for PRESENCE-01/02/03, CONNECT-04/05
affects:
  - 11-02-PLAN.md (presence migration + heartbeat route consume formatPresenceStatus)
  - 11-03-PLAN.md (send/accept routes consume countRecentRequests, isConnected, buildMessageRequestNotification, buildNewDmNotification)
  - 11-04-PLAN.md (thread-list route uses hasUnread)
  - 11-05-PLAN.md (MessagesIcon + ConversationView use hasUnread)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-function helper modules (no Supabase at module top level) for testable business logic"
    - "RED/GREEN TDD: test scaffold first, then implementation to satisfy assertions"
    - "Fake Supabase client stubs via plain chainable objects — no jest.mock() needed"

key-files:
  created:
    - __tests__/presence.test.ts
    - __tests__/dm-request.test.ts
    - __tests__/dm-unread.test.ts
    - lib/social/presence.ts
  modified:
    - lib/social/dm.ts
    - lib/social/notifications.ts

key-decisions:
  - "Rate-limit constants (BASELINE_REQUEST_LIMIT=10, VERIFIED_REQUEST_LIMIT=30, PENDING_STACK_CAP=3) live in lib/social/dm.ts — their single home per Claude's-discretion resolution in the plan"
  - "formatPresenceStatus uses inline arithmetic (no date-fns) — diffMs/60_000 pattern per RESEARCH Environment Availability note"
  - "hasUnread is a pure boolean comparison (not a stored counter) — D-07 rule enforced via test assertion"
  - "isConnected uses .or() with and(...) sub-expressions for either-direction accepted-connection check, mirroring app/api/connections/route.ts pattern"

patterns-established:
  - "Pure-function lib modules: no Supabase import, named exports, types first — lib/social/presence.ts as canonical example"
  - "Fake Supabase stub pattern: plain chainable objects exposing .from().select().eq().gte() etc. as function chains returning canned data — avoids jest.mock overhead"

requirements-completed: [PRESENCE-01, PRESENCE-02, PRESENCE-03, CONNECT-03, CONNECT-04, CONNECT-05]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "formatPresenceStatus() returns correct D-21 bucket strings for all time ranges, null for >7-day-old timestamps"
    requirement: PRESENCE-01
    verification:
      - kind: unit
        ref: "__tests__/presence.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "formatPresenceStatus() returns null for input older than 7 days (D-21 cutoff)"
    requirement: PRESENCE-02
    verification:
      - kind: unit
        ref: "__tests__/presence.test.ts#returns null for a timestamp ~8 days old"
        status: pass
    human_judgment: false
  - id: D3
    description: "hasUnread() computes unread from timestamp comparison, never a cached counter (D-07)"
    requirement: PRESENCE-03
    verification:
      - kind: unit
        ref: "__tests__/dm-unread.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "countRecentRequests() queries dm_threads with status=pending, requester_id filter, and 7-day rolling window (CONNECT-04)"
    requirement: CONNECT-04
    verification:
      - kind: unit
        ref: "__tests__/dm-request.test.ts#countRecentRequests"
        status: pass
    human_judgment: false
  - id: D5
    description: "isConnected() returns true only for status=accepted rows with either-direction .or() filter (CONNECT-05)"
    requirement: CONNECT-05
    verification:
      - kind: unit
        ref: "__tests__/dm-request.test.ts#isConnected"
        status: pass
    human_judgment: false
  - id: D6
    description: "NOTIFICATION_TYPES catalog includes message_request and new_dm; builders return correct NotificationPayload shape (CONNECT-03)"
    requirement: CONNECT-03
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (0 errors in lib/social/notifications.ts)"
        status: pass
    human_judgment: false

# Metrics
duration: 4min
completed: 2026-07-13
status: complete
---

# Phase 11 Plan 01: Presence & Messaging Foundation Summary

**Pure-function helpers and RED/GREEN Jest test coverage for the D-21 presence bucket formatter, rolling 7-day rate-limit + connection-gate queries, unread timestamp predicate, and Phase 10 notification catalog extended with message_request/new_dm**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-13T18:26:52Z
- **Completed:** 2026-07-13T18:31:06Z
- **Tasks:** 4
- **Files modified:** 6

## Accomplishments

- Created `lib/social/presence.ts` — pure D-21 bucket formatter (`formatPresenceStatus`) with no Supabase/date-fns dependency
- Extended `lib/social/dm.ts` with 5 new exports: `countRecentRequests`, `isConnected`, `countPendingMessagesFrom`, `hasUnread`, plus 3 rate-limit constants (BASELINE=10, VERIFIED=30, PENDING_STACK_CAP=3); all 4 existing exports preserved byte-for-byte
- Extended `lib/social/notifications.ts` with `message_request` + `new_dm` catalog entries and `buildMessageRequestNotification` / `buildNewDmNotification` builders matching the Phase 10 payload shape
- Three RED Jest test scaffolds created and driven GREEN: 34 tests across presence/dm-request/dm-unread suites, full suite 129/129 passing, `tsc --noEmit` clean, no new npm packages

## Task Commits

Each task was committed atomically:

1. **Task 1: RED test scaffolds** - `ba9219e` (test)
2. **Task 2: GREEN — presence.ts** - `5c23f31` (feat)
3. **Task 3: GREEN — dm.ts extensions** - `91bf033` (feat)
4. **Task 4: notification catalog + builders** - `e8a4d3a` (feat)

## Files Created/Modified

- `__tests__/presence.test.ts` — 12 tests covering D-21 bucket ladder (PRESENCE-01/02)
- `__tests__/dm-request.test.ts` — 12 tests for rate-limit count, connection gate, and constants using fake client stubs (CONNECT-04/05)
- `__tests__/dm-unread.test.ts` — 10 tests for pure timestamp-comparison unread predicate (PRESENCE-03)
- `lib/social/presence.ts` — net-new pure-function module, `formatPresenceStatus()`
- `lib/social/dm.ts` — extended with constants + 4 new query/pure helpers
- `lib/social/notifications.ts` — NOTIFICATION_TYPES extended, 2 new builders appended

## Decisions Made

- Rate-limit constants live in `lib/social/dm.ts` (Claude's-discretion resolution per plan)
- `formatPresenceStatus` uses inline arithmetic — `diffMs / 60_000` pattern; no `date-fns` (per RESEARCH environment note)
- `hasUnread` is a pure boolean comparison with `null` propagation — D-07 rule enforced via test assertion, not DB counter
- `isConnected` mirrors the `.or()` pattern from `app/api/connections/route.ts` lines 69-77 for either-direction check

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All Phase 11 plans' core logic primitives are machine-verified and in-tree
- Plan 11-02 (migration + heartbeat route) can proceed: `formatPresenceStatus` is importable
- Plan 11-03 (send/accept routes) can proceed: `countRecentRequests`, `isConnected`, `buildMessageRequestNotification`, `buildNewDmNotification` all available
- Plan 11-04 (thread-list route) can proceed: `hasUnread` available
- No blockers

## Self-Check: PASSED

- `__tests__/presence.test.ts` exists: FOUND
- `__tests__/dm-request.test.ts` exists: FOUND
- `__tests__/dm-unread.test.ts` exists: FOUND
- `lib/social/presence.ts` exists: FOUND
- All 4 task commits exist in git log: ba9219e, 5c23f31, 91bf033, e8a4d3a — FOUND
- All 3 test suites GREEN (34/34 pass): CONFIRMED
- Full test suite GREEN (129/129 pass): CONFIRMED
- `npx tsc --noEmit`: 0 errors — CONFIRMED
- No new npm packages: package.json unchanged — CONFIRMED

---
*Phase: 11-presence-messaging*
*Completed: 2026-07-13*
