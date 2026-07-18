---
phase: 11-presence-messaging
reviewed: 2026-07-13T00:00:00Z
depth: standard
files_reviewed: 30
files_reviewed_list:
  - app/(artist)/layout.tsx
  - app/(artist)/messages/page.tsx
  - app/api/dm/messages/route.ts
  - app/api/dm/read/[threadId]/route.ts
  - app/api/dm/request/accept/[threadId]/route.ts
  - app/api/dm/request/block/[threadId]/route.ts
  - app/api/dm/request/decline/[threadId]/route.ts
  - app/api/dm/send/route.ts
  - app/api/dm/threads/route.ts
  - app/api/presence/heartbeat/route.ts
  - app/u/[handle]/page.tsx
  - components/messages/Composer.tsx
  - components/messages/ConversationView.tsx
  - components/messages/DockedWidget.tsx
  - components/messages/MessagesPageClient.tsx
  - components/messages/RequestView.tsx
  - components/messages/ThreadList.tsx
  - components/nav/ArtistLayoutClient.tsx
  - components/nav/ArtistNav.tsx
  - components/nav/MessagesIcon.tsx
  - components/nav/NotificationBell.tsx
  - components/nav/PresenceTracker.tsx
  - components/nav/icons.tsx
  - components/profile/ProfilePresenceDot.tsx
  - components/profile/ProfileView.tsx
  - lib/profile/load.ts
  - lib/social/dm.ts
  - lib/social/notifications.ts
  - lib/social/presence.ts
  - supabase/migrations/054_dm_request_status_presence.sql
  - supabase/migrations/055_dm_threads_update_policy.sql
findings:
  critical: 3
  warning: 2
  info: 2
  total: 7
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-07-13T00:00:00Z
**Depth:** standard
**Files Reviewed:** 30
**Status:** issues_found

## Summary

Reviewed the DM/presence stack: the send-gate state machine (`lib/social/dm.ts`), the five `/api/dm/request/*` + `/api/dm/send` + `/api/dm/messages` routes, migrations 054/055, and the messaging/presence UI (Composer, ConversationView, DockedWidget, ThreadList, RequestView, PresenceTracker, ProfilePresenceDot).

The presence-channel lifecycle (PresenceTracker / ProfilePresenceDot / DockedWidget's read-only presence sync) is sound — verified against the installed `@supabase/realtime-js` source that `RealtimeClient.channel(topic)` dedupes by topic, so the "reuse PresenceTracker's already-joined channel, never re-subscribe" pattern used in DockedWidget/MessagesPageClient/ProfilePresenceDot is correct, not a bug.

The message-request state machine has three provable, exploitable authorization defects, all rooted in the same pattern: **the recipient-only guard on a state transition is checked after the mutation has already been committed via the session client**, and **the send route never checks the `blocks` table or the `declined` thread status before inserting a new message**. Together these mean a requester can self-accept their own pending request (permanently escaping the connection gate and refunding their own rate-limit budget), and a blocked/declined sender can keep messaging indefinitely via a direct API call, invisible to the recipient's inbox. A third defect is a classic PostgREST filter-injection surface: unsanitized, attacker-controlled `toUserId`/`otherId` values are string-interpolated into a raw `.or()` filter in `isConnected()`.

## Critical Issues

### CR-01: Requester can self-accept their own pending message request, permanently bypassing the connection gate and the weekly rate limit

**File:** `app/api/dm/request/accept/[threadId]/route.ts:47-63`

**Issue:** The recipient-only guard (`updatedRow.requester_id === user.id` → 403, "Cannot accept your own request") runs **after** the `UPDATE ... SET status = 'direct'` has already executed and been persisted via the session client:

```ts
const { data: updated, error } = await supabase
  .from('dm_threads')
  .update({ status: 'direct' })
  .eq('id', threadId)
  .eq('status', 'pending')
  .select('id, requester_id, a_id, b_id')
  .maybeSingle()
...
if (updatedRow.requester_id === user.id) {
  return NextResponse.json({ error: 'Cannot accept your own request' }, { status: 403 })
}
```

Migration 055's `dmt_update_participant` RLS policy scopes UPDATE to *any* thread participant (`a_id = auth.uid() OR b_id = auth.uid()`), not to the recipient specifically — the requester is themselves a participant. So when the original requester (the sender of the cold outreach) calls this route on their own `threadId` (which they already know — it's returned in the `/api/dm/send` response), the `UPDATE` succeeds under RLS and the thread flips to `status = 'direct'` *before* the guard ever runs. The route then returns a 403 to the caller, but the mutation the guard exists to prevent has already committed. The 403 is purely cosmetic.

