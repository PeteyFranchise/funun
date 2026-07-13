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
