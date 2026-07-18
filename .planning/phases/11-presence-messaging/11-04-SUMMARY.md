---
phase: 11-presence-messaging
plan: "04"
subsystem: ui
tags: [react, nextjs, supabase-realtime, presence, tailwind]

# Dependency graph
requires:
  - phase: 11-presence-messaging
    provides: "11-01's hasUnread/formatPresenceStatus (consumed downstream by API routes, not directly imported here) and 11-02's dm_threads.status/requester_id + artist_profiles.last_seen_at schema that /api/dm/threads and /api/presence/heartbeat (Plan 03, parallel wave) will read/write"
provides:
  - MessagesIcon — topbar chat-bubble icon + unread-thread badge, global Realtime + fresh-COUNT pattern mirroring NotificationBell
  - PresenceTracker — single presence-global Realtime Presence channel (user-scoped key) + throttled heartbeat POST, mounted once per session
  - ArtistLayoutClient — client wrapper holding docked-widget useState + MessagesDockContext (openDock/closeDock), rendered once at layout root so state survives SPA navigation (D-03)
  - Messages nav entry (universal, no capability gate) with new MessagesNavIcon inline SVG
  - NotificationBell button reconciled to h-11 w-11 for visual peer parity with MessagesIcon
affects:
  - "11-03-PLAN.md (parallel wave 3): supplies /api/dm/threads?unread=true and /api/presence/heartbeat that MessagesIcon/PresenceTracker call — these 404 until 11-03 lands in the same merge"
  - "11-05-PLAN.md: expected to replace ArtistLayoutClient's inline DockedWidgetPlaceholder with the real components/messages/DockedWidget.tsx import, and to call useMessagesDock().openDock(threadId) from ConversationView's pop-out affordance"
  - "11-06-PLAN.md: ProfilePresenceDot reads artist_profiles.last_seen_at independently of this plan's mounts"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Global Realtime subscription + fresh-COUNT poll (no client-increment) — MessagesIcon mirrors NotificationBell exactly, swapping endpoint/table/channel-name/icon"
    - "Single long-lived Realtime Presence channel per session (user-scoped key, never crypto.randomUUID), mounted once at the layout root so exactly one cleanup fires per session (RESEARCH Pitfall 1/2/4)"
    - "React Context for cross-tree client actions (MessagesDockContext) instead of prop-drilling from a page component up into the layout"

key-files:
  created:
    - components/nav/MessagesIcon.tsx
    - components/nav/PresenceTracker.tsx
    - components/nav/ArtistLayoutClient.tsx
  modified:
    - app/(artist)/layout.tsx
    - components/nav/ArtistNav.tsx
    - components/nav/NotificationBell.tsx
    - components/nav/icons.tsx

key-decisions:
  - "Heartbeat cadence set to 50s (within the plan's 45-60s window) via setInterval, gated on document.visibilityState === 'visible' so background tabs stop pinging /api/presence/heartbeat"
  - "MessagesDockContext lives inside ArtistLayoutClient.tsx (not a sibling file) per the plan's 'in this file or a sibling' discretion — exported useMessagesDock() hook throws if used outside the provider, matching the codebase's fail-loud convention"
  - "DockedWidget is a minimal inline placeholder (DockedWidgetPlaceholder, not a separate components/messages/DockedWidget.tsx file) since Plan 05 has not landed yet and this plan's files_modified list does not include components/messages/ — Plan 05 is expected to swap the import"
  - "Messages nav entry placed immediately after Antenna in ArtistNav's ITEMS array — both are universal (no requiresCapability), grouping the two capability-agnostic rooms together"
  - "Added gap-3 to the header row in app/(artist)/layout.tsx (Rule 1 auto-fix) — the original header had no gap utility because it only ever held one icon; two adjacent 44px icon buttons need visible spacing"

