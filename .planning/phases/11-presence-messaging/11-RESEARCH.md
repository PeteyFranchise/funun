# Phase 11: Presence & Messaging - Research

**Researched:** 2026-07-13
**Domain:** Supabase Realtime Presence, DM inbox architecture, message-request flow, rolling rate limiting, Next.js persistent floating UI
**Confidence:** MEDIUM

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Inbox architecture (hybrid: page primary + pop-out widget)**
- D-01: Net-new `/messages` page is the primary messaging surface — a hybrid of Facebook's floating messenger and Instagram's DM page.
- D-02: Both entry points navigate to `/messages`: topbar messages icon and profile Message button.
- D-03: Desktop: pop-out dock. On `/messages`, each conversation has a pop-out/minimize control; popping out docks it bottom-right as the floating DM widget (visually the designed `.pf-dm`) and it persists across navigation until explicitly closed — Gmail-compose-style.
- D-04: Mobile: no floating widget. `/messages` is full-screen Instagram-like (thread list → tap → full-screen conversation).
- D-05: Desktop page layout is two-pane — thread list left, active conversation right. Mobile collapses to single-pane.
- D-06: Auto-read on open: opening a conversation immediately upserts the viewer's `dm_thread_reads` marker.
- D-07: Badges count threads with unread, not total messages. Computed from `dm_thread_reads.last_read_at` vs `dm_messages.created_at`; never a cached counter.
- D-08: Inbox search is people-only this phase — filters thread list by other person's name/handle.

**Message-request flow**
- D-09: The first message IS the request (Instagram/LinkedIn model). Non-connection writes their message; recipient sees it as pending.
- D-10: Recipients act in a dedicated Requests section of `/messages` plus a `message_request` notification. Accept/decline buttons inside the request's thread view.
- D-11: Decline is silent. Sender never notified; their side still shows message as sent.
- D-12: Minimal Block action: request view includes Block option that inserts a `blocks` row. Phase 13 owns full block UX.
- D-13: Mutual connections message directly, no request step (CONNECT-05). Enforce server-side.

**Rate limiting**
- D-14: Rolling 7-day window computed from message-request timestamps — no reset job.
- D-15: Limits: 10/week baseline, verified members higher (default 30/week) — stored as tunable constants.
- D-16: Every request counts — no refunds for accepted/declined/ignored.
- D-17: Sender sees visible budget when composing to non-connection.
- D-18: Pending requests allow ~3 stacked messages without extra budget cost.
- D-19: No admin UI for outreach behavior this phase.

**Presence semantics**
- D-20: "Active now" = app open AND tab visible/focused. Backgrounding drops to "Active Xm ago."
- D-21: Offline status uses coarse buckets with a cutoff: "Active now" → "Active 5m ago" → "Active 2h ago" → "Active today" → "Active this week" → nothing after ~7 days.
- D-22: Presence dots appear on: profile avatar, docked DM widget header, `/messages` thread list, two-pane conversation header. Not on notification panel or wall avatars.
- D-23: Presence visible to all signed-in members — no hide toggle this phase.

