# Phase 11: Presence & Messaging - Pattern Map

**Mapped:** 2026-07-13
**Files analyzed:** 16 new/modified files
**Analogs found:** 14 / 16

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/054_dm_request_status_presence.sql` | migration | CRUD | `supabase/migrations/036_notifications_dm_reads.sql` | role-match |
| `app/(artist)/layout.tsx` | provider | event-driven | `app/(artist)/layout.tsx` (self, modified) | exact |
| `app/(artist)/messages/page.tsx` | page (server component) | request-response | `app/(artist)/vault/page.tsx` | role-match |
| `components/nav/MessagesIcon.tsx` | component | event-driven | `components/nav/NotificationBell.tsx` | exact |
| `components/messages/ThreadList.tsx` | component | event-driven | `components/nav/NotificationBell.tsx` (badge/realtime) + `components/profile/DmWidget.tsx` (message display) | role-match |
| `components/messages/ConversationView.tsx` | component | event-driven | `components/profile/DmWidget.tsx` | exact |
| `components/messages/RequestView.tsx` | component | request-response | `components/profile/DmWidget.tsx` | role-match |
| `components/messages/DockedWidget.tsx` | component | event-driven | `components/profile/DmWidget.tsx` | exact |
| `components/profile/DmWidget.tsx` | component | — | — (deprecated profile mount, simplified to Link) | replaced |
| `components/profile/ProfileView.tsx` | component | — | self (modified) | partial |
| `lib/social/dm.ts` | service | CRUD | `lib/social/dm.ts` (self, extended) | exact |
| `lib/social/notifications.ts` | service | — | `lib/social/notifications.ts` (self, extended) | exact |
| `lib/social/presence.ts` | utility | transform | `lib/social/dm.ts` (pure function pattern) | role-match |
| `app/api/dm/send/route.ts` | route | request-response | `app/api/dm/send/route.ts` (self, modified) + `app/api/connections/route.ts` | exact |
| `app/api/dm/threads/route.ts` | route | request-response | `app/api/dm/messages/route.ts` | exact |
| `app/api/dm/read/[threadId]/route.ts` | route | request-response | `app/api/dm/messages/route.ts` | role-match |
| `app/api/dm/request/accept/[threadId]/route.ts` | route | request-response | `app/api/connections/route.ts` (PATCH accept) | exact |
| `app/api/dm/request/decline/[threadId]/route.ts` | route | request-response | `app/api/connections/route.ts` (PATCH decline) | exact |
| `app/api/dm/request/block/[threadId]/route.ts` | route | request-response | `app/api/connections/route.ts` | role-match |
| `app/api/presence/heartbeat/route.ts` | route | request-response | `app/api/dm/send/route.ts` | role-match |

---

## Pattern Assignments

### `components/nav/MessagesIcon.tsx` (component, event-driven)

**Analog:** `components/nav/NotificationBell.tsx`

**Imports pattern** (lines 1-6):
```typescript
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
```

**Realtime + poll badge pattern** (lines 22-64) — copy this structure exactly; swap endpoint from `/api/notifications?unread=true` to `/api/dm/threads?unread=true`:
```typescript
const supabase = useMemo(() => createClient(), [])

// Poll: fresh COUNT fetch — never client-increment (D-07 rule)
useEffect(() => {
  let alive = true
  const tick = async () => {
    const res = await fetch('/api/dm/threads?unread=true')
    if (!alive || !res.ok) return
    const json = await res.json().catch(() => ({}))
    if (typeof json.unreadCount === 'number') setUnreadCount(json.unreadCount)
  }
  tick()
  const id = setInterval(tick, 25000)
  return () => { alive = false; clearInterval(id) }
}, [userId])

