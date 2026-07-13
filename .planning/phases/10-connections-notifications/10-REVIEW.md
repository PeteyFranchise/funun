---
phase: 10-connections-notifications
reviewed: 2026-07-12T00:00:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - __tests__/connections.test.ts
  - __tests__/notification-triggers.test.ts
  - __tests__/notifications-api.test.ts
  - app/(artist)/layout.tsx
  - app/api/connections/route.ts
  - app/api/endorsements/route.ts
  - app/api/follows/route.ts
  - app/api/notifications/route.ts
  - app/api/release-comments/route.ts
  - app/api/wall/route.ts
  - app/u/[handle]/page.tsx
  - components/nav/NotificationBell.tsx
  - components/nav/NotificationPanel.tsx
  - components/profile/ConnectButton.tsx
  - components/profile/ProfileView.tsx
  - lib/notifications/index.ts
  - lib/social/connections.ts
  - lib/social/notifications.ts
  - supabase/migrations/044_connections_note.sql
  - types/index.ts
findings:
  critical: 3
  warning: 9
  info: 4
  total: 16
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-07-12
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

The connect/respond/withdraw state machine, RLS delegation, actor-identity derivation, and the auto-follow-seed trigger are all implemented correctly and match this phase's documented invariants: notifications are emitted after the primary mutation inside `try/catch`, the DB trigger (not the API route) seeds both follow directions on accept, actor identity is always resolved server-side from `auth.uid()` (never trusted from client input), and the unread badge is generally sourced from a fresh `COUNT` query. On top of that solid foundation, this review found a genuine correctness gap in the connection-request notification lifecycle (inline Accept/Decline notifications are never resolved server-side, so they can resurface and duplicate), a direct violation of the "fresh COUNT only" badge invariant in the mark-all-read path, an unescaped-HTML injection point in the shared email-notification helper, a missing `pending`-only guard on the accept/decline transition that allows duplicate notifications on repeat clicks, and a handful of smaller consistency/content/robustness gaps.

## Critical Issues

### CR-01: connection_request notifications are never resolved server-side after Accept/Decline

**File:** `app/api/connections/route.ts:97-160`, `components/nav/NotificationPanel.tsx:172-199`
**Issue:** When a user accepts or declines a connection request via the notification panel's inline buttons, `NotificationPanel.respond()` only mutates its own local component state (`{ ...n, type: '__resolved__', title: resolvedTitle, read: true }`, line 190) — it never tells the server to mark the underlying `connection_request` notification row read/resolved. `PATCH /api/connections` (the endpoint `respond()` calls) only updates the `connections` row; it never touches `notifications`.

Consequences:
1. The row's `read` flag in the database is untouched, so a fresh `GET /api/notifications` (panel remount, page reload, another tab/device) shows the *same* `connection_request` notification again with live Accept/Decline buttons — even though the connection has already left `pending`. Clicking them again now 404s (the connection row no longer matches the RLS-gated transition), surfacing as a silently-swallowed failure per the `catch { /* leave inline actions in place for a retry */ }` block — an unrecoverable retry loop for the user.
2. Because `read` never flips for this row, the unread head-count returned by `GET /api/notifications` (the bell badge's only source of truth) never decrements for this item — the badge stays inflated by at least 1 until the user hits "Mark all read," which also clears every *other* unread notification as collateral.

**Fix:** After a successful accept/decline transition, mark the originating `connection_request` notification read, scoped by `data->>'connectionId'` and the responder's `user_id`:
```ts
if (target === 'accepted' || target === 'declined') {
  try {
    const service = createServiceClient()
    await service
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id) // the responder is always the addressee here
      .eq('type', 'connection_request')
      .eq('data->>connectionId', connectionId)
  } catch {
    // non-fatal
  }
}
```

### CR-02: `onMarkedAllRead` sets the unread badge from a hardcoded value, not a fresh COUNT query

**File:** `components/nav/NotificationBell.tsx:111-125` (specifically line 115: `onMarkedAllRead={() => setUnreadCount(0)}`)
**Issue:** This phase's own stated invariant (and this file's own header comment, lines 12-13) is that the unread count is "ONLY ever set from a fresh COUNT fetch, never a client-side increment." `onMarkedAllRead` violates this directly by hardcoding `setUnreadCount(0)` instead of re-querying. The mark-all-read PATCH only marks rows unread *at the moment of the request*; if a new notification lands in the window between that PATCH firing and its response resolving (e.g., a Realtime `INSERT` for a wall post arriving at that exact moment), this hardcoded `0` clobbers the correct, non-zero count until the next 25s poll or another Realtime event happens to correct it. The sibling callback `onRespondedToRequest` (lines 116-123) does this correctly via a fresh fetch — `onMarkedAllRead` should follow the same pattern.
**Fix:**
```tsx
onMarkedAllRead={() => {
  fetch('/api/notifications?unread=true')
    .then(r => (r.ok ? r.json() : null))
    .then(json => {
      if (json && typeof json.unreadCount === 'number') setUnreadCount(json.unreadCount)
    })
    .catch(() => {})
}}
```