### Claude's Discretion
- Grandfathering existing threads: default = existing `dm_threads` between non-connected members keep working (gate applies to *new* conversation starts only).
- Exact verified-member rate cap number (~30/week) and constants' home.
- Where `last_seen_at` lives (column on `artist_profiles` vs. dedicated presence table), its write cadence/throttle, and column-privilege treatment per migration-031/040 doctrine.
- How message-request state is modeled (status on `dm_threads`, separate `message_requests` table, or thread rows with `pending` flag) — must support: requests section, ~3-message cap, silent decline, accept→normal thread, block, rate-limit counting, CONNECT-05 connection check.
- Pop-out widget state persistence across navigation (client state vs. localStorage) and desktop/mobile breakpoint.
- `new_dm` notification behavior (bell fires for every DM vs. only when recipient hasn't read; suppression while thread is open).
- Requests-section empty states, thread-list preview truncation, exact bucket boundaries for D-21.
- Realtime Presence channel topology (one global lobby channel vs. per-surface channels). Confirm Supabase Realtime concurrent-connection budget during planning.

### Deferred Ideas (OUT OF SCOPE)
- Message-content full-text search in the inbox.
- "Show my online status" privacy toggle (Phase 13 SAFETY-04).
- Admin cold-outreach/limit-hits dashboard (Phase 13).
- Full block UX (profile block button, blocked-list management, unblock, search exclusion) — Phase 13.
- Typing indicator (PRESENCE-04, v1.x).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRESENCE-01 | User sees an online presence dot on another member's avatar when actively on the platform | Supabase Realtime Presence channel + `last_seen_at` fallback; `PresenceDot` component already scaffolded in `ProfileView.tsx` line 92 |
| PRESENCE-02 | User sees "Active now" or "Active X ago" status in the DM widget header | Realtime Presence `sync` event for live users; `last_seen_at` column + D-21 bucket logic for offline users |
| PRESENCE-03 | The floating DM widget shows an unread message count badge | `dm_thread_reads` table already migrated (migration 036); compute via COUNT comparison |
| CONNECT-03 | User can send a message request to a non-connection; recipient can accept, decline, or block | Message-request state machine on `dm_threads` (status column or separate table); D-09..D-12 decisions lock the flow |
| CONNECT-04 | User is rate-limited on outbound cold message requests (10/week) to prevent spam | Rolling 7-day window query; D-14..D-19 decisions lock the behavior |
| CONNECT-05 | User can message directly, no request step, once mutually connected | `connections` table `status='accepted'` check server-side in `/api/dm/send` |
</phase_requirements>

---

## Summary

Phase 11 is a mid-complexity brownfield phase that upgrades the existing DM system into a full inbox. The migration path is clear because Wave 4's schema work in Phases 8–10 pre-built most of the foundation: `dm_thread_reads` (migration 036) is already live for unread badges, `connections` + `blocks` + `no_block()` (migrations 035/038/050) are live for the connection gate and block action, and the notification system (Phase 10) is designed to accept the two new types (`message_request`, `new_dm`) with zero re-architecture.

The three new surfaces — the `/messages` inbox page, the docked floating widget persisting across navigation, and the message-request flow — are net-new UI built using `.pf-dm`'s design as the visual foundation. The topbar messages icon (chat bubble + `.dotn` badge) is designed in `user-profile.html` line 253 and mounts next to the Phase 10 bell in `app/(artist)/layout.tsx`. No net-new npm packages are required: all patterns are native Supabase Realtime, React state, and the existing Tailwind/TypeScript stack.

The open architectural discretion items (where `last_seen_at` lives, how message-request state is modeled, and how the docked widget persists across navigation) are each resolvable by the planner with the guidance below. The most consequential is the message-request state model — the recommended approach is a `status` column on `dm_threads` rather than a separate table, which avoids a schema proliferation risk and keeps `lib/social/dm.ts`'s `canonicalPair`/`ensureThread` model intact.

**Primary recommendation:** Extend `dm_threads` with a `status` column ('direct' | 'pending' | 'declined'), add `last_seen_at` to `artist_profiles` (following migration-040's column-privilege doctrine), and mount the docked widget and messages-icon badge as client components in `app/(artist)/layout.tsx` — the same root where `NotificationBell` lives.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Presence tracking (heartbeat) | Browser / Client | — | Must respond to tab focus/blur events (`visibilitychange`); cannot run server-side |
| `last_seen_at` persistence | API / Backend | Database / Storage | Write cadence throttled server-side; client sends heartbeat, API writes DB |
| Unread message badge | Browser / Client | API / Backend | Client subscribes to Realtime inserts + fresh COUNT fetch; badge is client-rendered |
| `/messages` page data | Frontend Server (SSR) | API / Backend | Initial thread list server-rendered; Realtime updates layered on client |
| Docked widget state | Browser / Client | — | Persists across navigation; must be React state in the layout component |
| Connection gate (send check) | API / Backend | Database / Storage | Must be server-side; client-only gating is bypassable via direct PostgREST |
| Rate limit enforcement | API / Backend | Database / Storage | Rolling 7-day COUNT query on API; DB is source of truth |
| Message-request state | Database / Storage | API / Backend | `dm_threads.status` column; RLS + API validate transitions |
| Block action (from request view) | API / Backend | Database / Storage | Inserts into `blocks`; `no_block()` RLS enforcement is immediate |
| `message_request`/`new_dm` notifications | API / Backend | — | Best-effort try/catch side effect after primary mutation (Phase 10 pattern) |

---

## Standard Stack

### Core (all already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | `^2.45.0` | Realtime Presence channel, `postgres_changes` subscriptions, DB queries | Already in stack; Realtime Presence is the locked infrastructure choice |
| Next.js | `^15.0.0` | `/messages` page route, API routes, SSR for initial thread list | Already in stack |
| React | `^18.3.0` | Client components: docked widget, thread list, message input | Already in stack |
| Tailwind CSS | `^3.4.0` | All new UI surfaces use existing design tokens | Already in stack |
| Zod | `^3.23.0` | API input validation for send, accept, decline, block, rate-limit endpoints | Already in stack |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `date-fns` | `^4.4.0` (latest on npm) | `formatDistanceToNow()` for "Active 5m ago" bucket rendering in D-21 | Install only if the existing inline `timeAgo()` helpers (used in NotificationPanel, Wall) can't be reused. The inline helper is already in the codebase; evaluate before adding a dependency. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `dm_threads.status` column for request state | Separate `message_requests` table | Separate table avoids adding status to an existing table but requires a new JOIN on every thread load and a new RLS surface. Status column keeps `ensureThread()` usable and avoids table proliferation. |
| `last_seen_at` on `artist_profiles` | Dedicated `member_presence` table | Dedicated table is cleaner conceptually but adds a new JOIN for every profile/thread render. `artist_profiles` already receives column-level GRANT in migration 040 and the column addition follows the same migration pattern. |
| React state in layout for docked widget | Zustand + localStorage persist | Zustand adds a dependency; React `useState` in the layout component is sufficient to persist across navigation (the layout is never unmounted during SPA navigation). localStorage is needed only for cross-session persistence, which is a nice-to-have, not a requirement. |
| Supabase Realtime `postgres_changes` for DM delivery | Pure polling | Realtime + 20s poll fallback is the established pattern from `DmWidget.tsx` and `NotificationBell.tsx`. Do not change the pattern. |

**Installation:** No net-new packages required. If `date-fns` is added: `npm install date-fns`

**Version verification:**
- `npm view date-fns version` → `4.4.0` [VERIFIED: npm registry]
- `npm view lucide-react version` → `1.24.0` [VERIFIED: npm registry] (already not in package.json; not needed this phase — all new icons can be inline SVG following existing pattern)

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `date-fns` | npm | ~8 yrs | 93M/wk | github.com/date-fns/date-fns | OK | Approved if installed |
| `lucide-react` | npm | ~3 yrs | 74M/wk | github.com/lucide-icons/lucide | SUS (too-new signal: latest publish 2026-07-09, very recent) | Flagged — but NOT recommended for this phase; inline SVG continues the existing pattern |

**Packages removed due to [SLOP] verdict:** none

**Packages flagged as suspicious [SUS]:** `lucide-react` — but it is NOT recommended to install it in this phase. The existing codebase uses inline SVGs throughout (no lucide-react in package.json); continue that pattern for Phase 11 net-new icons.

*Note: `date-fns` is the only candidate for installation and is `OK`. Install only if the inline `timeAgo()` helper (already in the codebase) is insufficient for D-21's bucket rendering.*

---

## Architecture Patterns

### System Architecture Diagram

```
[Browser Tab]
    │
    ├─ visibilitychange → track()/untrack() on global Presence channel
    │      │
    │      └─ [Supabase Realtime: presence-global-{userId}]
    │              ↓ join/leave/sync events → PresenceDot, DM header
    │
    ├─ [Messages icon badge] ← fresh COUNT fetch on Realtime INSERT
    │
    ├─ /messages page (SSR: initial thread list)
    │      │
    │      ├─ Two-pane: [Thread List | Active Conversation]
    │      │      └─ Realtime postgres_changes (dm_messages)
    │      │         + 20s poll fallback
    │      │
    │      └─ Requests section (threads where dm_threads.status='pending')
    │             └─ Accept / Decline / Block buttons → API
    │
    └─ [Docked widget] — mounted in app/(artist)/layout.tsx
           ├─ persists across navigation (React state in layout)
           └─ same Realtime channel as /messages open thread

[Client → API Routes]
    ├─ POST /api/dm/send          — check: connection OR pending-request cap
    │      ├─ mutual connection?  → insert dm_message directly
    │      └─ not connected?      → rate-limit check → insert dm_message,
    │                                set dm_threads.status='pending'
    │                                → fire message_request notification
    │
    ├─ POST /api/dm/request/accept/{threadId}  → set status='direct'
    │                                             → fire new_dm notification
    ├─ POST /api/dm/request/decline/{threadId} → set status='declined' (silent)
    ├─ POST /api/dm/request/block/{threadId}   → insert blocks row
    ├─ GET  /api/dm/threads                    → thread list (includes status)
    ├─ GET  /api/dm/messages?with=            — (existing, unchanged)
    ├─ POST /api/dm/read/{threadId}            → upsert dm_thread_reads
    └─ POST /api/presence/heartbeat            → UPDATE artist_profiles.last_seen_at

[Database Layer: Supabase Postgres]
    ├─ dm_threads        — status TEXT ('direct'|'pending'|'declined')
    ├─ dm_messages       — unchanged
    ├─ dm_thread_reads   — last_read_at (migration 036, already live)
    ├─ connections       — status='accepted' check for CONNECT-05
    ├─ blocks            — no_block() gate (already live)
    └─ artist_profiles   — last_seen_at TIMESTAMPTZ (new column, migration 054)
```

### Recommended Project Structure

```
app/
├── (artist)/
│   ├── layout.tsx               # Add: MessagesIcon component + docked widget mount
│   └── messages/
│       └── page.tsx             # Net-new: /messages inbox page (server component)
│
api/
└── dm/
    ├── messages/route.ts        # Existing — unchanged
    ├── send/route.ts            # Modified: add connection gate + request flow
    ├── threads/route.ts         # Net-new: GET thread list with status
    ├── read/[threadId]/route.ts # Net-new: POST upsert dm_thread_reads
    └── request/
        ├── accept/[threadId]/route.ts   # Net-new
        ├── decline/[threadId]/route.ts  # Net-new
        └── block/[threadId]/route.ts    # Net-new
api/
└── presence/
    └── heartbeat/route.ts       # Net-new: throttled last_seen_at write

components/
├── nav/
│   ├── NotificationBell.tsx     # Existing — unchanged
│   └── MessagesIcon.tsx         # Net-new: topbar chat icon + unread badge
├── messages/
│   ├── ThreadList.tsx           # Net-new: thread list sidebar
│   ├── ConversationView.tsx     # Net-new: two-pane right side (reuses DmWidget patterns)
│   ├── RequestView.tsx          # Net-new: accept/decline/block UI for pending threads
│   └── DockedWidget.tsx         # Net-new: floating bottom-right widget (inherits DmWidget JSX)
└── profile/
    ├── DmWidget.tsx             # REPLACED: Message button now links to /messages?with=...
    └── ProfileView.tsx          # Modified: PresenceDot wired, Message button becomes link

lib/
└── social/
    ├── dm.ts                    # Modified: add thread status helpers, rate-limit query
    ├── notifications.ts         # Modified: add message_request + new_dm builders
    └── presence.ts              # Net-new: formatPresenceStatus(last_seen_at) D-21 buckets

supabase/migrations/
└── 054_dm_request_status_presence.sql  # Net-new: dm_threads.status, artist_profiles.last_seen_at
```

### Pattern 1: Supabase Realtime Presence — user-scoped channel

The research-locked pattern (STATE.md, `.planning/research/STACK.md`) requires: user-scoped key, explicit `unsubscribe()`/`removeChannel()`, and `visibilitychange`-driven re-track.

```typescript
// Source: supabase.com/docs/guides/realtime/presence [CITED: supabase.com/docs/guides/realtime/presence]
// Pattern: one global channel per authenticated user, user.id as the presence key

'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function usePresenceTrack(userId: string) {
  useEffect(() => {
    const supabase = createClient()
    // User-scoped key prevents multi-tab ghost users (STATE.md research lock)
    const channel = supabase.channel('presence-global', {
      config: { presence: { key: userId } },
    })

    const doTrack = async () => {
      await channel.track({ online_at: new Date().toISOString() })
    }

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await doTrack()
    })

    // visibilitychange re-track (STATE.md research lock — required)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        doTrack()
      } else {
        channel.untrack()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      // Always explicit cleanup (STATE.md research lock)
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [userId])
}
```

**Where to mount:** a `<PresenceTracker userId={userId} />` client component in `app/(artist)/layout.tsx`, alongside `NotificationBell`. One tracker per authenticated session.

### Pattern 2: Docked widget persistence across navigation

The docked widget must survive Next.js App Router navigation. The layout component is never unmounted during SPA navigation in the same route group, so React `useState` in the layout is sufficient — no Zustand needed.

```typescript
// Source: [ASSUMED] — standard Next.js App Router layout behavior
// File: app/(artist)/layout.tsx

'use client'
import { useState } from 'react'
import { DockedWidget } from '@/components/messages/DockedWidget'

export default function ArtistLayoutClient({
  children,
  userId,
}: {
  children: React.ReactNode
  userId: string
}) {
  // Persists across SPA navigation — layout is never unmounted
  const [dockedThreadId, setDockedThreadId] = useState<string | null>(null)

  return (
    <div className="flex min-h-screen bg-ink text-white">
      {/* ... nav, header with MessagesIcon + NotificationBell ... */}
      {children}
      {dockedThreadId && (
        <DockedWidget
          threadId={dockedThreadId}
          userId={userId}
          onClose={() => setDockedThreadId(null)}
        />
      )}
    </div>
  )
}
```

The server component `ArtistLayout` renders `ArtistLayoutClient` passing `user.id`. The `/messages` page communicates the dock intent via a URL pattern (`/messages?dock=<threadId>`) or a React context provider mounted in the layout — planner's call.

### Pattern 3: Message-request state — status column on `dm_threads`

**Recommended model:** Add `status TEXT NOT NULL DEFAULT 'direct' CHECK (status IN ('direct', 'pending', 'declined'))` to `dm_threads`. [ASSUMED — recommended approach; alternative is a separate table]

```sql
-- Migration 054 (excerpt)
ALTER TABLE dm_threads
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'direct'
    CHECK (status IN ('direct', 'pending', 'declined'));

-- Existing threads between non-connected users: leave as 'direct' (grandfathering D-DISCRETION)
-- New threads started by non-connections: INSERT with status='pending'
```

Why this model wins over a separate `message_requests` table:
- `canonicalPair()` / `findThread()` / `ensureThread()` in `lib/social/dm.ts` remain the single source of thread identity — no bifurcated lookup
- Rate-limit COUNT query is: `SELECT COUNT(*) FROM dm_threads WHERE status='pending' AND (a_id=uid OR b_id=uid) AND created_at > now() - interval '7 days'`
- The ~3-message cap (D-18) is `SELECT COUNT(*) FROM dm_messages WHERE thread_id=... AND sender_id=...` on a pending thread — one query
- Accept transition: `UPDATE dm_threads SET status='direct' WHERE id=...` + notification
- Declined threads: `UPDATE dm_threads SET status='declined'` — thread stays, sender's side shows messages as sent, recipient never sees replies (D-11)

### Pattern 4: Unread badge computation (D-07)

```typescript
// Source: Wave 4 research rule: compute unread via COUNT, never a cached counter [CITED: .planning/research/SUMMARY.md]
// Never client-increment; always fetch fresh

async function getUnreadThreadCount(supabase: SupabaseClient, userId: string): Promise<number> {
  // Count threads where the latest message is newer than the user's last read marker
  // or where no read marker exists for this user
  const { count } = await supabase
    .from('dm_threads')
    .select('id', { count: 'exact', head: true })
    .or(`a_id.eq.${userId},b_id.eq.${userId}`)
    .eq('status', 'direct')  // only accepted threads count as unread (not pending requests)
    // Sub-select: where dm_messages exist newer than dm_thread_reads.last_read_at
    // This is simplest as a DB function or computed in JS after a join; planner decides
  return count ?? 0
}
```

**Practical approach (planner's call):** A Postgres function/view that returns unread thread IDs per user is cleaner than composing this in JS. Alternatively, the `/api/dm/threads` endpoint returns a `has_unread: boolean` per thread.

### Pattern 5: D-21 presence bucket rendering

```typescript
// lib/social/presence.ts — pure function, no Supabase client
// Source: [ASSUMED] — standard timestamp bucket pattern

export function formatPresenceStatus(lastSeenAt: string | null): string | null {
  if (!lastSeenAt) return null
  const diffMs = Date.now() - new Date(lastSeenAt).getTime()
  const diffMin = diffMs / 60_000
  const diffHr = diffMs / 3_600_000
  const diffDay = diffMs / 86_400_000

  if (diffMin < 2) return 'Active now'            // D-20: app open + tab visible
  if (diffMin < 60) return `Active ${Math.floor(diffMin)}m ago`
  if (diffHr < 24) return `Active ${Math.floor(diffHr)}h ago`
  if (diffDay < 1) return 'Active today'
  if (diffDay < 7) return 'Active this week'
  return null                                       // D-21: nothing after ~7 days
}
```

`last_seen_at` is updated by the API heartbeat route (throttled: one write per 60s per user, enforced in the API handler with a conditional UPDATE: `WHERE last_seen_at < now() - interval '60 seconds'`).

### Pattern 6: Connection gate in `/api/dm/send`

```typescript
// app/api/dm/send/route.ts — modified (conceptual; exact implementation for planner)
// Source: [ASSUMED] — derived from CONTEXT.md D-13 and connections schema

async function isConnected(supabase: SupabaseClient, a: string, b: string): Promise<boolean> {
  const { data } = await supabase
    .from('connections')
    .select('id')
    .eq('status', 'accepted')
    .or(`and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`)
    .maybeSingle()
  return !!data
}

// Rate limit check (D-14 rolling 7-day window)
async function countRecentRequests(supabase: SupabaseClient, userId: string): Promise<number> {
  const [a, b] = [userId, ''] // either participant is the requester
  // Count pending threads created by this user in the last 7 days
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  // Implementation detail: dm_threads needs a created_by column or we track
  // by the smaller/larger of a_id/b_id and cross-reference with the sender of first message
  // OR: store requester_id on dm_threads at creation time — planner's call
  ...
}
```

**Note on rate-limit tracking:** the current `dm_threads` schema has no `requester_id` (only canonical `a_id`/`b_id`). The planner must decide: (a) add `requester_id UUID` to `dm_threads` in migration 054, or (b) infer it from the first `dm_messages` row's `sender_id`. Option (a) is cleaner. `requester_id` is also used by the `/messages` Requests section to separate "requests I sent" from "requests I received."

### Anti-Patterns to Avoid

- **Client-only connection gate:** Never gate the send path only in UI. The server in `/api/dm/send` must independently check `connections.status='accepted'` (D-13 decision + Phase 10 D-14 precedent: "server-side enforcement over UI gating").
- **Tab-scoped presence key:** Using `crypto.randomUUID()` as the presence key creates ghost users on multi-tab. Use `userId` as the key (D-20; STATE.md lock).
- **Client-incrementing the unread badge:** Always fetch a fresh COUNT from the API on Realtime insert — never `setCount(c => c + 1)` (D-07; established in NotificationBell and DmWidget).
- **select('*') on artist_profiles with the session client:** Migration 040 column-lockdown means `SELECT *` returns 42501 with the `authenticated` role. The heartbeat route must use an explicit column list or `createServiceClient()`. Any new queries on `artist_profiles` must use the explicit column list.
- **select('*') on dm_threads after adding `status`/`requester_id`:** Always list columns explicitly, especially on tables with RLS column grants.
- **No removeChannel() on unmount:** `DmWidget.tsx` (line 52) already demonstrates the pattern; the docked widget and presence tracker must mirror it.
- **Firing `new_dm` on every message:** Will create notification spam. Suppress `new_dm` if the recipient has the thread open (check presence or `dm_thread_reads.last_read_at` within the last N seconds). Fire only when the recipient has not read the thread recently. [ASSUMED — planner decides exact suppression threshold]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Presence "Active now" broadcast | Custom WebSocket server or polling table | Supabase Realtime Presence channel | Already in the stack; STATE.md explicitly locks this as the infrastructure choice |
| Unread count | Counter column on `dm_threads` or `artist_profiles` | COUNT query via `dm_thread_reads` + `dm_messages.created_at` | Drift-prone cached counter is ruled out by Wave 4 research and D-07 |
| Block enforcement | UI-only hide of send button | `blocks` table + `no_block()` RLS already live (migration 035/038) | A blocked user can call the API directly; RLS is the only reliable gate |
| Rolling rate limit | Time-bucketed counter table or Redis | COUNT query on `dm_threads WHERE status='pending' AND created_at > now()-'7 days'` | Rolling window via SQL is two lines; no new infrastructure, no drift |
| `canonicalPair` thread ID | New thread-lookup logic | `canonicalPair()` / `findThread()` / `ensureThread()` in `lib/social/dm.ts` | Already correct, tested by existing DM flow |
| Notification dispatch | Custom email/push service | `createNotification()` in `lib/notifications/index.ts` | Already handles email copy, actor snapshot, RLS bypass via service role |

**Key insight:** The DM system already exists; Phase 11 is adding a gate (connection check), a flow (message request), a surface (`/messages`), and a signal (presence). The building blocks are already live in the database.

---

## Runtime State Inventory

> This is a migration/extension phase modifying an existing feature (DMs). Includes runtime state check.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Existing `dm_threads` rows have no `status` column yet (column is net-new in migration 054). All existing threads are between authenticated users with no connection gate. | Migration 054 adds `status` with `DEFAULT 'direct'` — all existing threads automatically grandfathered as 'direct' (D-DISCRETION: connection gate applies to *new* conversations only) |
| Stored data | `dm_thread_reads` table: already live (migration 036), schema correct, no data yet (no UI wrote to it in Phase 10). | Zero action — table is ready |
| Stored data | `connections` table: live with accepted/pending rows from Phase 10 UAT. | Zero action — Phase 11 queries it read-only |
| Stored data | `blocks` table: empty (no block UI yet). `no_block()` always returns true today. | Zero action — Phase 12's block action (D-12) inserts here; `no_block()` already wired |
| Live service config | `app/(artist)/layout.tsx`: currently mounts `NotificationBell` only. Messages icon + docked widget + PresenceTracker are net-new mounts. | Code edit — add three new client-component mounts |
| OS-registered state | None — no scheduled jobs, no task scheduler entries. Rate limiting is pure DB computation (no cron needed). | None |
| Secrets/env vars | No new secrets required — all features use existing Supabase credentials. | None |
| Build artifacts | None relevant. | None |

---

## Common Pitfalls

### Pitfall 1: Ghost "Active now" users after tab close / navigation

**What goes wrong:** If `removeChannel()` is not called on component unmount (e.g., SPA navigation away from the page that mounted the presence channel), the channel stays open and the server-side presence shows the user as still "online" for the TTL duration.

**Why it happens:** Supabase Realtime Presence channels require explicit teardown. Browser tab close triggers `beforeunload` unreliably; SPA navigation fires React's cleanup effects, but only if `return () => removeChannel()` is in the `useEffect`.

**How to avoid:** Mount the presence tracker in `app/(artist)/layout.tsx` as a single long-lived client component. The layout is unmounted only on logout/session end, so only one cleanup fires per session — avoiding the churn of mounting/unmounting per page.

**Warning signs:** Members showing "Active now" in the thread list despite being visibly inactive; spike in Supabase Realtime concurrent-connection metrics.

### Pitfall 2: Multi-tab duplicate presence / ghost keys

**What goes wrong:** If the presence key is `crypto.randomUUID()` (the Supabase default), two open tabs for the same user produce two presence entries on the channel. The `/messages` thread list shows "Active now" twice per user or has non-deterministic behavior in `presenceState()`.

**Why it happens:** Each `supabase.channel().subscribe()` gets a server-assigned UUIDv1 key unless you pass `config.presence.key`. Two tabs → two keys → two entries.

**How to avoid:** Always pass `config: { presence: { key: userId } }` when creating the channel. The user-scoped key means two tabs coalesce into one presence entry. [STATE.md research lock, CITED]

### Pitfall 3: `select('*')` on `artist_profiles` with session client returns 42501

**What goes wrong:** After migration 040, any `supabase.from('artist_profiles').select('*')` using the `authenticated` role fails with PostgreSQL error 42501 (insufficient privilege). This will hit the heartbeat route and any thread-list query that joins profile data.

**Why it happens:** Migration 040 ran `REVOKE SELECT ON artist_profiles FROM authenticated, anon` and then re-granted only specific columns. `*` includes columns with no grant.

**How to avoid:** Any new API route touching `artist_profiles` must either: (a) use an explicit column list matching migration 040's GRANT list, or (b) use `createServiceClient()` with an ownership check first. The heartbeat route should use `createServiceClient()` for the `UPDATE last_seen_at` write.

**Warning signs:** 42501 errors in API route logs; blank profile data in the thread list.

### Pitfall 4: Realtime concurrent-connection budget on the Supabase plan

**What goes wrong:** Phase 11 adds two new Realtime channel types per authenticated user: a global presence channel and potentially a per-thread DM channel (in the docked widget). The existing `dm-${threadId}` channel from `DmWidget.tsx` + the new `presence-global` channel = 2+ channels per active user. The Supabase Free tier caps at 200 concurrent connections.

**Why it happens:** Each `.channel().subscribe()` call opens one WebSocket connection. 100 simultaneous users × 2 channels each = 200 connections — right at the Free tier limit.

**How to avoid:** [STATE.md pending todo — confirm during planning] Recommended approach: use ONE shared channel per user that carries both presence tracking AND postgres_changes subscriptions. Supabase channels support multiple `.on()` subscriptions per channel object. This halves the connection budget.

**Warning signs:** Supabase dashboard realtime/connections metric approaching the plan limit; users reporting delayed presence updates.

### Pitfall 5: `dm_threads` INSERT missing `requester_id`

**What goes wrong:** The rate-limit COUNT query needs to know which user initiated a pending thread. The current schema has no `requester_id` — only canonical `a_id`/`b_id` (sorted by UUID, not by who started the conversation).

**Why it happens:** Migration 012 designed `dm_threads` for symmetric messaging. The canonical pair model doesn't encode directionality.

**How to avoid:** Migration 054 must add `requester_id UUID REFERENCES auth.users ON DELETE CASCADE` to `dm_threads`. The rate-limit query becomes `COUNT(*) FROM dm_threads WHERE requester_id=userId AND status='pending' AND created_at > now()-'7 days'`. The Requests section query becomes `WHERE status='pending' AND (a_id=userId OR b_id=userId) AND requester_id != userId` (requests received).

**Warning signs:** Rate limit counting is incorrect; can't separate "sent requests" from "received requests" in the Requests section.

### Pitfall 6: `no_block()` RLS on `dm_threads` INSERT is on the INSERT policy only

**What goes wrong:** Migration 038 wired `no_block()` into the `dm_threads.dmt_insert_participant` INSERT policy. But `dm_thread_reads` and any new API route that creates a `dm_threads` row via `createServiceClient()` bypasses RLS entirely. A blocked user who has a pre-existing thread row can still INSERT read-markers.

**Why it happens:** Service role bypasses RLS; `dm_thread_reads` INSERT policy (migration 036) only checks `user_id = auth.uid()` — not whether a block exists.

**How to avoid:** The API routes for accept/decline/block must check for an existing block in the application layer before any mutation that bypasses RLS (e.g., service-role reads of thread membership). For `dm_thread_reads`, the RLS policy is fine because reads only upsert the caller's own row and don't cross a block boundary.

---

## Code Examples

### Marking a thread as read (D-06)

```typescript
// Source: [ASSUMED] — derived from dm_thread_reads schema (migration 036)
// Called when a user opens a thread in /messages or the docked widget

async function markThreadRead(supabase: SupabaseClient, threadId: string, userId: string): Promise<void> {
  await supabase.from('dm_thread_reads').upsert({
    thread_id: threadId,
    user_id: userId,
    last_read_at: new Date().toISOString(),
  }, { onConflict: 'thread_id,user_id' })
  // No error throw — mark-read is best-effort (never block the UI)
}
```

### Accept a message request

```typescript
// Source: [ASSUMED] — derived from CONTEXT.md D-09/D-10 and connections pattern
// app/api/dm/request/accept/[threadId]/route.ts

export async function POST(_req: Request, { params }: { params: { threadId: string } }) {
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify this user is the addressee (not requester) — RLS is the backstop
  const { data: thread } = await supabase
    .from('dm_threads')
    .select('id, status, requester_id, a_id, b_id')
    .eq('id', params.threadId)
    .eq('status', 'pending')
    .maybeSingle()
  if (!thread) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  const otherId = thread.requester_id
  if (!otherId || otherId === user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Accept: set status to 'direct'
  const service = createServiceClient()
  await service.from('dm_threads').update({ status: 'direct' }).eq('id', thread.id)

  // Emit new_dm notification to the requester (best-effort, per Phase 10 pattern)
  try {
    const { data: profile } = await service.from('artist_profiles')
      .select('artist_name, avatar_url, handle')
      .eq('id', user.id)
      .single()
    await createNotification(service, buildNewDmNotification({
      recipientId: otherId,
      actorId: user.id,
      actorName: profile?.artist_name ?? 'Someone',
      actorAvatarUrl: profile?.avatar_url ?? null,
      threadId: thread.id,
    }))
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true })
}
```

### Notification builders for Phase 11 (additions to `lib/social/notifications.ts`)

```typescript
// Source: [ASSUMED] — following Phase 10's established NotificationPayload shape

export function buildMessageRequestNotification(args: {
  recipientId: string
  actorId: string
  actorName: string
  actorAvatarUrl: string | null
  actorHandle: string
  threadId: string
  preview: string  // truncated first message body (~60 chars)
}): NotificationPayload {
  return {
    userId: args.recipientId,
    type: 'message_request',
    title: `${args.actorName} sent you a message request`,
    body: args.preview,
    link: `/messages?thread=${args.threadId}`,
    data: { threadId: args.threadId },
    actorId: args.actorId,
    actorName: args.actorName,
    actorAvatarUrl: args.actorAvatarUrl,
  }
}

export function buildNewDmNotification(args: {
  recipientId: string
  actorId: string
  actorName: string
  actorAvatarUrl: string | null
  threadId: string
}): NotificationPayload {
  return {
    userId: args.recipientId,
    type: 'new_dm',
    title: `${args.actorName} replied to your message`,
    link: `/messages?thread=${args.threadId}`,
    data: { threadId: args.threadId },
    actorId: args.actorId,
    actorName: args.actorName,
    actorAvatarUrl: args.actorAvatarUrl,
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-entry DmWidget on profile page (profile-scoped) | Hybrid `/messages` inbox page + persistent docked widget | Phase 11 | Message button on profile now links to `/messages?with=...` instead of opening in-place widget |
| Any auth user can message any auth user | Connection gate: direct if connected, request flow if not | Phase 11 | `ensureThread()` no longer called directly from `/api/dm/send`; connection check runs first |
| No unread DM badge | Unread thread COUNT badge on topbar messages icon | Phase 11 | `dm_thread_reads` table already live; MessagesIcon mirrors NotificationBell's subscribe+COUNT pattern |
| No presence signal | Realtime Presence + `last_seen_at` for offline buckets | Phase 11 | `PresenceDot` in `ProfileView.tsx` already scaffolded (line 92); wires in this phase |

**Deprecated/outdated:**
- `DmWidget.tsx`'s current role as a profile-mounted widget: the "Message" button on `ProfileView.tsx` (line 289) changes from mounting `<DmWidget>` to rendering a `<Link href="/messages?with={ownerId}">Message</Link>`. The DmWidget component itself is superseded for profile use but its patterns (Realtime subscribe, optimistic send, reconcile poll) are carried into `DockedWidget.tsx` and `ConversationView.tsx`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `dm_threads.status` column approach is the right message-request model (vs. separate table) | Architecture Patterns, Pattern 3 | Low — separate table is a valid alternative; the planner can choose either; the difference is one JOIN vs. schema proliferation |
| A2 | React `useState` in `app/(artist)/layout.tsx` is sufficient for docked widget persistence (no Zustand needed) | Architecture Patterns, Pattern 2 | Low — if localStorage persistence across browser refreshes is desired, Zustand persist middleware can be added later without schema changes |
| A3 | Adding `requester_id` to `dm_threads` in migration 054 is required for rate-limit counting and Requests section direction | Architecture Patterns, Pattern 3, Pitfall 5 | MEDIUM — without this column, rate-limit queries require an extra `dm_messages` JOIN to infer sender; less correct for the declared-at-creation requester_id |
| A4 | `new_dm` notification should be suppressed when the recipient has the thread open (or read it recently) | Architecture Patterns (anti-patterns), Code Examples | MEDIUM — if not suppressed, busy threads generate a notification every message; CONTEXT.md leaves this to Claude's discretion |
| A5 | `last_seen_at` should live on `artist_profiles` (not a dedicated table) and be updated by a throttled API heartbeat route | Architecture Patterns, Pattern 5 | Low — dedicated table is cleaner but adds a JOIN everywhere presence is displayed; `artist_profiles` is already joined for all thread-list renders |
| A6 | Presence channel topology: one `presence-global` channel per user (not per-thread or per-page) | Architecture Patterns, Pattern 1, Pitfall 4 | MEDIUM — per-thread channels would consume 1 channel per open conversation; the single global channel is the correct approach for connection budget, but the planner should confirm the combined presence+postgres_changes channel pattern works in supabase-js v2 |
| A7 | All existing `dm_threads` rows should be grandfathered as `status='direct'` (the DEFAULT) | Runtime State Inventory | Low — CONTEXT.md explicitly names grandfathering as Claude's discretion and the default; `DEFAULT 'direct'` makes the migration safe |
| A8 | The Supabase project is on the Free tier (200 concurrent connections ceiling) | Pitfall 4, Environment Availability | MEDIUM — STATE.md records Vercel Hobby but not Supabase plan explicitly; the planner should check Supabase dashboard before finalizing channel topology decisions |

---

## Open Questions

1. **Supabase plan / concurrent-connection budget**
   - What we know: STATE.md flags "Confirm during Phase 11 planning: Supabase Realtime concurrent-connection budgeting / monitoring strategy." Free tier = 200 connections; Pro = 500.
   - What's unclear: Which plan this project is on; what the current peak connection count is.
   - Recommendation: Planner should verify in the Supabase dashboard (Project → Reports → Realtime) before finalizing channel topology. If on Free tier and near 200, the recommendation is ONE combined channel per user (presence + postgres_changes together) rather than separate channels.

2. **`new_dm` notification suppression rule**
   - What we know: CONTEXT.md leaves suppression logic to Claude's discretion; NOTIF-01 lists `new_dm` as a listed type.
   - What's unclear: Whether to fire on every message in a thread or only when the thread hasn't been read recently.
   - Recommendation: Fire `new_dm` only when `dm_thread_reads.last_read_at` for the recipient is more than 60 seconds old (i.e., they haven't opened the thread recently). This avoids spam for active conversations while still notifying for new-but-unread messages.

3. **Breakpoint for desktop pop-out vs. mobile full-screen**
   - What we know: D-03 (desktop pop-out) vs. D-04 (mobile full-screen). Breakpoint is "Claude's discretion to planner."
   - What's unclear: Exact Tailwind breakpoint.
   - Recommendation: Use `lg:` (1024px) — consistent with the two-pane layout breakpoint used elsewhere in ProfileView's `lg:grid-cols-[1fr_360px]`. Mobile is below 1024px: full-screen `/messages`; desktop is 1024px+: `/messages` with pop-out dock affordance.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@supabase/supabase-js` | Realtime Presence, DB queries | ✓ | `^2.45.0` | — |
| Supabase Realtime (Presence feature) | PRESENCE-01/02 | ✓ | Included in supabase-js | — |
| `supabase` CLI | Migration push (054) | ✓ | `^1.200.0` | — |
| Next.js | `/messages` route, API routes | ✓ | `^15.0.0` | — |
| `date-fns` | D-21 bucket rendering | ✗ (not in package.json) | 4.4.0 on npm | Inline `timeAgo()` already in codebase — use it |
| `lucide-react` | New icons | ✗ (not in package.json) | 1.24.0 on npm | Inline SVG (existing pattern) — do not install |

**Missing dependencies with no fallback:** None — all required features have existing solutions.

**Missing dependencies with fallback:**
- `date-fns`: inline `timeAgo()` and `formatPresenceStatus()` are sufficient for D-21's bucket rendering. Do not add `date-fns` unless the planner determines the inline helper needs replacement for a specific formatting case.
- `lucide-react`: all new icons (chat bubble, etc.) follow the existing inline SVG pattern from `DmWidget.tsx`, `NotificationBell.tsx`, and `ProfileView.tsx`. Do not install.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30.4.2 |
| Config file | `jest.config.js` (inferred from `package.json` `"test": "jest"`) |
| Quick run command | `npm test -- --testPathPattern=dm` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRESENCE-01 | `formatPresenceStatus()` returns correct bucket strings | unit | `npm test -- --testPathPattern=presence` | ❌ Wave 0 |
| PRESENCE-02 | `formatPresenceStatus()` returns null after 7 days | unit | `npm test -- --testPathPattern=presence` | ❌ Wave 0 |
| PRESENCE-03 | Unread thread count returns 0 after mark-read | unit | `npm test -- --testPathPattern=dm` | ❌ Wave 0 |
| CONNECT-03 | Non-connection send creates `status='pending'` thread | unit | `npm test -- --testPathPattern=dm-request` | ❌ Wave 0 |
| CONNECT-04 | Rate limit count returns correct value within 7-day window | unit | `npm test -- --testPathPattern=dm-request` | ❌ Wave 0 |
| CONNECT-05 | Connected-user send bypasses request flow | unit | `npm test -- --testPathPattern=dm-request` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- --testPathPattern=dm|presence`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `__tests__/dm-request.test.ts` — covers CONNECT-03, CONNECT-04, CONNECT-05 (pure unit tests on lib/social/dm.ts additions)
- [ ] `__tests__/presence.test.ts` — covers PRESENCE-01, PRESENCE-02 (pure unit tests on lib/social/presence.ts)
- [ ] `__tests__/dm-unread.test.ts` — covers PRESENCE-03 (pure unit test on unread count logic)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase session; `createApiClient()` user check on every route |
| V3 Session Management | yes (inherited) | Existing Supabase cookie session; no new session work |
| V4 Access Control | yes — CRITICAL | `connections` table check for CONNECT-05; rate-limit COUNT; `status` transition guard; `requester_id != user.id` recipient check |
| V5 Input Validation | yes | Zod on all new API routes: `toUserId`, `body` (existing), `threadId` params |
| V6 Cryptography | no | No new secrets or crypto operations |

### Known Threat Patterns for Phase 11 Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Bypass connection gate via direct PostgREST on `dm_threads` | Elevation of Privilege | Server-side connection check in `/api/dm/send`; the `dmt_insert_participant` RLS policy does NOT check connections (it only checks participation + no_block) — the API layer is the gate. The planner may optionally add a DB function/trigger for belt-and-suspenders |
| Rate-limit circumvention by creating threads via different code paths | Elevation of Privilege | All DM creation goes through `/api/dm/send`; the rate-limit check must be in that single route, not split across routes |
| Self-accept a message request (requester accepting their own request) | Spoofing | Recipient check: `thread.requester_id !== user.id` guard in the accept route |
| Enumerate block relationships via the requests endpoint | Information Disclosure | `blocks_select_own` RLS already prevents reading other users' blocks; the request-view Block action is an INSERT (own row), not a SELECT |
| Notification flooding via message request spam | Denial of Service | Rate limit (D-14/D-16) enforced in API; `new_dm` suppression when thread is recently read |
| Ghost presence after session expiry | Spoofing | Presence channel cleanup on `removeChannel()`; `last_seen_at` uses coarse buckets so a stale value becomes invisible after 7 days (D-21) |
| XSS via message body in thread-list preview | Tampering | React renders message body as text content (not `dangerouslySetInnerHTML`); notification builder escapes content for email (existing `esc()` in `lib/notifications/index.ts`) |

---

## Sources

### Primary (verified from official docs)
- [Supabase Realtime Presence docs](https://supabase.com/docs/guides/realtime/presence) — `track()`, `untrack()`, `channel()` API, custom presence key, sync/join/leave events [CITED: supabase.com/docs/guides/realtime/presence]
- [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits) — Free: 200 connections, 20 presence events/sec; Pro: 500 connections, 50 presence events/sec [CITED: supabase.com/docs/guides/realtime/limits]
- [Supabase Realtime Concurrent Peak Connections troubleshooting](https://supabase.com/docs/guides/troubleshooting/realtime-concurrent-peak-connections-quota-jdDqcp) — peak connection counting model [CITED: supabase.com]

### Secondary (codebase-verified)
- `supabase/migrations/035_connections_blocks.sql` — `connections` schema, `blocks` schema, `no_block()` function [VERIFIED: codebase grep]
- `supabase/migrations/036_notifications_dm_reads.sql` — `dm_thread_reads` schema + RLS + realtime publication [VERIFIED: codebase grep]
- `supabase/migrations/038_block_enforcement_existing_tables.sql` — `no_block()` wired into `dm_threads` INSERT policy [VERIFIED: codebase grep]
- `supabase/migrations/012_social_layer.sql` — `dm_threads`/`dm_messages` canonical schema [VERIFIED: codebase grep]
- `supabase/migrations/050_connections_symmetric_active_pair.sql` — symmetric active pair uniqueness [VERIFIED: codebase grep]
- `components/profile/DmWidget.tsx` — existing Realtime subscribe pattern, optimistic send, reconcile poll [VERIFIED: codebase read]
- `components/nav/NotificationBell.tsx` — global Realtime subscribe + fresh COUNT badge pattern [VERIFIED: codebase read]
- `lib/social/dm.ts` — `canonicalPair`, `findThread`, `ensureThread`, `loadConversation` [VERIFIED: codebase read]
- `lib/social/notifications.ts` — notification type catalog, builder shape, `message_request`/`new_dm` listed as Phase 11 additions [VERIFIED: codebase read]
- `.planning/research/SUMMARY.md` + `.planning/research/STACK.md` — Wave 4 research decisions: zero new infra, Realtime Presence, computed-unread rule [VERIFIED: codebase read]

### Tertiary (training knowledge / assumed)
- Pattern 2 (React state in layout for docked widget persistence) [ASSUMED]
- Pattern 3 (dm_threads.status approach) [ASSUMED]
- Pattern 5 (formatPresenceStatus() bucket logic) [ASSUMED]
- A4 (new_dm suppression rule) [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already in `package.json`; no new installs required; Realtime Presence API confirmed via official docs
- Architecture patterns: MEDIUM — status column approach is reasoned but not the only valid model; docked widget persistence via React state is standard but [ASSUMED]
- Security: HIGH — established patterns from Phase 8/10 apply; ASVS categories verified against phase-specific threats
- Realtime concurrent-connection budget: LOW — Supabase plan not confirmed in codebase; planner must verify in dashboard

**Research date:** 2026-07-13
**Valid until:** 2026-08-13 (30 days — stable infrastructure)