// Global Realtime subscription — stable per-user channel, on INSERT refetch (never increment)
useEffect(() => {
  const channel = supabase
    .channel(`dm-messages-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `...` },
      () => {
        fetch('/api/dm/threads?unread=true')
          .then(r => (r.ok ? r.json() : null))
          .then(json => {
            if (json && typeof json.unreadCount === 'number') setUnreadCount(json.unreadCount)
          })
          .catch(() => {})
      }
    )
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}, [supabase, userId])
```

**Badge rendering pattern** (lines 77-109) — copy badge JSX from `NotificationBell.tsx` but render a chat-bubble SVG inline instead of the bell SVG; change `aria-label` to "Messages"; use `href="/messages"` (a Link, not a dropdown toggle):
```typescript
const badgeLabel = unreadCount >= 10 ? '9+' : String(unreadCount)
// Badge span — copy exact className from NotificationBell lines 103-108
{unreadCount > 0 && (
  <span className="absolute -right-[4px] -top-[4px] flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 border-card bg-brandfuchsia px-[3px] text-[10px] font-extrabold leading-none text-white [font-variant-numeric:tabular-nums]">
    {badgeLabel}
  </span>
)}
```

---

### `components/messages/DockedWidget.tsx` (component, event-driven)

**Analog:** `components/profile/DmWidget.tsx`

**Full component structure** — inherit the entire `DmWidget.tsx` JSX and lifecycle; the key changes are: (1) mounting model (layout-level, not profile-level), (2) presence header replacing "Direct message" sub-label, (3) prop signature changes.

**Imports pattern** (lines 1-5):
```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import type { DmMessageView } from '@/lib/social/dm'
import { createClient } from '@/lib/supabase/client'
```

**Realtime subscribe lifecycle** (lines 33-54) — copy exactly, changing only the channel name prefix:
```typescript
useEffect(() => {
  if (!threadId) return
  const supabase = createClient()
  const channel = supabase
    .channel(`dm-${threadId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `thread_id=eq.${threadId}` },
      payload => {
        const n = payload.new as { id: string; body: string; created_at: string; sender_id: string }
        setMessages(m =>
          m.some(x => x.id === n.id)
            ? m
            : [...m, { id: n.id, body: n.body, createdAt: n.created_at, mine: n.sender_id === viewerId }]
        )
      }
    )
    .subscribe()
  return () => { supabase.removeChannel(channel) }  // always cleanup (Pitfall 1)
}, [threadId, viewerId])
```

**Reconcile poll** (lines 57-73) — copy exactly:
```typescript
useEffect(() => {
  let alive = true
  const tick = async () => {
    const res = await fetch(`/api/dm/messages?with=${otherId}`)
    if (!alive || !res.ok) return
    const json = await res.json().catch(() => ({}))
    if (Array.isArray(json.data)) setMessages(json.data as DmMessageView[])
  }
  tick()
  const id = setInterval(tick, 20000)
  return () => { alive = false; clearInterval(id) }
}, [otherId])
```

**Optimistic send with revert** (lines 79-100) — copy exactly; only change endpoint if needed:
```typescript
async function send() {
  const text = body.trim()
  if (!text || busy) return
  setBusy(true)
  const tmpId = `tmp-${Date.now()}`
  setMessages(m => [...m, { id: tmpId, body: text, createdAt: new Date().toISOString(), mine: true }])
  setBody('')
  const res = await fetch('/api/dm/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toUserId: otherId, body: text }),
  })
  setBusy(false)
  if (!res.ok) {
    setMessages(m => m.filter(x => x.id !== tmpId)) // revert on failure
    return
  }
  // swap tmp id for real id from response
}
```

**Fixed-position container** (lines 124-176) — the `.pf-dm` widget positioning; copy the outer `div` class wholesale:
```typescript
<div className="fixed bottom-0 right-8 z-50 w-[336px] overflow-hidden rounded-t-[14px] border border-hairstrong bg-card shadow-[0_-20px_60px_-20px_rgba(0,0,0,.7)]">
```

**Header pattern** (lines 126-140) — add presence status line below the name (D-22); replace "Direct message" sub-label:
```typescript
<div className="text-[12px] font-semibold text-lavdim">
  {presenceStatus ?? 'Direct message'}