requirements-completed: [PRESENCE-01, PRESENCE-03, CONNECT-05]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Topbar messages icon renders next to the bell with an unread-thread badge sourced only from a fresh GET /api/dm/threads?unread=true count on poll + Realtime dm_messages INSERT, never client-incremented, and navigates to /messages"
    requirement: PRESENCE-03
    verification:
      - kind: unit
        ref: "grep -q 'aria-label=\"Messages\"' components/nav/MessagesIcon.tsx && grep -q '/api/dm/threads?unread=true' components/nav/MessagesIcon.tsx"
        status: pass
      - kind: manual_procedural
        ref: "npx tsc --noEmit — 0 errors in MessagesIcon.tsx"
        status: pass
    human_judgment: true
    rationale: "Live badge behavior (count updates on real DM insert, correct navigation) requires /api/dm/threads (Plan 03, parallel wave) to be merged and a live Supabase session — genuinely a UAT item, not unit-testable in isolation"
  - id: D2
    description: "A single presence-global Realtime channel is tracked with a user-scoped key (never crypto.randomUUID), re-tracked on visibilitychange, torn down with removeChannel on unmount, and POSTs /api/presence/heartbeat so last_seen_at persists"
    requirement: PRESENCE-01
    verification:
      - kind: unit
        ref: "grep -q 'presence: { key: userId }' components/nav/PresenceTracker.tsx && grep -q 'removeChannel' components/nav/PresenceTracker.tsx"
        status: pass
      - kind: manual_procedural
        ref: "npx tsc --noEmit — 0 errors in PresenceTracker.tsx; grep for crypto.randomUUID as a presence key returns 0 matches"
        status: pass
    human_judgment: true
    rationale: "Confirming the channel actually coalesces multi-tab presence and that last_seen_at updates live in Supabase requires a running dev session against the real database and /api/presence/heartbeat (Plan 03) — not verifiable from static analysis alone"
  - id: D3
    description: "ArtistLayoutClient wraps the docked-widget state (useState<string|null>) and exposes a dock-open context; app/(artist)/layout.tsx mounts MessagesIcon immediately before NotificationBell and PresenceTracker once after children; ArtistNav has a universal /messages entry; NotificationBell is reconciled to h-11 w-11"
    requirement: CONNECT-05
    verification:
      - kind: unit
        ref: "grep -q 'MessagesIcon' 'app/(artist)/layout.tsx' && grep -q 'PresenceTracker' 'app/(artist)/layout.tsx' && grep -q '/messages' components/nav/ArtistNav.tsx && ! grep -q 'h-\\[42px\\] w-\\[42px\\]' components/nav/NotificationBell.tsx"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit (0 errors); npm test -- full suite 138/138 pass"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-07-13
status: complete
---

# Phase 11 Plan 04: Layout-Level Presence & Messaging Surfaces Summary

**MessagesIcon topbar badge + PresenceTracker global presence channel + ArtistLayoutClient docked-widget host, mirroring NotificationBell's proven global-subscription pattern**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-13T22:57:00Z
- **Completed:** 2026-07-13T23:09:00Z
- **Tasks:** 3
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments

- `MessagesIcon` — topbar chat-bubble icon + unread-thread badge, mirroring `NotificationBell`'s global Realtime subscription + fresh-COUNT-only badge discipline (D-07); navigates to `/messages` via `Link`, no dropdown panel (D-02)
- `PresenceTracker` — single user-scoped `presence-global` Realtime Presence channel per session, `visibilitychange` re-track/untrack, throttled heartbeat POST to `/api/presence/heartbeat`, full `removeChannel` + listener/interval cleanup on unmount
- `ArtistLayoutClient` — client wrapper holding `useState<string | null>` for the docked-thread id plus a `MessagesDockContext` (`openDock`/`closeDock`) for the `/messages` page (Plan 05) to call; persists across SPA navigation because the layout never unmounts (D-03)
- `app/(artist)/layout.tsx` mounts `MessagesIcon` immediately before `NotificationBell` in the header and `PresenceTracker` once after `{children}`; wraps the tree in `ArtistLayoutClient` when a user session exists
- `ArtistNav` gained a universal `/messages` entry (no `requiresCapability`, like Antenna) with a new `MessagesNavIcon` inline SVG in `icons.tsx`
- `NotificationBell` button reconciled from `h-[42px] w-[42px]` to `h-11 w-11` for visual peer parity with the new `MessagesIcon` (UI-SPEC D-02 note)

## Task Commits

Each task was committed atomically:

1. **Task 1: MessagesIcon — topbar chat icon + unread-thread badge** - `7ad0402` (feat)
2. **Task 2: PresenceTracker — single presence-global channel + heartbeat** - `fc5818a` (feat)
3. **Task 3: ArtistLayoutClient wrapper + layout/nav wiring** - `e5d6944` (feat)

**Plan metadata:** `0ae5b0b` (docs: complete plan)

## Files Created/Modified