Impact: any account can convert every pending outbound request it sends into a permanently "direct" (connection-equivalent) thread, at will, with a single extra API call — completely defeating CONNECT-05's "connected members bypass the message-request flow" boundary, since "connected" here is being self-granted rather than earned via mutual accept.

This is further amplified by `countRecentRequests()` (`lib/social/dm.ts:78-90`), which only counts threads where `status = 'pending'`. Once a thread is (self-)accepted to `'direct'`, it no longer occupies rate-limit budget, so an attacker can repeatedly: send a cold request (spend 1/10 weekly budget) → immediately self-accept via this route (thread becomes `'direct'`, budget refunded) → repeat against a new target. This turns the weekly request cap into an unlimited-target messaging system.

**Fix:** Make the guard part of the atomic mutation instead of a post-hoc check, e.g.:

```ts
const { data: updated, error } = await supabase
  .from('dm_threads')
  .update({ status: 'direct' })
  .eq('id', threadId)
  .eq('status', 'pending')
  .neq('requester_id', user.id) // recipient-only, enforced in the WHERE clause
  .select('id, requester_id, a_id, b_id')
  .maybeSingle()
if (error) return NextResponse.json({ error: error.message }, { status: 500 })
if (!updated) return NextResponse.json({ error: 'Request not found or not permitted' }, { status: 404 })
```

This makes the requester-exclusion part of the same atomic statement so there is no window where the forbidden transition can commit.

---

### CR-02: `blocks` and `declined` status are never enforced by the send route — blocking/declining a sender does not stop them from continuing to message

**File:** `app/api/dm/send/route.ts:122-195`, `lib/social/dm.ts:11-37, 98-112`

**Issue:** `POST /api/dm/send` never queries the `blocks` table, and the only status branch it checks is `existingPendingByMe` (`status === 'pending' && requester_id === caller`). There is no branch for `status === 'declined'`. `findThread()` (`lib/social/dm.ts:11-24`) returns an existing `dm_threads` row regardless of its status, and `ensureThread()` (`lib/social/dm.ts:27-37`) only performs a fresh `INSERT` (where the `dmt_insert_participant`/`no_block()` RLS clause from migration 038 would apply) when `findThread` returns nothing. Once *any* thread row already exists between two users — including one that was just `declined` or `blocked` (the block route sets the same `status = 'declined'`, see `app/api/dm/request/block/[threadId]/route.ts:48`) — `ensureThread` short-circuits at the existing row and no `INSERT` (and therefore no `no_block()` check) is ever attempted.