</div>
```

---

### `components/messages/ConversationView.tsx` (component, event-driven)

**Analog:** `components/profile/DmWidget.tsx`

Same Realtime + reconcile poll + optimistic send patterns as `DockedWidget.tsx`. The visual difference is that this is the two-pane right column (full height, not fixed-position). Copy the message bubble rendering JSX from `DmWidget.tsx` lines 143-156 directly — the CSS classes (`bg-grad`, `bg-card2`, `border-hair`, `text-lav`, `rounded-[14px]`) are already correct design tokens.

**Auto-read on open** (D-06) — add after open/thread is established:
```typescript
useEffect(() => {
  if (!threadId || !viewerId) return
  fetch(`/api/dm/read/${threadId}`, { method: 'POST' }).catch(() => {})
}, [threadId, viewerId])
```

---

### `components/messages/ThreadList.tsx` (component, event-driven)

**Analog:** `components/nav/NotificationBell.tsx` (for the subscription pattern) + `components/profile/DmWidget.tsx` (for the avatar/initials helpers)

**Initials helper** (DmWidget.tsx line 17-19) — copy directly:
```typescript
function initials(name: string): string {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}
```

**Subscription pattern** — subscribe to `dm_messages` inserts for the current user's threads (similar to MessagesIcon), then call the thread-list fetch to refresh. Do not maintain a separate client-side counter.

**Presence dot rendering** (D-22) — add a small dot indicator next to each avatar in the thread list, driven by presence state passed from the parent or fetched via `presenceState()` on the global presence channel.

---

### `components/messages/RequestView.tsx` (component, request-response)

**Analog:** `components/profile/DmWidget.tsx` (message bubble rendering) + `app/api/connections/route.ts` (accept/decline action pattern in the UI callback shape)

Accept/Decline/Block actions follow the same `fetch` → error-revert pattern as `DmWidget.send()` (lines 79-100). Show message bubbles (read-only, no composer) using the same bubble CSS. Block is a third action button that calls `/api/dm/request/block/[threadId]`.

---

### `lib/social/presence.ts` (utility, transform)

**Analog:** `lib/social/dm.ts` (pure function module shape — no Supabase client, named exports, types first)

**Module shape** (dm.ts lines 1-8):
```typescript
// Pure functions only — no Supabase client, no I/O.
// Mirrors lib/social/notifications.ts pure-function convention.

export function formatPresenceStatus(lastSeenAt: string | null): string | null {
  if (!lastSeenAt) return null
  const diffMs = Date.now() - new Date(lastSeenAt).getTime()
  const diffMin = diffMs / 60_000
  const diffHr  = diffMs / 3_600_000
  const diffDay = diffMs / 86_400_000

  if (diffMin < 2)   return 'Active now'
  if (diffMin < 60)  return `Active ${Math.floor(diffMin)}m ago`
  if (diffHr  < 24)  return `Active ${Math.floor(diffHr)}h ago`
  if (diffDay < 1)   return 'Active today'
  if (diffDay < 7)   return 'Active this week'
  return null  // D-21: nothing after ~7 days
}
```

---

### `lib/social/dm.ts` (service, CRUD — modified)

**Analog:** `lib/social/dm.ts` (self; extend the existing four exports)

**Existing patterns to preserve** (lines 1-59) — `canonicalPair`, `findThread`, `ensureThread`, `loadConversation` remain unchanged.

**New helpers to add** — follow the same async-function-returning-data-or-null pattern:
```typescript
// Rate-limit count — rolling 7-day window (D-14)
export async function countRecentRequests(
  supabase: SupabaseClient,
  requesterId: string
): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('dm_threads')
    .select('id', { count: 'exact', head: true })
    .eq('requester_id', requesterId)
    .eq('status', 'pending')
    .gte('created_at', since)
  return count ?? 0
}

// Connection check (D-13)
export async function isConnected(
  supabase: SupabaseClient,
  a: string,
  b: string
): Promise<boolean> {
  const { data } = await supabase
    .from('connections')
    .select('id')
    .eq('status', 'accepted')
    .or(`and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`)
    .maybeSingle()
  return !!data
}
```

---

### `lib/social/notifications.ts` (service — modified)

**Analog:** `lib/social/notifications.ts` (self; append two new builders)

**Existing builder shape** (lines 52-68) — copy the `buildNewFollowerNotification` pattern exactly for both new builders:
```typescript
export function buildMessageRequestNotification(args: {
  recipientId: string
  actorId: string
  actorName: string
  actorAvatarUrl: string | null
  actorHandle: string
  threadId: string
  preview: string
}): NotificationPayload {
  return {
    userId: args.recipientId,
    type: 'message_request',      // must add to NOTIFICATION_TYPES catalog first
    title: `${args.actorName} sent you a message request`,
    body: args.preview,
    link: `/messages?thread=${args.threadId}`,
    data: { threadId: args.threadId },
    actorId: args.actorId,
    actorName: args.actorName,
    actorAvatarUrl: args.actorAvatarUrl,
  }
}
```

**NOTIFICATION_TYPES catalog** (lines 21-32) — add before the `as const` close:
```typescript
message_request: { icon: 'message-circle', inlineAction: 'message_request_respond' },
new_dm: { icon: 'message-square', inlineAction: null },
```

---

### `app/api/dm/send/route.ts` (route, request-response — modified)

**Analog:** `app/api/dm/send/route.ts` (self) + `app/api/connections/route.ts` (connection check + notification side-effect)

**Auth pattern** (send/route.ts lines 20-25) — copy exactly:
```typescript
const supabase = await createApiClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
if (user.id === toUserId) return NextResponse.json({ error: 'Cannot message yourself' }, { status: 400 })
```

**Connection gate injection** — insert BEFORE `ensureThread`, using `isConnected()` from `lib/social/dm.ts`:
```typescript
const connected = await isConnected(supabase, user.id, toUserId)
if (!connected) {
  // rate-limit check
  const recentCount = await countRecentRequests(supabase, user.id)
  const limit = isVerified ? VERIFIED_REQUEST_LIMIT : BASELINE_REQUEST_LIMIT
  if (recentCount >= limit) {
    return NextResponse.json({ error: 'Rate limit reached', remaining: 0 }, { status: 429 })
  }
  // pending-thread stacked-message cap check (D-18)
  // ... then ensureThread with requester_id + status='pending'
}
```

**Notification side-effect** (connections/route.ts lines 109-127) — copy the try/catch best-effort pattern:
```typescript
try {
  const actor = await loadActor(supabase, user.id)
  const service = createServiceClient()
  await createNotification(service, buildMessageRequestNotification({ ... }))
} catch {
  // Non-fatal — the message itself was persisted.
}
```

---

### `app/api/dm/threads/route.ts` (route, request-response — net-new)

**Analog:** `app/api/dm/messages/route.ts`

**Full file shape** (messages/route.ts lines 1-25) — copy the GET handler structure exactly:
```typescript
import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

