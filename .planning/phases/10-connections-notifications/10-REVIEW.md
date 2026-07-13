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
  critical: 1
  warning: 6
  info: 4
  total: 11
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-07-12
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Reviewed the connections + notifications phase against its documented invariants (RLS as primary boundary, best-effort notification emission, server-derived actor identity, DB-trigger-owned auto-follow seed, fresh-COUNT badge, stable Realtime channel). The documented invariants are largely well-honored: notifications are correctly emitted after the primary mutation inside try/catch, the connect-accept follows are seeded by the trigger (not the route), actor identity is always resolved server-side from `auth.uid()`, and the badge count comes from a fresh COUNT query.

However, there is one Critical stored-XSS/HTML-injection vector in the notification email path, plus several correctness and robustness warnings — most notably a client/server contract mismatch on the notification GET query parameter, a mislabeled release-comment notification title, and a connect-request duplicate/re-request path that surfaces a raw DB constraint error to the user.

## Critical Issues

### CR-01: HTML injection into notification emails (stored XSS in email client)

**File:** `lib/notifications/index.ts:30-38`
**Issue:** `createNotification()` interpolates `args.title`, `args.body`, and `args.link` directly into an HTML email string with no escaping:
```ts
html: `<h2>${args.title}</h2>${args.body ? `<p>${args.body}</p>` : ''}${linkHtml}`,
```
Several of these values are attacker-controlled and flow through unsanitized:
- `connection_request` sets `body` to the requester's free-text `note` (up to 200 chars, arbitrary content).
- `release_comment` / `wall_post` / `endorsement` titles embed `actorName` (the actor's `artist_name`, user-controlled).
- The `note` and `actorName` reach `buildConnectionRequestNotification()` / `buildReleaseCommentNotification()` and then this HTML template verbatim.

A note like `<img src=x onerror=...>` or `</h2><script>...` is rendered into the recipient's email HTML. Even where email clients strip scripts, this allows link/markup injection (phishing anchors, hidden content) into a Funūn-branded transactional email. The `appUrl${args.link}` interpolation is also unescaped, though `link` is currently server-built.

**Fix:** HTML-escape every interpolated value before templating. Add a small escaper and apply it to `title`, `body`, and the href/text:
```ts
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const safeTitle = esc(args.title)
const safeBody = args.body ? esc(args.body) : ''
const href = `${appUrl}${args.link ?? ''}`
const linkHtml = args.link
  ? `<p><a href="${esc(href)}">Open in Funūn →</a></p>`
  : ''
const html = `<h2>${safeTitle}</h2>${safeBody ? `<p>${safeBody}</p>` : ''}${linkHtml}`
```
(The `text:` variant is fine as-is since it is plain text.)

## Warnings

### WR-01: Notification GET ignores `unread=true`; NotificationBell fetches a full 20-row page every 25s and on every Realtime INSERT

**File:** `components/nav/NotificationBell.tsx:29,52,117` and `app/api/notifications/route.ts:14-43`
**Issue:** The bell polls `GET /api/notifications?unread=true` (three call sites) expecting a cheap count-only response, but the GET handler never reads an `unread` param. It always runs the full `select('*')` page query **plus** the count query. So every 25-second poll, every Realtime INSERT, and every respond-callback triggers a full 20-row `SELECT *` for data the bell discards (it only reads `json.unreadCount`). This is wasted work on a global, always-mounted component and multiplies with open tabs. It is also a latent correctness trap: a future reader may assume `?unread=true` is honored server-side.
**Fix:** Honor the flag in the GET route — when `unread=true` (or a dedicated `count=true`), skip the page query and return only `{ unreadCount }`:
```ts
const url = new URL(request.url)
if (url.searchParams.get('unread') === 'true') {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('read', false)
  return NextResponse.json({ data: [], unreadCount: count ?? 0 })
}
```

### WR-02: release_comment notification title says "commented on \"<title>\"" but is passed the *project* title, not a track title

**File:** `app/api/release-comments/route.ts:60-61`, `lib/social/notifications.ts:156-173`
**Issue:** `buildReleaseCommentNotification` names its input `trackTitle` and renders `commented on "${trackTitle}"`, but the route passes `project.title` (the release/project title from `vault_projects`). The comment is on a release, not a track — the parameter name is misleading and the copy claims a track was commented on. If a release has multiple tracks this is actively wrong-sounding. Not a crash, but user-facing incorrect content and a maintenance trap.
**Fix:** Rename the builder param to `releaseTitle` and adjust copy to `commented on your release "${releaseTitle}"` (or keep "commented on \"…\"" but rename the param for honesty). Keep the route passing `project.title`.

### WR-03: Duplicate / re-request connect surfaces a raw Postgres unique-constraint error as a 500

**File:** `app/api/connections/route.ts:67-72`
**Issue:** The INSERT into `connections` can fail on the partial unique index (an existing pending/accepted pair) or the `no_block()` check. On any error the route returns `error.message` with status 500. A user clicking Connect when a request already exists (e.g., stale client state, double-submit) gets a raw DB message (`duplicate key value violates unique constraint "…"`) and a 500, rather than a friendly 4xx. The ProfileView optimistic path (`ConnectButton` sets `pending_out` then `router.refresh()`) makes double-submits plausible.
**Fix:** Detect the unique-violation / block cases and map to a 409/400 with a user-friendly message, e.g.:
```ts
if (error) {
  if (error.code === '23505')
    return NextResponse.json({ error: 'A connection request already exists.' }, { status: 409 })
  return NextResponse.json({ error: 'Could not send the request.' }, { status: 500 })
}
```
Avoid returning raw `error.message` to the client on the generic path.

### WR-04: PATCH accept can no-op silently if the row was already accepted, still returning success

**File:** `app/api/connections/route.ts:126-159`, `supabase/migrations/044_connections_note.sql:66`
**Issue:** The PATCH does `.update({ status: target }).eq('id', connectionId)` with no `status = 'pending'` guard in the query. RLS gates *who* may transition, but if the addressee accepts an already-`accepted` row (double-click, stale UI), the UPDATE still matches (RLS allows the addressee), sets status to `accepted` again, and returns `{ ok: true, status: 'accepted' }` — firing a **second** `connection_accepted` notification to the requester. The trigger's `OLD.status = 'pending'` guard correctly suppresses duplicate follow-seeding, but the notification emission in the route has no equivalent guard, so the requester can receive duplicate "accepted your request" notifications.
**Fix:** Scope the UPDATE to only pending rows and rely on `updated` being null to short-circuit:
```ts
.update({ status: target })
.eq('id', connectionId)
.eq('status', 'pending')
.select('id, requester_id, addressee_id')
.maybeSingle()
```
Then a repeat accept returns 404 and fires no second notification, matching the trigger's semantics.

### WR-05: `initials()` throws on an empty/space-only name

**File:** `components/profile/ProfileView.tsx:75-77`
**Issue:** `name.split(' ').map(w => w[0])` — if a name token is an empty string (e.g., `name === ''` or a name with leading/trailing/multiple spaces), `w[0]` is `undefined`, and `.join('')` silently drops it, but a fully empty `name` yields `''.split(' ') === ['']`, `w[0]` is `undefined` → `.toUpperCase()` on `''` is fine, so no throw there. However this renders an empty avatar circle with no fallback glyph. More importantly `data.name` is derived from profile data and the header avatar (line 185) and body avatar (line 208) both call `initials(data.name)` unconditionally. An empty name produces a blank badge rather than a sensible placeholder.
**Fix:** Guard the helper: `const parts = name.trim().split(/\s+/).filter(Boolean); if (!parts.length) return '?'`.

### WR-06: `avatar_url` and other private-ish columns selected in the public profile projection

**File:** `app/u/[handle]/page.tsx:146-148`
**Issue:** The comment asserts the SELECT list must "stay identical to migration 040's GRANT SELECT list," but the projection includes `search_vector` (an internal tsvector index column with no display purpose) and other fields. Selecting `search_vector` into a public page payload is dead/unnecessary data at best; at worst it widens the public column surface beyond what the page renders. This is a maintainability/least-exposure concern rather than a proven leak (RLS/GRANT still gates it), but the explicit list should not carry columns the view never reads.
**Fix:** Drop `search_vector` (and any other non-rendered internal column) from the SELECT; keep the projection to exactly the fields `buildProfileData()` / `ProfileView` consume.

## Info

### IN-01: `badgeLabel` caps at "9+" for 10+, but comment/convention mismatch

**File:** `components/nav/NotificationBell.tsx:77`
**Issue:** `unreadCount >= 10 ? '9+'` shows "9+" for 10 or more and the exact number for 1–9. This is fine, but the more conventional cap is "9+" for anything over 9 displaying with the true digit up to 9 — which this does. No bug; flagging only because the `9+` string with a `>= 10` threshold reads slightly off (10 shown as "9+"). Consider `> 99 ? '99+'` style if higher counts are expected.
**Fix:** Optional — leave as-is or switch to a `99+` cap.

### IN-02: Empty-string handle fallback produces broken deep links

**File:** `app/api/follows/route.ts:47`, `app/api/wall/route.ts:52`, `app/api/endorsements/route.ts:56`, `app/api/connections/route.ts:33`
**Issue:** When an actor/owner profile row is missing a `handle`, the builders receive `''`, producing links like `/u/#wall` or `/u/` for `new_follower`. The notification still stores, but the deep link is dead. Low impact (handles are effectively required), but worth a defensive skip or a fallback to the profile id route if one exists.
**Fix:** If `handle` is empty, either omit `link` or fall back to a stable id-based route.

### IN-03: `respond()` in NotificationPanel mutates the row to a synthetic `type: '__resolved__'`

**File:** `components/nav/NotificationPanel.tsx:190`, `206-208`
**Issue:** Using a magic sentinel `'__resolved__'` type that isn't in `NOTIFICATION_TYPES` works because `rowInlineAction`/`iconFor` fall back safely, but it's an untyped magic string embedded in the `Notification['type']` field. A future `NOTIFICATION_TYPES` lookup that isn't null-guarded could break on it.
**Fix:** Track resolved state with a separate local set/flag (e.g., `resolvedIds: Set<string>`) rather than overwriting `type`.

### IN-04: `.or()` filter interpolates ids into a raw PostgREST filter string

**File:** `app/u/[handle]/page.tsx:205-207`
**Issue:** The connect-state query interpolates `viewerId` and `profile.id` into a raw `.or('and(requester_id.eq.<id>,…)')` string. Both values are server-derived UUIDs (from `auth.getUser()` and a `handle` lookup), so this is not currently injectable, and RLS (`connections_select_participant`) is the real boundary. Flagging as defense-in-depth: raw filter-string interpolation is a pattern that becomes dangerous the moment a non-UUID or client-influenced value is substituted.
**Fix:** No change required now; if either value ever becomes less trusted, validate it is a UUID before interpolation.

---

_Reviewed: 2026-07-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