Consequences, reachable via a direct `POST /api/dm/send` call with a known `toUserId`/`threadId` (no UI is required — and indeed the normal UI can't even surface this thread, see below):

1. A requester whose message request was **declined** can keep sending unlimited follow-up messages into the same thread indefinitely. Each call takes the `!existingPendingByMe` branch (since `status` is `'declined'`, not `'pending'`), `countRecentRequests()` doesn't count declined threads either (it filters `status = 'pending'`), so `chooseSendPath` keeps returning `'request'` and a `message_request` notification (`buildMessageRequestNotification`) fires to the recipient on *every single message*, not just the first.
2. A requester whose target has **blocked** them (block route inserts into `blocks` and also flips `status` to `'declined'`) can likewise keep sending messages through the same existing thread — the `blocks` row is never consulted by `/api/dm/send`.
3. These messages are invisible to the recipient in the product UI: `ThreadList` (`components/messages/ThreadList.tsx:96-99`) only ever renders threads with `status === 'direct'` or `status === 'pending'` — a `'declined'` thread matches neither the "normal" bucket nor the "Requests" bucket, so it never appears in either list for either party, even though `buildThreadViews()` returns it and messages keep accumulating in it server-side.
4. `Composer.tsx:142-146` explicitly special-cases `res.status === 403` as "Blocked — silently keep the optimistic bubble as sent," implying the send route is expected to signal a block this way. It never does — grep of `app/api/dm/send/route.ts` shows no `403` response anywhere. So the one client-side affordance that exists for a blocked-sender scenario is unreachable dead code, and a blocked sender's message will genuinely be persisted, notified, and rendered as delivered.

**Fix:** In `/api/dm/send`, before proceeding down the non-connected path, explicitly check the thread's terminal state and the `blocks` table, e.g.:

```ts
if (existingThreadId) {
  const { data: threadRow } = await supabase
    .from('dm_threads')
    .select('status, requester_id')
    .eq('id', existingThreadId)
    .maybeSingle()
  const row = threadRow as { status: string; requester_id: string | null } | null
  if (row?.status === 'declined') {
    return NextResponse.json({ error: 'Message could not be delivered' }, { status: 403 })
  }
  ...
}
// Also check blocks in both directions regardless of thread existence:
const { data: blocked } = await supabase
  .from('blocks')
  .select('id')
  .or(`and(blocker_id.eq.${toUserId},blocked_id.eq.${user.id}),and(blocker_id.eq.${user.id},blocked_id.eq.${toUserId})`)
  .maybeSingle()
if (blocked) return NextResponse.json({ error: 'Message could not be delivered' }, { status: 403 })
```

(Note: build this filter with validated/UUID-checked ids — see CR-03 — rather than raw interpolation.)

---

### CR-03: Unsanitized user input interpolated into a raw PostgREST `.or()` filter string (`isConnected`) — filter-injection surface

**File:** `lib/social/dm.ts:98-112`, reachable from `app/api/dm/send/route.ts:68` (`toUserId` from request body) and `app/api/dm/messages/route.ts:29` (`otherId` from query string)

**Issue:**

```ts
export async function isConnected(supabase: SupabaseClient, a: string, b: string): Promise<boolean> {
  const { data } = await supabase
    .from('connections')
    .select('id')
    .eq('status', 'accepted')
    .or(
      `and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`
    )
    .maybeSingle()
  return !!data
}
```

`b` (i.e. `toUserId`/`otherId`) is attacker-controlled and never validated as a UUID before being concatenated directly into a raw PostgREST filter-grammar string. `.or()` in supabase-js sends this string verbatim as the `or=` query parameter; it is parsed by PostgREST's own filter DSL (`,` separates OR alternatives, `()` groups AND clauses, `.` separates column/operator/value). Because the value is not escaped, an attacker can break out of the intended `addressee_id.eq.<value>` term and append additional filter alternatives at the top level of the `.or()` list — e.g. a `toUserId` containing a `)` followed by `,requester_id.eq.<attacker-id>` would make the `.or()` match **any** accepted connection row where the attacker is the requester, regardless of who the real `addressee_id`/target actually is. Since `isConnected()` is the single trust boundary deciding whether a message is sent via the unrestricted "direct" path (bypassing the message-request rate limit entirely — see `app/api/dm/send/route.ts:65-120`), a forged `toUserId` can make the gate return `true` for an arbitrary recipient the attacker has no real accepted connection with, as long as the attacker has *some* accepted connection with *anyone*.

This is the same class of bug as the well-documented PostgREST/Supabase `.or()` filter-injection pattern — raw string interpolation of untrusted input into `.or()`/`.filter()` is unsafe regardless of whether the interpolated value is expected to be a UUID.

**Fix:** Validate `toUserId`/`otherId` as a UUID before ever passing it to `isConnected`/`findThread`/`ensureThread` (reject early with 400 otherwise), and/or replace the raw `.or()` string with two `.eq()`-scoped queries combined in JS (or Postgres `IN`/array parameters), e.g.:

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (!toUserId || !UUID_RE.test(toUserId)) {
  return NextResponse.json({ error: 'Invalid recipient' }, { status: 400 })
}
```

Apply the same validation at the top of both `/api/dm/send` and `/api/dm/messages` before any query is built.

## Warnings

### WR-01: `decline` route also mutates before checking the recipient guard (self-decline), producing a misleading 403 after the change already applied

**File:** `app/api/dm/request/decline/[threadId]/route.ts:19-35`

**Issue:** Same ordering flaw as CR-01, but with a low-severity outcome (a requester can only harm their own outbound request, not gain a privilege):

```ts
const { data: updated, error } = await supabase
  .from('dm_threads')
  .update({ status: 'declined' })
  .eq('id', threadId)
  .eq('status', 'pending')
  .select('id, requester_id')
  .maybeSingle()
...
if (updatedRow.requester_id === user.id) {
  return NextResponse.json({ error: 'Cannot decline your own request' }, { status: 403 })
}
```

If the requester calls this on their own pending thread, the `UPDATE` succeeds (RLS only checks participancy) and the thread is silently flipped to `'declined'` — then the route returns a 403 telling the caller the action failed. The client is told "error," but the state change already happened. This also means the requester can inadvertently trigger CR-02's "declined-thread-still-sendable" bug against themselves.

**Fix:** Same pattern as CR-01 — add `.neq('requester_id', user.id)` to the update chain so the guard is enforced atomically by the `WHERE` clause instead of after the fact.

### WR-02: Composer's "silent block" UX path is unreachable given CR-02, and will mislead a blocked sender into believing their message was delivered

**File:** `components/messages/Composer.tsx:142-146`

**Issue:**

```ts
if (res.status === 403) {
  // Blocked — silently keep the optimistic bubble as "sent". The sender
  // must never learn they were blocked (UI-SPEC error-states: silent).
  return
}
```

This branch assumes `/api/dm/send` returns 403 when the caller has been blocked by the recipient. As shown in CR-02, the send route never returns 403 for that scenario today — a blocked sender's message is inserted successfully (200 OK) and rendered as delivered, not silently dropped. Once CR-02 is fixed to return 403 for a blocked/declined send, this branch will start doing its intended job; until then it is dead code that documents a security property the backend does not actually provide.

**Fix:** Land alongside CR-02's fix; add a regression test asserting a blocked sender's `POST /api/dm/send` returns 403 and no `dm_messages` row is inserted.

## Info

### IN-01: `buildThreadViews` sort-fallback comment does not match the implementation

**File:** `lib/social/dm.ts:274-281`

**Issue:** The comment states threads with no message "fall back to created_at and sort last," but the code falls back to the epoch (`?? 0`), not `t.createdAt`:

```ts
// Order threads by latest message time desc; threads with no message yet
// ... fall back to created_at and sort last.
views.sort((a, b) => {
  const aTime = new Date(a.lastMessage?.createdAt ?? 0).getTime()
  const bTime = new Date(b.lastMessage?.createdAt ?? 0).getTime()
  return bTime - aTime
})
```

The observed behavior (sorts last) is correct because epoch 0 is always the oldest possible timestamp, so this is not a functional bug — just a misleading comment that should be corrected to avoid confusing future maintainers into "fixing" it to use `t.createdAt` (which would change ordering among multiple message-less threads from "insertion order" to "created_at order" — a behavior change, not obviously wrong, but worth being intentional about).

**Fix:** Update the comment to describe the actual fallback (`?? 0`), or change the code to use `t.createdAt` if that was actually the intended behavior.

### IN-02: Optimistic message bubble is never reconciled if the send response is missing `data.id`

**File:** `components/messages/Composer.tsx:153-160`

**Issue:**

```ts
const json = await res.json().catch(() => ({}))
const real = json.data as (DmMessageView & { threadId?: string }) | undefined
if (real?.id) {
  setMessages(m => m.map(x => (x.id === tmpId ? { id: real.id, ... } : x)))
}
if (real?.threadId) onSent?.(real.threadId)
```

If the server responds `200 OK` but the JSON body doesn't parse as expected (e.g. a proxy/middleware alters the body, or a future refactor changes the response shape without updating this client), the temporary `tmp-<timestamp>` bubble is left in `messages` state permanently with no real id — it will never be deduplicated against the eventual Realtime `INSERT` echo (dedup in `ConversationView`/`DockedWidget` is keyed by `x.id === n.id`, and the tmp id never matches a real DB id), producing a duplicate/ghost bubble in the thread.

**Fix:** Treat a `200` response with no usable `real.id` as a soft failure (revert the optimistic bubble and surface the existing error UI), the same way a non-OK response is already handled.

---

_Reviewed: 2026-07-13T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