export async function GET(request: Request) {
  if (DEMO) return NextResponse.json({ data: [], unreadCount: 0 })

  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // query thread list — include status, requester_id, last message preview
  // use explicit column list (never select('*') — Pitfall 3 anti-pattern)
}
```

---

### `app/api/dm/read/[threadId]/route.ts` (route, request-response — net-new)

**Analog:** `app/api/dm/messages/route.ts` (auth pattern) + `lib/notifications/index.ts` (upsert shape)

**Auth pattern** — copy messages/route.ts lines 13-19. Then:
```typescript
// Upsert the read marker — best-effort, never block the response
await supabase.from('dm_thread_reads').upsert({
  thread_id: params.threadId,
  user_id: user.id,
  last_read_at: new Date().toISOString(),
}, { onConflict: 'thread_id,user_id' })

return NextResponse.json({ ok: true })
```

---

### `app/api/dm/request/accept/[threadId]/route.ts` (route, request-response — net-new)

**Analog:** `app/api/connections/route.ts` PATCH handler (lines 131-215)

**Status transition pattern** (connections/route.ts lines 160-173):
```typescript
// Use SESSION client for the status update — RLS enforces only the recipient can accept
const { data: updated, error } = await supabase
  .from('dm_threads')
  .update({ status: 'direct' })
  .eq('id', params.threadId)
  .eq('status', 'pending')
  .select('id, requester_id, a_id, b_id')
  .maybeSingle()