- `components/nav/MessagesIcon.tsx` - topbar chat icon + unread-thread badge (net-new)
- `components/nav/PresenceTracker.tsx` - single presence-global channel + heartbeat (net-new)
- `components/nav/ArtistLayoutClient.tsx` - docked-widget state wrapper + MessagesDockContext (net-new)
- `app/(artist)/layout.tsx` - mounts MessagesIcon/NotificationBell/PresenceTracker, wraps tree in ArtistLayoutClient
- `components/nav/ArtistNav.tsx` - universal `/messages` nav entry
- `components/nav/NotificationBell.tsx` - button size reconciled to `h-11 w-11`
- `components/nav/icons.tsx` - new `MessagesNavIcon` inline SVG

## Decisions Made

- Heartbeat cadence: 50s interval (within the plan's 45-60s window), gated on `document.visibilityState === 'visible'` so background tabs don't ping `/api/presence/heartbeat`
- `MessagesDockContext` lives inside `ArtistLayoutClient.tsx` (the plan's "in this file or a sibling" discretion resolved to same-file); `useMessagesDock()` throws if called outside the provider
- Docked widget rendered via a minimal inline `DockedWidgetPlaceholder` (not a separate `components/messages/DockedWidget.tsx` file) since Plan 05 has not landed and this plan's `files_modified` doesn't include `components/messages/` — Plan 05 is expected to swap in the real component
- Messages nav entry placed immediately after Antenna in `ArtistNav`'s `ITEMS` array — both are universal, grouping the two capability-agnostic rooms together

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added `gap-3` to the header row in `app/(artist)/layout.tsx`**
- **Found during:** Task 3
- **Issue:** The original header (`app/(artist)/layout.tsx` line 32) had no gap utility because it only ever mounted one icon (`NotificationBell`). Adding `MessagesIcon` immediately before it without a gap would render the two 44px buttons flush against each other.
- **Fix:** Added `gap-3` (8px) to the header's className.
- **Files modified:** `app/(artist)/layout.tsx`
- **Verification:** Visual review of the className change against the UI-SPEC spacing scale (`sm` = 8px, inline element gaps); `npx tsc --noEmit` clean
- **Committed in:** `e5d6944` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 minor spacing bug)
**Impact on plan:** Cosmetic fix only, necessary for the two new adjacent header icons to render correctly. No scope creep.

## Issues Encountered

`npm run build` fails at the static-export step for the unrelated `/(auth)/update-password` page with `Error: either NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY env variables ... are required!` — this worktree has no `.env.local`/Supabase secrets configured (confirmed via `env | grep -i SUPABASE` returning empty) and the failure is in a page this plan never touches. Type-checking completed successfully before the failure ("Compiled successfully", "Linting and checking validity of types ..." passed). `npx tsc --noEmit` is clean and the full Jest suite (138/138) passes with no regressions. This is a pre-existing environment limitation (missing secrets in this sandbox), not a defect introduced by this plan's changes.

## User Setup Required

None - no external service configuration required. (Supabase secrets for the sandbox `npm run build` limitation noted above are an existing project setup concern, not new work from this plan.)

## Next Phase Readiness

- `MessagesDockContext`/`useMessagesDock()` is exported from `components/nav/ArtistLayoutClient.tsx` and ready for Plan 05's `/messages` page to call `openDock(threadId)` from a pop-out affordance
- Plan 05 should replace `ArtistLayoutClient.tsx`'s inline `DockedWidgetPlaceholder` with the real `components/messages/DockedWidget.tsx` import once that component exists
- `MessagesIcon` and `PresenceTracker` call `/api/dm/threads?unread=true` and `/api/presence/heartbeat` respectively — both routes are Plan 03's responsibility (parallel wave 3); these calls will 404 until 11-03 is merged alongside this plan
- No blockers for this plan's own scope

## Self-Check: PASSED

- `components/nav/MessagesIcon.tsx` exists: FOUND
- `components/nav/PresenceTracker.tsx` exists: FOUND
- `components/nav/ArtistLayoutClient.tsx` exists: FOUND
- `app/(artist)/layout.tsx`, `components/nav/ArtistNav.tsx`, `components/nav/NotificationBell.tsx`, `components/nav/icons.tsx` exist: FOUND
- All 4 commits exist in git log: `7ad0402`, `fc5818a`, `e5d6944`, `0ae5b0b` — FOUND
- `npx tsc --noEmit`: 0 errors — CONFIRMED
- `npm test`: 138/138 pass — CONFIRMED
- All task-level acceptance-criteria grep checks (aria-label, endpoint strings, presence key, removeChannel, nav item, button-size reconciliation, hidden lg:block) — CONFIRMED

---
*Phase: 11-presence-messaging*
*Completed: 2026-07-13*