### CR-03: Unescaped user-controlled content injected into outbound notification email HTML

**File:** `lib/notifications/index.ts:29-38`
**Issue:**
```ts
const linkHtml = args.link ? `<p><a href="${appUrl}${args.link}">Open in Funūn →</a></p>` : ''
const res = await sendEmail({
  to: args.email,
  subject: args.title,
  html: `<h2>${args.title}</h2>${args.body ? `<p>${args.body}</p>` : ''}${linkHtml}`,
  ...
})
```
`args.title` and `args.body` are built by the `lib/social/notifications.ts` builders directly from attacker-controllable data: `actorName` (a user's `artist_name`, freely editable), a connection request's `note` (up to 200 chars of arbitrary text, becomes `body`), and a release's title (becomes part of the `release_comment` title). None of the phase-10 routes currently pass `sendEmailCopy: true`, so this exact path isn't triggered by the code reviewed here — but `createNotification` is shared, generic infrastructure explicitly intended for other callers too (its own doc comment references "the matching engine and apply flow," and the catalog already lists `antenna_match`/`application_received`). Any current or future caller that enables `sendEmailCopy` inherits this with zero mitigation: a member who sets their display name to `<img src=x onerror=...>` or embeds an anchor tag would have that markup rendered verbatim in another member's inbox HTML — HTML/link injection in a Funūn-branded transactional email, and a plausible stored-XSS vector depending on the recipient's mail client.
**Fix:** HTML-escape every interpolated value before templating:
```ts
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const html = `<h2>${esc(args.title)}</h2>${args.body ? `<p>${esc(args.body)}</p>` : ''}${linkHtml}`
```
(The `text:` variant needs no change — it's plain text.)

## Warnings

### WR-01: Wall posts have no self-post guard or self-notification suppression

**File:** `app/api/wall/route.ts:10-60`, `app/u/[handle]/page.tsx:234`
**Issue:** Every other cross-user action in this phase either blocks self-targeting outright (`connections`, `endorsements`, `follows` all 400 on `user.id === targetId`) or explicitly suppresses the notification when the actor is the recipient (`release-comments`: `if (project && project.user_id !== user.id)`). `wall` does neither: `POST /api/wall` never checks `profileId !== user.id`, and `wall.canPost` in the profile page is `Boolean(viewerId)` with no exclusion for the owner viewing their own page. A user posting to their own wall triggers `buildWallPostNotification` with `recipientId === actorId`, producing a "You posted on your wall" self-notification.
**Fix:** Suppress the notification for self-posts, consistent with the release-comments precedent:
```ts
if (profileId !== user.id) {
  // existing notify block
}
```

### WR-02: `createNotification` swallows database errors instead of surfacing them

**File:** `lib/notifications/index.ts:42-56`
**Issue:** `createNotification` returns `{ ok: !error, error: error?.message }` but never throws, and every call site in this phase does `await createNotification(service, notif)` without inspecting the return value. Combined with the outer `try { } catch { /* non-fatal */ }` wrapper at each call site (which only catches thrown exceptions), a failed insert — a CHECK violation, a bad FK, a service-role grant misconfiguration — is completely invisible: no throw, no log, no consumer check. This contradicts the project's stated error-handling convention ("No silent failures — functions either complete successfully or throw").
**Fix:** Throw inside `createNotification` on a DB error so the existing best-effort `try/catch` at each call site (the established pattern elsewhere in this codebase) actually catches it:
```ts
const { error } = await service.from('notifications').insert({...})
if (error) throw new Error(`Failed to create notification: ${error.message}`)
return { ok: true }
```

### WR-03: Notification deep-links break when the actor/owner has no `handle` set

**File:** `lib/social/notifications.ts:63,86,107,127,147`
**Issue:** `handle` is nullable on `ArtistProfile` (`types/index.ts:387`), and every call site resolves it defensively with `?? ''` (e.g., `app/api/follows/route.ts:47`, `app/api/wall/route.ts:52`, `app/api/endorsements/route.ts:56`, `app/api/connections/route.ts:33`). None of the five link-bearing builders (`buildNewFollowerNotification`, `buildConnectionRequestNotification`, `buildConnectionAcceptedNotification`, `buildWallPostNotification`, `buildEndorsementNotification`) guard against an empty handle, so a member without a public handle produces dead links like `/u/` or `/u/#wall` for every notification about them.
**Fix:** Return `link: null` when the handle is empty so the panel renders a non-clickable row instead of navigating to a dead route:
```ts
link: args.actorHandle ? `/u/${args.actorHandle}` : null,
```

### WR-04: `GET /api/notifications` ignores the `unread=true` query parameter its own callers rely on

**File:** `app/api/notifications/route.ts:14-44`, `components/nav/NotificationBell.tsx:29,52,117`
**Issue:** `NotificationBell` calls `fetch('/api/notifications?unread=true')` on every 25-second poll tick, every Realtime `INSERT`, and every respond-callback, apparently expecting a lightweight count-only response. The route never reads or branches on `unread`; it always runs the full `select('*').limit(20)` page query in addition to the count query, and the bell discards everything except `json.unreadCount`. The badge value itself is still correct (not a functional bug for the number shown), but this is a client/server contract mismatch: it implies an optimization that doesn't exist, and it means a globally-mounted, always-active component unconditionally fetches a full page of notification rows (title/body/actor snapshot for up to 20 items) purely to read one integer, on every poll tick and Realtime event, multiplied across open tabs.
**Fix:** Honor the flag server-side:
```ts
const unreadOnly = new URL(request.url).searchParams.get('unread') === 'true'
if (unreadOnly) {
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false)
  return NextResponse.json({ data: [], unreadCount: count ?? 0 })
}
```

### WR-05: Notification cursor pagination has no tiebreaker for same-timestamp rows

**File:** `app/api/notifications/route.ts:25-31`
**Issue:** The `before=<created_at>` cursor pagination orders and filters purely by `created_at` (`order('created_at', { ascending: false })` / `.lt('created_at', before)`). If two notifications share an identical timestamp (realistic under concurrent writes — e.g., several `createNotification` calls firing within the same request, or a burst of activity), a page boundary landing exactly on that timestamp can silently skip sibling rows the client hasn't seen yet, since `lt` excludes everything at the boundary value.
**Fix:** Add `id` as a secondary sort/tiebreaker and encode both values in the cursor (a compound `(created_at, id)` keyset comparison) instead of a bare `lt` on `created_at` alone.

### WR-06: `release_comments` doesn't validate `parentId` belongs to the same `projectId`

**File:** `app/api/release-comments/route.ts:13-33`
**Issue:** `POST /api/release-comments` accepts a client-supplied `parentId` and inserts it verbatim (`parent_id: parentId ?? null`) without checking that the referenced parent comment's `project_id` matches the request's `projectId`. A caller can reply to a comment on release A while posting the reply under release B's `project_id`, creating a comment thread whose `parent_id` points across projects — a straightforward data-integrity gap that will render incorrectly (or not at all) anywhere `ReleaseComments` groups by project.
**Fix:**
```ts
if (parentId) {
  const { data: parent } = await supabase.from('release_comments').select('project_id').eq('id', parentId).maybeSingle()
  if (!parent || parent.project_id !== projectId) {
    return NextResponse.json({ error: 'Invalid parent comment' }, { status: 400 })
  }
}
```

### WR-07: `release_comment` notification title claims a track was commented on, but is passed the project/release title

**File:** `app/api/release-comments/route.ts:55-62`, `lib/social/notifications.ts:156-173`
**Issue:** `buildReleaseCommentNotification` names its parameter `trackTitle` and renders `${actorName} commented on "${trackTitle}"`, but the route passes `project.title` — the release/project title from `vault_projects`, not a specific track. Comments in this phase are attached to the release/project (`projectId`), not to an individual track, so the copy actively misdescribes what was commented on, and the parameter name is misleading for future maintainers.
**Fix:** Rename the parameter to `releaseTitle` and adjust the copy (`commented on your release "${releaseTitle}"`), keeping the route's existing `project.title` input.

### WR-08: Duplicate/re-request connect surfaces a raw Postgres constraint error as an opaque 500

**File:** `app/api/connections/route.ts:67-72`
**Issue:** The INSERT into `connections` can fail on a pre-existing pending/accepted pair (unique index) or the `no_block()` check. Any error is returned as `{ error: error.message }` with status 500 — a raw Postgres message (e.g., `duplicate key value violates unique constraint "…"`) surfaced straight to the client. Given `ConnectButton`'s optimistic UI (sets `pending_out` before `router.refresh()` confirms), a double-submit or stale-client-state Connect click is a realistic path to hitting this.
**Fix:** Detect the unique-violation case and map it to a friendly 409:
```ts
if (error) {
  if (error.code === '23505') {
    return NextResponse.json({ error: 'A connection request already exists.' }, { status: 409 })
  }
  return NextResponse.json({ error: 'Could not send the request.' }, { status: 500 })
}
```

### WR-09: Accept/decline transition isn't scoped to `status = 'pending'`, allowing a repeat click to re-fire the accepted notification

**File:** `app/api/connections/route.ts:126-159`, `supabase/migrations/044_connections_note.sql:66`
**Issue:** The PATCH handler does `.update({ status: target }).eq('id', connectionId)` with no `status = 'pending'` guard in the query itself — it relies entirely on RLS to gate *who* may transition, but not *from what state*. If the addressee's client double-submits an accept (or a stale panel/button is clicked again after already accepting), the UPDATE still matches an already-`accepted` row (RLS permits the addressee to write `status`), re-sets it to `accepted`, and the route proceeds to fire a **second** `connection_accepted` notification to the requester. The DB trigger already guards against this correctly for follow-seeding (`IF NEW.status = 'accepted' AND OLD.status = 'pending'`), but the API route has no equivalent guard for the notification it sends.
**Fix:** Scope the UPDATE to pending rows only, so a repeat transition returns 404 instead of re-firing:
```ts
.update({ status: target })
.eq('id', connectionId)
.eq('status', 'pending')
.select('id, requester_id, addressee_id')
.maybeSingle()
```

## Info

### IN-01: Inconsistent defense-in-depth pattern across DELETE handlers

**File:** `app/api/endorsements/route.ts:78-83` vs. `app/api/wall/route.ts:75-77`, `app/api/release-comments/route.ts:84-85`
**Issue:** `endorsements` DELETE explicitly scopes the delete with `.eq('author_id', user.id)` in addition to RLS, while `wall_posts` and `release_comments` DELETE rely solely on RLS (with a comment noting so). Both are individually defensible, but the inconsistency across three near-identical handlers in the same phase is worth reconciling — a future reader may reasonably wonder whether the omission elsewhere is intentional.
**Fix:** Apply one convention uniformly across all three DELETE handlers.

### IN-02: `search_vector` (and other non-rendered internal columns) selected into the public profile projection

**File:** `app/u/[handle]/page.tsx:146-148`
**Issue:** The comment states the SELECT list must stay identical to migration 040's GRANT SELECT list, but the projection includes `search_vector` — an internal tsvector index column with no display purpose anywhere in `buildProfileData()`/`ProfileView`. RLS/GRANT still gate exposure, so this isn't a proven leak, but selecting and shipping an internal indexing column into a page payload that never renders it is unnecessary surface area on a public route.
**Fix:** Drop `search_vector` (and any other column the view never reads) from the explicit SELECT list.

### IN-03: `NotificationPanel.respond()` overwrites `type` with an untyped magic sentinel

**File:** `components/nav/NotificationPanel.tsx:190`
**Issue:** Resolved rows are marked via `{ ...x, type: '__resolved__', ... }` — a string not present in `NOTIFICATION_TYPES`. `rowInlineAction`/`iconFor` happen to fall back safely today (`meta?.inlineAction`, `meta?.icon ?? 'bell'`), but this is a magic string smuggled into the `Notification['type']` field rather than a proper, typed "resolved" flag, and any future strict lookup against `NOTIFICATION_TYPES` that isn't null-guarded would break on it.
**Fix:** Track resolved state separately, e.g., a local `resolvedIds: Set<string>` alongside `items`, rather than mutating `type`.

### IN-04: Raw PostgREST `.or()` filter string built via template interpolation

**File:** `app/u/[handle]/page.tsx:205-207`
**Issue:** The connect-state query interpolates `viewerId` and `profile.id` into a raw `.or('and(requester_id.eq.<id>,…)')` string. Both values are currently server-derived UUIDs (from `auth.getUser()` and a `handle` lookup), so this isn't exploitable today, and `connections_select_participant` RLS is the real boundary regardless of what the filter matches. Flagging only as a defense-in-depth note: raw filter-string interpolation is a pattern that becomes dangerous the moment a less-trusted or non-UUID value is substituted into it later.
**Fix:** No change required now; if either value's provenance changes, validate it is a well-formed UUID before interpolating.

---

_Reviewed: 2026-07-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