if (error) return NextResponse.json({ error: error.message }, { status: 500 })
if (!updated) return NextResponse.json({ error: 'Request not found or not permitted' }, { status: 404 })
```

**Recipient guard** — verify `updated.requester_id !== user.id` (self-accept prevention; mirrors connections/route.ts "requester cannot self-accept" constraint).

**Notification side-effect** (connections/route.ts lines 197-208) — copy the try/catch best-effort block:
```typescript
try {
  const actor = await loadActor(supabase, user.id)
  const service = createServiceClient()
  await createNotification(service, buildNewDmNotification({ recipientId: updated.requester_id, ... }))
} catch { /* Non-fatal */ }
```

---

### `app/api/dm/request/decline/[threadId]/route.ts` (route, request-response — net-new)

**Analog:** `app/api/connections/route.ts` PATCH decline branch

Same auth + session-client update pattern as accept, but `status: 'declined'`. No notification fired (D-11 silent decline). No service client needed.

---

### `app/api/dm/request/block/[threadId]/route.ts` (route, request-response — net-new)

**Analog:** `app/api/connections/route.ts` POST handler

Auth pattern identical. Then insert into `blocks` table using service client (blocks RLS requires service role for cross-user inserts — check migration 035 for exact column names before implementing).

---

### `app/api/presence/heartbeat/route.ts` (route, request-response — net-new)

**Analog:** `app/api/dm/send/route.ts` (auth pattern, minimal POST handler)

**Throttled write pattern**:
```typescript
export async function POST(_req: Request) {
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Use service client for the UPDATE — artist_profiles column lockdown
  // (migration 040 Pitfall 3: select('*') returns 42501 with session role)
  const service = createServiceClient()
  // Throttle: only write if last_seen_at is older than 60s (avoid per-heartbeat writes)
  await service
    .from('artist_profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', user.id)
    .lt('last_seen_at', new Date(Date.now() - 60_000).toISOString())

  return NextResponse.json({ ok: true })
}
```

---

### `app/(artist)/layout.tsx` (provider — modified)

**Analog:** `app/(artist)/layout.tsx` (self)

**Current mounting pattern** (lines 1-39) — add `MessagesIcon` beside `NotificationBell` in the header; add `PresenceTracker` and `DockedWidget` as client-component mounts. The layout stays a server component; client concerns are in the child components:
```typescript
// In the header row (line 33), add:
{user && <MessagesIcon userId={user.id} />}
{user && <NotificationBell userId={user.id} />}
// After {children}:
{user && <PresenceTracker userId={user.id} />}
// DockedWidget state: lift into a client wrapper component
// or use a context provider mounted here
```

**Docked widget state** — the layout must become (or wrap into) a client component to hold `useState<string | null>(null)` for `dockedThreadId`. The cleanest approach per RESEARCH Pattern 2: extract a `ArtistLayoutClient` wrapper that holds the docked state and renders `DockedWidget` conditionally. The server component `ArtistLayout` fetches session + capabilities, then renders `<ArtistLayoutClient>`.

---

### `app/(artist)/messages/page.tsx` (page, server component — net-new)

**Analog:** `app/(artist)/vault/page.tsx` (server-component fetch pattern)

**Server fetch pattern** (vault/page.tsx) — fetch initial thread list server-side using `createServerClient()`, pass as props to a `<MessagesPageClient>` component. The client component wires the Realtime subscription on top.

---

## Shared Patterns

### Auth check — apply to all new API routes
**Source:** `app/api/dm/send/route.ts` lines 20-25
```typescript
const supabase = await createApiClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

### Notification side-effect (best-effort try/catch) — apply to send, accept routes
**Source:** `app/api/connections/route.ts` lines 109-127
```typescript
try {
  const actor = await loadActor(supabase, user.id)
  const service = createServiceClient()
  await createNotification(service, buildXxxNotification({ ... }))
} catch {
  // Non-fatal — primary mutation was already persisted.
}
```

### Actor snapshot helper — copy into every new route that fires a notification
**Source:** `app/api/connections/route.ts` lines 17-36
```typescript
async function loadActor(
  supabase: Awaited<ReturnType<typeof createApiClient>>,
  userId: string
): Promise<{ name: string; avatarUrl: string | null; handle: string }> {
  const { data } = await supabase
    .from('artist_profiles')
    .select('artist_name, avatar_url, handle')  // explicit columns — never select('*')
    .eq('id', userId)
    .maybeSingle()
  const row = (data ?? {}) as { artist_name?: string | null; avatar_url?: string | null; handle?: string | null }
  return {
    name: row.artist_name || 'Member',
    avatarUrl: row.avatar_url ?? null,
    handle: row.handle ?? '',
  }
}
```

### Realtime channel cleanup — apply to all new client components
**Source:** `components/profile/DmWidget.tsx` lines 51-53 / `components/nav/NotificationBell.tsx` lines 61-63
```typescript
return () => {
  supabase.removeChannel(channel)  // always explicit — never omit (Pitfall 1)
}
```

### DEMO guard — apply to all new API routes
**Source:** `app/api/dm/send/route.ts` line 5 and 9
```typescript
const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
// At top of handler:
if (DEMO) return NextResponse.json({ data: ... })
```

### Explicit column selection on artist_profiles — apply to all routes touching this table
**Source:** `app/api/connections/route.ts` lines 22-26 + RESEARCH Pitfall 3
```typescript
// Always list columns — select('*') returns 42501 after migration 040
.select('artist_name, avatar_url, handle')
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `supabase/migrations/054_dm_request_status_presence.sql` | migration | CRUD | Closest analog is migration 036 (dm_thread_reads) but migrations are largely bespoke; planner should read migration 036 + 040 for column-GRANT doctrine before writing |

---

## Metadata

**Analog search scope:** `components/`, `app/api/dm/`, `app/api/connections/`, `lib/social/`, `lib/notifications/`, `app/(artist)/`
**Files scanned:** 8 analog files read in full
**Pattern extraction date:** 2026-07-13
