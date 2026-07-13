# Phase 10: Connections & Notifications - Research

**Researched:** 2026-07-12
**Domain:** Supabase Realtime subscriptions, Postgres RLS state machines, Next.js API route patterns (this codebase's own conventions)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Three buttons are always visible on a profile: Connect, Follow, Message (not two, not Connect folded into a menu). This is net-new UI — the design bundle only has Follow + Message; Connect needs first design during `/gsd-ui-phase`.
- **D-02:** Connect button states: `Connect → Pending → Connected`. If the *other* person sent the request (i.e. viewer is the addressee), the profile shows inline Accept/Decline buttons instead of a plain Connect button — no need to leave the profile to respond to an incoming request encountered while browsing.
- **D-03:** The `Pending` state is clickable to withdraw the request, resetting the button back to `Connect`. Backed directly by the `connections.status = 'withdrawn'` transition already defined in migration 035 (`connections_update_requester_withdraw` policy).
- **D-04:** Connect requests support an optional short note (~200 char cap), shown to the addressee alongside Accept/Decline. Schema gap: migration 035's `connections` table has no note/message column — Phase 10 needs a small additive migration (e.g. `ALTER TABLE connections ADD COLUMN note TEXT`) plus a length CHECK constraint.
- **D-05:** Accepting a Connect request auto-creates a mutual Follow both ways (connection implies follow — seeded on accept, not continuously enforced).
- **D-06:** After that seed, Follow and Connect are independent — either party can unfollow later while remaining connected. No UI restriction on unfollowing a connection.
- **D-07:** If/when a "remove connection" (disconnect) action is built, it does not remove the follow relationship — follow persists regardless of connection state. Disconnect itself is not a Phase 10 requirement; this decision is forward-looking for whichever phase adds it (likely Phase 13).
- **D-08:** The panel is a dropdown anchored to the bell icon (not a dedicated `/notifications` page) — a floating panel pattern similar in spirit to `DmWidget`'s fixed bottom-panel, but anchored top-right near the bell instead of bottom-right.
- **D-09:** The unread badge clears only on an explicit "mark all read" click — opening the dropdown does NOT auto-clear it. Matches NOTIF-03's literal wording.
- **D-10:** Connection-request notifications get inline Accept/Decline buttons directly on the notification row in the panel — the panel calls the connect-respond API and updates state in place; no click-through to the requester's profile required to act on a request.
- **D-11:** The panel shows a recent window (~20) with "load more"/scroll-to-load for older notifications — real pagination, not a hard cutoff. Older notifications remain queryable in the DB even before pagination UI is built out further.
- **D-12:** Reuse the Realtime + slow-poll-fallback pattern already proven in `components/profile/DmWidget.tsx` — subscribe to Supabase Realtime `INSERT` events on `notifications` (already added to `supabase_realtime` publication by migration 036) for instant badge updates, with a ~20-30s poll as reconcile/fallback.
- **D-13:** Unlike `DmWidget` (which only subscribes while its panel is open), the bell's realtime subscription is global — active wherever the topbar renders, not gated to the dropdown being open. The badge must stay live across the whole app since the bell itself is always visible in the topbar.

### Claude's Discretion
- Exact shape of the notification-type catalog/discriminated union so Phase 11 can add `message_request`/`new_dm` types later without touching the panel's rendering logic.
- Where the global realtime subscription for the bell badge should live architecturally (e.g. a shared layout-level hook/provider vs. duplicated per route group) — implementation detail, not a product decision.
- Exact column/constraint shape for the new `connections.note` field (D-04) — e.g. `TEXT` with a `CHECK (char_length(note) <= 200)` vs. `VARCHAR(200)` — standard SQL choice, no product implication either way.
- Per-notification-type deep-link targets (e.g. does "wall post received" link to the wall post itself vs. the profile's wall tab) — follow existing `link` column convention from migration 009, planner's call per type.
- Icon/visual treatment differentiating notification types in the panel (new follower vs. connection request vs. endorsement, etc.) — UI polish, resolved during `/gsd-ui-phase`.

### Deferred Ideas (OUT OF SCOPE)
- Dedicated "Requests" list/tab for incoming connection requests — considered implicitly during D-10's discussion but not chosen; requests surface via the profile (D-02) and notification panel (D-10) instead. Could resurface later if request volume grows enough that the notification panel feels insufficient.
- Disconnect / remove-connection action — not in Phase 10's mapped requirements; D-07 only pre-decided its interaction with follow state for whenever it is built (likely Phase 13, Trust & Safety).
- Full notification history page — D-11 chose recent-window + load-more over a full paginated archive view; a dedicated history page is not ruled out for later but isn't Phase 10 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONNECT-01 | User can follow another member (one-way, no approval required) | `follows` table/API already work end-to-end (Phase 8/pre-existing); this phase only adds the `createNotification()` call — see Pattern 1/2, Code Examples |
| CONNECT-02 | User can send a Connect request to another member; recipient can accept or decline, establishing a mutual connection | `connections` state machine fully specified by migration 035; new `note` column + `no_block()` gap addressed in Architecture Patterns/Pitfall 2; auto-follow-on-accept mechanics in Pitfall 1 |
| NOTIF-01 | User receives a notification for: new follower, connection request, connection accepted, message request, new DM, release comment, endorsement received, and wall post received | This phase covers 6 of 8 types (new follower, connection request, connection accepted, release comment, endorsement received, wall post received); message request/new DM are Phase 11 — extensible type catalog in Pattern 3 |
| NOTIF-02 | User sees an unread count badge on the notifications bell, separate from an unread count badge on the messages icon | Unread-count-via-COUNT (never cached) requirement verified still true against live schema — see Anti-Patterns and Validation Architecture |
| NOTIF-03 | User can view a notification list/panel and mark all as read | D-08/D-09/D-11 fully specify panel behavior; System Architecture Diagram + Recommended Project Structure show the panel's API surface |
</phase_requirements>

## Summary

This phase is almost entirely **wiring**, not new infrastructure. Every table (`connections`, `blocks`, `notifications` + actor-snapshot columns, realtime publication) already exists and is live on the remote database (Phase 8, migrations 034-040, confirmed pushed per STATE.md). `lib/notifications/index.ts`'s `createNotification()` helper is already proven in production code paths (Antenna matching engine, opportunity-apply flow) and needs no modification — it is called from a `try/catch` at each call site (matching this codebase's established best-effort side-effect convention, see `lib/social/activity-emit.ts` and `app/api/antenna/opportunities/[id]/apply/route.ts`), so no changes to the helper itself are needed to make it "safe" to call from eight new trigger points.

The two genuinely new pieces of engineering are: (1) the Connect request/accept/decline/withdraw state machine's **auto-follow side effect** (D-05) — accepting a connection must create two `follows` rows, one of which the accepting user's own RLS-scoped session cannot legally insert (see Pitfall 1, this is the single highest-value finding in this research), and (2) the notification bell + dropdown panel, which has **zero code precedent** anywhere in the app — there is no topbar component in the authenticated shell at all today, only a left sidebar (`ArtistNav`). The design bundle's bell icon lives on the *public* profile page's own self-contained top bar, which its own CSS comment says "overrides the app shell" — it is not the authenticated app's topbar, because the authenticated app currently has no topbar.

**Primary recommendation:** Implement the connections state machine and notification trigger wiring as thin additions to existing/sibling files (`app/api/connections/route.ts` alongside `app/api/follows/route.ts`; `lib/social/connections.ts` alongside `lib/social/wall.ts`), use a Postgres trigger (not application code) for the accept→auto-follow seed to keep it atomic and RLS-safe, and add a new lightweight header row to `app/(artist)/layout.tsx` (the single unified layout that now serves every authenticated route post-Phase-15) to host `<NotificationBell />` — this satisfies D-13's "wherever the topbar renders" requirement without inventing a second layout, since `(industry)/layout.tsx` no longer exists (Phase 15 unified nav).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Follow / unfollow | API/Backend | Database/Storage (RLS) | `app/api/follows/route.ts` mutates via session-bound client; RLS enforces ownership |
| Connect request/accept/decline/withdraw | API/Backend | Database/Storage (RLS + trigger) | New `app/api/connections/route.ts`-style handlers; state transitions gated by migration 035's two-policy UPDATE split |
| Auto-follow seed on connect-accept (D-05) | Database/Storage | — | Must be a DB trigger (SECURITY DEFINER) or service-role write — the accepting user's own RLS session cannot insert the reverse-direction follow row (Pitfall 1) |
| `createNotification()` trigger wiring (8 event types) | API/Backend | — | Added as a side effect inside existing/new mutation routes (`follows`, `wall`, `endorsements`, `release-comments`, new `connections`), using the service-role client already required by the helper |
| Notification bell + unread badge | Browser/Client | API/Backend (COUNT query) | Client component subscribes to Realtime + polls; unread count computed server-side per D-12/STATE.md ("never a cached counter") |
| Notification dropdown panel (list, mark-all-read, inline accept/decline) | Browser/Client | API/Backend | Panel fetches a page of notifications via API route; mutations (mark-read, respond-to-request) call back into `connections`/`notifications` API routes |
| `connections.note` column | Database/Storage | — | Additive migration; plain column, no new RLS policy needed (existing `connections_insert_own` already covers INSERT of any column) |

## Package Legitimacy Audit

**Not applicable — this phase installs no new external packages.** Every capability (Realtime subscriptions, Postgres triggers, notification delivery) is built on dependencies already in `package.json` (`@supabase/supabase-js`, `@supabase/auth-helpers-nextjs`, `resend` via the existing `lib/email` module). `date-fns` and `lucide-react` were recommended in earlier Wave 4 research but were **never actually added** to `package.json` — confirmed via inspection (`grep` of `dependencies`/`devDependencies` shows neither present). Existing components (`Wall.tsx`, `ReleaseComments.tsx`, `ActivityFeed.tsx`) instead each define their own local `timeAgo()` helper and manual `initials()` helper rather than pulling in a library. **Follow that established convention** for the notification panel — do not introduce `date-fns`/`lucide-react` as a Phase 10 dependency; reuse the inline `timeAgo()` pattern (copy from `components/profile/Wall.tsx` lines 27-34) and this codebase's existing hand-rolled SVG icon convention (`components/nav/icons.tsx`).

## Standard Stack

### Core
No new libraries. This phase is 100% additive code on the existing stack:

| Library | Version (installed) | Purpose | Why Standard (for this phase) |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.45.0 | Realtime channel subscribe (`postgres_changes` INSERT on `notifications`), Postgres client for connection/notification CRUD | Already the only DB/Realtime client in the app |
| `@supabase/auth-helpers-nextjs` | 0.10.0 | `createApiClient()` (route-handler session client), `createServerClient()` (server-component session client) | Existing auth pattern used by every API route in the app |
| `resend` (via `lib/email`) | 4.0.0 | Optional email copy inside `createNotification()` | Already wired; Phase 10 does not need `sendEmailCopy: true` for any of its 8 trigger types (in-app bell only per NOTIF-01/02/03 scope — email digest is NOTIF-04, deferred v1.x) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Postgres trigger for auto-follow seed (D-05) | Service-role insert inside the accept API route | Trigger is atomic with the status UPDATE and fires regardless of caller (defense in depth); service-role insert is simpler to read/test but leaves a window where a direct-PostgREST UPDATE to `status='accepted'` (still possible — UPDATE is column-scoped to `status` for `authenticated`, migration 035) would silently skip the follow-seed. **Recommend the trigger.** |
| Global bell subscription in a new client-side layout wrapper | Duplicating a subscribe effect on every page | A single provider/hook mounted once in `app/(artist)/layout.tsx` (a server component — needs a small client child) avoids N duplicate channels; this is explicitly Claude's discretion per CONTEXT.md D-13 discussion, and the codebase precedent (`DmWidget`) is a per-instance client component, not a provider — Phase 10 should introduce the first shared client provider in `app/(artist)/layout.tsx`'s tree |

**Installation:** None required.

## Architecture Patterns

### System Architecture Diagram

```
 [Member action]                    [DB: RLS-gated mutation]              [DB: trigger / API-layer notify]           [Recipient's browser]
 ─────────────────                  ────────────────────────              ─────────────────────────────────         ──────────────────────
 Follow click        ──POST──▶  app/api/follows/route.ts
                                     upsert(follows)                ──────▶  createNotification(service, 'new_follower')  ─┐
                                                                                                                              │
 Connect click        ──POST──▶  app/api/connections/route.ts
   (request)                        insert(connections, status=pending) ──▶  createNotification(addressee, 'connection_request')
   (accept)                         update(connections, status=accepted)
                                       └─▶ DB TRIGGER: connections_on_accept
                                              insert follows (both directions)  ◀── cannot be done by session client (Pitfall 1)
                                                                              ──▶  createNotification(requester, 'connection_accepted')
   (decline/withdraw)                update(connections, status=X)          (no notification — not in NOTIF-01 list)

 Wall post            ──POST──▶  app/api/wall/route.ts
                                     insert(wall_posts)               ──────▶  createNotification(profile_id, 'wall_post')
 Endorsement           ──POST──▶  app/api/endorsements/route.ts
                                     upsert(endorsements)              ─────▶  createNotification(profile_id, 'endorsement')
 Release comment       ──POST──▶  app/api/release-comments/route.ts
                                     insert(release_comments)          ─────▶  createNotification(project owner, 'release_comment')
                                                                                                                              │
                                                                                                                              ▼
                                                                                            notifications row INSERT ──▶ supabase_realtime
                                                                                            publication (migration 036)
                                                                                                                              │
                                                                              ┌───────────────────────────────────────────────┘
                                                                              ▼
                                                          Global <NotificationBell/> (mounted in app/(artist)/layout.tsx)
                                                            - subscribes postgres_changes INSERT WHERE user_id=eq.<me>
                                                            - ~20-30s poll fallback (D-12, mirrors DmWidget)
                                                            - GET /api/notifications?unread=true → COUNT (never cached, D-STATE.md)
                                                              ▼
                                                          Dropdown panel (D-08/D-09/D-10/D-11)
                                                            - GET /api/notifications?limit=20&before=<cursor>
                                                            - inline Accept/Decline → POST app/api/connections/route.ts
                                                            - "mark all read" → PATCH /api/notifications (explicit click only)
```

### Recommended Project Structure
```
app/api/
├── connections/route.ts       # POST (request), PATCH (accept/decline/withdraw) — sibling to follows/route.ts
├── notifications/route.ts     # GET (list + unread count), PATCH (mark-all-read)
lib/social/
├── connections.ts             # loadConnectionState(), request/respond helpers — mirrors lib/social/wall.ts's loadWall() pattern
├── notifications.ts           # notification type catalog (discriminated union), buildXNotification() pure functions per trigger type
components/
├── nav/
│   ├── NotificationBell.tsx   # client component: realtime + poll + badge, mounted once in ArtistLayout
│   └── NotificationPanel.tsx  # dropdown list, mark-all-read, inline accept/decline row
├── profile/
│   └── ConnectButton.tsx      # Connect/Pending/Connected + inline Accept/Decline states (D-02/D-03), sibling to existing Follow button markup
supabase/migrations/
└── 044_connections_note.sql   # ALTER TABLE connections ADD COLUMN note + CHECK; trigger for D-05 auto-follow seed; no_block() wiring into connections INSERT (Pitfall 2)
```

### Pattern 1: Service-role `createNotification()` call wrapped in try/catch at the call site
**What:** Every existing call site (`lib/matching/run.ts`, `app/api/antenna/opportunities/[id]/apply/route.ts`) wraps `await createNotification(...)` in a `try { } catch { /* non-fatal */ }` block around the notification call (or the whole post-mutation block), never modifying `createNotification()` itself to swallow errors internally.
**When to use:** Every one of the 8 new trigger points in this phase (new follower, connection request, connection accepted, release comment, endorsement received, wall post received — the other 2, message request/new DM, are Phase 11).
**Example:**
```typescript
// Source: app/api/antenna/opportunities/[opportunityId]/apply/route.ts (verified in this codebase)
try {
  await createNotification(service, {
    userId: opportunity.created_by,
    type: 'application_received',
    title: 'New application on your opportunity',
    body: `"${project.title}" applied to ${opportunity.title}.`,
    link: `/opportunities/${opportunityId}`,
    data: { opportunityId, projectId: b.projectId },
  })
} catch {
  // Non-fatal: the application already succeeded.
}
```
This resolves the Open Question CONTEXT.md flagged ("confirm at implementation time whether `createNotification()` needs the same best-effort/swallow-errors wrapping as `emitActivity()`") — **it does not need internal modification**; every new call site follows the wrap-at-call-site pattern instead.

### Pattern 2: Actor-snapshot population from `artist_profiles`
**What:** Every `createNotification()` call in this phase must additionally populate `actor_id`/`actor_name`/`actor_avatar_url` — these columns exist on `notifications` (migration 036) but `createNotification()`'s current signature (`lib/notifications/index.ts`) does **not** accept them; nor does the `Notification` TypeScript type (`types/index.ts` line 672) declare them. Both are gaps this phase must close.
**When to use:** Every new trigger call site.
**Example (verified column names, from `lib/social/wall.ts`'s `loadWall()`):**
```typescript
// artist_profiles columns confirmed by lib/social/wall.ts (NOT display_name — that
// name belongs to a different type in types/index.ts, this is a real footgun)
const { data: actor } = await supabase
  .from('artist_profiles')
  .select('artist_name, avatar_url')
  .eq('id', user.id)
  .single()

await createNotification(service, {
  userId: followeeId,
  type: 'new_follower',
  title: `${actor?.artist_name || 'Someone'} started following you`,
  link: `/u/${actorHandle}`,
  actorId: user.id,            // NEW — extend createNotification()'s args + INSERT
  actorName: actor?.artist_name ?? null,
  actorAvatarUrl: actor?.avatar_url ?? null,
})
```

### Pattern 3: Notification type catalog as a discriminated union (Claude's discretion, CONTEXT.md)
**What:** A single source-of-truth mapping from `notifications.type` (plain `TEXT` column, no DB-level enum) to render metadata (icon, default link builder, whether it supports inline actions), so Phase 11 can add `message_request`/`new_dm` by appending two entries, not touching panel rendering logic.
**When to use:** `lib/social/notifications.ts` (or `types/index.ts` alongside the existing `Notification` type).
**Example:**
```typescript
// lib/social/notifications.ts — extensible catalog, Phase 11 adds two more keys
export const NOTIFICATION_TYPES = {
  new_follower:         { icon: 'user-plus',   inlineAction: null },
  connection_request:   { icon: 'user-plus',   inlineAction: 'connection_respond' },
  connection_accepted:  { icon: 'check',       inlineAction: null },
  wall_post:            { icon: 'message',     inlineAction: null },
  endorsement:          { icon: 'star',        inlineAction: null },
  release_comment:      { icon: 'message',     inlineAction: null },
  antenna_match:        { icon: 'radio',       inlineAction: null }, // pre-existing type, keep in catalog
  application_received: { icon: 'inbox',       inlineAction: null }, // pre-existing type, keep in catalog
  // Phase 11 adds: message_request (inlineAction: 'message_respond'), new_dm
} as const
export type NotificationType = keyof typeof NOTIFICATION_TYPES
```
Keep `type` as a plain `TEXT` column (no DB CHECK/enum) — the existing `notifications` table (migration 009) never constrained `type`, and antenna/application types already exist unconstrained in production. Adding a CHECK now would need a migration touching every future phase; the catalog above provides equivalent safety at the TypeScript layer without a schema lock-in.

### Anti-Patterns to Avoid
- **Re-deriving unread count from client-side state:** STATE.md explicitly records "compute unread via COUNT, never a cached counter that can drift" — confirmed no cached counter exists anywhere in the schema today (`grep -i unread` across the repo returns only the two migration comments/index name, no actual counter column). The bell's badge number must come from a fresh `SELECT count(*) FROM notifications WHERE user_id = auth.uid() AND read = false` (or `.select('id', {count:'exact', head:true})` via supabase-js) on each poll/realtime tick — never incremented/decremented in client state.
- **Gating the bell's Realtime subscription on panel-open state:** `DmWidget.tsx`'s subscribe effect is gated on `if (!open || ...) return` — this is correct for DmWidget (badge doesn't need to be live-tracked while closed, per its own D-3 scope) but D-13 explicitly requires the bell subscription to be **global**, not gated to dropdown-open. Copy DmWidget's channel-lifecycle mechanics, not its `open`-gating condition.
- **Inserting the accept-side follow rows from the client's own session:** see Pitfall 1 below — this is the single most likely implementation mistake in this phase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Realtime delivery of new notifications | A custom polling-only mechanism from scratch | Supabase Realtime `postgres_changes` on `notifications` (already in `supabase_realtime` publication, migration 036) + slow poll as reconcile fallback, mirroring `DmWidget.tsx` | Table already published; this pattern is proven in production (`DmWidget`) |
| Unread badge counting | Maintaining a denormalized `unread_count` column with increment/decrement triggers | Plain `COUNT(*) WHERE read = false` per STATE.md's explicit prior decision | A cached counter drifts under concurrent writes/realtime races; a COUNT query on an indexed `(user_id, read, created_at)` column (already indexed, migration 009 `idx_notifications_user_unread`) is cheap at this scale |
| Bidirectional follow creation on connect-accept | Manually inserting two rows from the API route using the caller's session client | A Postgres trigger (SECURITY DEFINER, mirroring `no_block()`'s existing pattern) OR the service-role client from within the accept route | The caller's session can only insert `follows` where `follower_id = auth.uid()` (RLS) — the reverse-direction row is architecturally impossible from a plain session client; see Pitfall 1 |
| Note-length validation | A new generic "text length" validation library | Postgres `CHECK (note IS NULL OR char_length(note) <= 200)`, mirroring `wall_posts.body CHECK (char_length(body) BETWEEN 1 AND 2000)` and `endorsements.body CHECK (... BETWEEN 1 AND 1000)` (migration 012) | Exact precedent already exists in this schema for capped free-text columns |

**Key insight:** Nothing in this phase needs a new dependency or a novel pattern — every piece has a direct sibling already shipped in this codebase (follows→connections, DmWidget→NotificationBell, wall/endorsements body-length CHECK→note-length CHECK, `no_block()`→ same helper reused). The risk in this phase is *omission* (missing the follow-seed RLS gap, missing the `no_block()` wiring gap, missing the TS type drift) — not invention.

## Common Pitfalls

### Pitfall 1: Accept-side auto-follow seed cannot be written by the accepting user's own session (D-05)
**What goes wrong:** The API route that accepts a Connect request updates `connections.status = 'accepted'` using the caller's own session client (matching the `follows`/`wall`/`endorsements` route convention of *not* using service-role). If that same route then tries to `insert` two `follows` rows using that same session client, the row where `follower_id` = the *other* user's id will be rejected by `follows_insert_own`'s RLS policy (`WITH CHECK (follower_id = auth.uid())`) — the accepting user cannot legally create a row asserting someone else follows them... wait, precisely: the accepting user's session CAN insert `follows(follower_id=self, followee_id=other)` (that's their own follow), but CANNOT insert `follows(follower_id=other, followee_id=self)` (asserting the *other* party follows them) — RLS blocks it outright.
**Why it happens:** `follows_insert_own` (migration 012, still active — migration 038 only *appended* `no_block()`, did not relax the ownership check) requires `follower_id = auth.uid()` with no exception for "as a side effect of an action the other party already consented to."
**How to avoid:** Use a Postgres `AFTER UPDATE ON connections` trigger (`WHEN (NEW.status = 'accepted' AND OLD.status = 'pending')`) that runs `SECURITY DEFINER` and inserts both `follows` rows directly (bypassing RLS the same way `no_block()` bypasses it for cross-party reads). This is also more correct than an API-layer service-role insert because it fires even if the status transition happens through a path other than the planned API route (defense in depth, matching the codebase's existing philosophy of RLS/trigger-level invariants — see migration 034's featured-spotlight integrity trigger for a precedent of exactly this "trigger enforces invariant regardless of caller" pattern).
**Warning signs:** If implemented via API-layer session-client inserts, this will pass every "happy path click Accept" manual test (because the error is swallowed if the follow-insert call isn't checked) but silently produce a broken one-way-only follow relationship after every acceptance — very easy to ship the bug and only discover it much later when someone notices Follow counts don't match Connection counts.

### Pitfall 2: `connections` INSERT is not covered by `no_block()` (D-15 gap)
**What goes wrong:** Migration 038 wired `no_block()` into `follows`, `wall_posts`, `endorsements`, `dm_threads`, and `dm_messages` INSERT policies — but **not** `connections`. Verified by reading migration 038 directly: its policy list is exactly those five, `connections` is absent. Migration 035's `connections_insert_own` policy checks only `requester_id = auth.uid()`.
**Why it happens:** Migration 035 (which created `connections`) predates migration 038 (which did the `no_block()` wiring pass) and was scoped as "create the tables and helper only; wiring is a later plan" per its own header comment — but the "later plan" (038) then enumerated the four *pre-existing* social tables and never came back for `connections`, likely because `connections` didn't exist yet when 038's enumeration was drafted, or was assumed to be Phase 10's own responsibility.
**How to avoid:** Phase 10's new migration (044) should append `AND no_block(auth.uid(), addressee_id)` to `connections_insert_own`'s `WITH CHECK` clause, matching the exact pattern migration 038 used for the other four tables. This is currently inert (blocks table is empty until Phase 13 ships block UI, so zero behavior change today) but closes the gap before Phase 13 ships — otherwise Phase 13's block feature would need its own retrofit migration for `connections` specifically, which is exactly the redundant-work scenario migration 035's header comment says the block-table-early strategy was meant to avoid.
**Warning signs:** A `plan-checker`/security review flagging "why does `connections` not get the same `no_block()` treatment as `follows`" — this is a five-minute additive fix inside the migration this phase is already writing for the `note` column, so there's no reason to defer it.

### Pitfall 3: `Notification` TypeScript type and `createNotification()` signature don't know about actor-snapshot columns
**What goes wrong:** `types/index.ts`'s `Notification` type (line 672) has `id, user_id, type, title, body, link, data, emailed, read, created_at` — no `actor_id`/`actor_name`/`actor_avatar_url`, even though migration 036 added those columns to the live table months ago (schema/type drift, same category of gap Phase 9 hit repeatedly per STATE.md's decision log — e.g. `ArtistProfile.allow_resharing` was similarly missing until 09-04 added it).
**Why it happens:** Migration 036's own header comment says it is "purely additive" at the DB layer and explicitly does not touch GRANT/REVOKE — but nobody updated the corresponding TS type or the `createNotification()` helper's `args` type when the columns were added, because no code consumed them yet (Phase 10 is the first phase to populate them).
**How to avoid:** Add all three fields (`actorId?`, `actorName?`, `actorAvatarUrl?`) to `createNotification()`'s `args` type and its `.insert()` call in `lib/notifications/index.ts`, and extend the `Notification` type in `types/index.ts` in the same task that first calls `createNotification()` with actor data — don't leave it for a later "wire up the type" pass.
**Warning signs:** TypeScript will NOT catch this at the call site if you just pass extra properties to an object literal typed as `args` unless `args` itself is extended (excess property checks only fire on object literals assigned directly to a typed parameter, which does apply here — so this actually **will** fail `tsc` if the type isn't extended, which is good: the build will force this fix, it just needs to be anticipated as a task rather than discovered as a build break mid-phase).

### Pitfall 4: No topbar exists in the authenticated app shell today
**What goes wrong:** Planning the bell as "add it to the existing topbar" (as CONTEXT.md's canonical_refs section phrases it — "wherever `.pf-iconbtn`/`.dotn` currently render in the layout") will fail at the first `grep` — those classes only exist in `docs/design/wave-4-social-layer/user-profile.html`, and specifically inside that file's `.pf-top` block, whose own CSS comment reads `/* full-page public profile (overrides the app shell) */`. That top bar is the **public, unauthenticated `/u/[handle]` profile page's own self-contained header**, not the authenticated app's shell. `app/(artist)/layout.tsx` (the only layout that wraps authenticated member routes post-Phase-15's nav unification — `app/(industry)/layout.tsx` no longer exists) renders `<ArtistNav>` (a left sidebar) directly beside `{children}`, with no header row at all.
**Why it happens:** CONTEXT.md's canonical_refs was written assuming the design bundle's bell icon corresponds 1:1 to a live topbar component; the design bundle's own comment ("overrides the app shell") was easy to miss without opening the CSS.
**How to avoid:** Treat this as net-new layout surface, not a "find and extend" task. Recommend adding a slim header row inside `app/(artist)/layout.tsx`'s content column (the `<div className="flex min-h-screen flex-1 flex-col">{children}</div>` wrapper) above `{children}`, hosting `<NotificationBell />` (and, per D-13, mounted once so its Realtime subscription is truly global across every authenticated route). This also naturally becomes the only place `/gsd-ui-phase` needs to design net-new (matches ROADMAP.md's phase 10 entry, which already flags this gap explicitly).
**Warning signs:** A plan task phrased as "wire the bell into the existing topbar" without a preceding task to actually build a topbar — that phrasing should be a red flag during plan review.

### Pitfall 5: Global Realtime channel leakage across route navigations / multiple tabs
**What goes wrong:** A `postgres_changes` subscription mounted in a layout-level (not page-level) client component still runs a `useEffect` per component-mount; Next.js App Router layouts persist across client-side navigations within the same route segment, but a full reload or navigating between route groups can remount it. If the cleanup function (`supabase.removeChannel(channel)`) is missing or the effect's dependency array is wrong, orphaned channels accumulate — Supabase's own troubleshooting docs describe this exact failure mode as the leading cause of the `TooManyChannels` error, and specifically call out (a) components creating channels on every render without unsubscribing, (b) `useEffect` re-running due to incorrect dependencies, (c) components unmounting without cleanup, and (d) React StrictMode double-invoking effects in development `[CITED: supabase.com/docs/guides/troubleshooting/realtime-too-many-channels-error]`.
**Why it happens:** `DmWidget.tsx`'s existing subscribe effect (verified in this codebase) already does this correctly — `return () => { supabase.removeChannel(channel) }` — but it's scoped to a component that mounts/unmounts on `open` toggling, which happens far less often than a layout-level provider that lives for the entire authenticated session. The failure mode is more likely to surface for a global bell than it ever did for `DmWidget` simply because of exposure (mounted for the whole session, across every client-side route change within the layout).
**How to avoid:** (1) Use a **predictable, stable channel name** scoped to the user id (e.g. `` `notifications-${userId}` ``, not a random/timestamped name) — Supabase's client automatically reuses channels with matching topic names, per the same troubleshooting doc `[CITED: supabase.com/docs/guides/troubleshooting/realtime-too-many-channels-error]`. This also directly satisfies the multi-tab concern the orchestrator flagged (Phase 8/Wave 4 Presence research already required "user-scoped not tab-scoped keys" for Presence; the same principle applies here even though this is a plain `postgres_changes` INSERT subscription, not Presence — a stable per-user channel name means two tabs from the same user naturally share/reuse rather than duplicate). (2) Always return the `removeChannel` cleanup from the `useEffect`. (3) Do not create the Supabase client inside the component body on every render — call `createClient()` once (module scope or via `useMemo`), matching `DmWidget.tsx`'s existing per-effect `createClient()` call (acceptable there because effects only fire on `open`/`threadId` changes, but for a global provider prefer memoizing).
**Warning signs:** Realtime connection count climbing unboundedly in the Supabase dashboard as users navigate between pages without full reloads; a `TooManyChannels` error in the browser console after extended sessions.

## Code Examples

### Extending `createNotification()` for actor-snapshot columns
```typescript
// Source: lib/notifications/index.ts (existing file, extend the args type + insert)
export async function createNotification(
  service: SupabaseClient,
  args: {
    userId: string
    type: string
    title: string
    body?: string | null
    link?: string | null
    data?: Record<string, unknown>
    email?: string | null
    sendEmailCopy?: boolean
    actorId?: string | null          // NEW
    actorName?: string | null        // NEW
    actorAvatarUrl?: string | null   // NEW
  }
): Promise<{ ok: boolean; error?: string }> {
  // ...unchanged email logic...
  const { error } = await service.from('notifications').insert({
    user_id: args.userId,
    type: args.type,
    title: args.title,
    body: args.body ?? null,
    link: args.link ?? null,
    data: args.data ?? {},
    emailed,
    actor_id: args.actorId ?? null,
    actor_name: args.actorName ?? null,
    actor_avatar_url: args.actorAvatarUrl ?? null,
  })
  return { ok: !error, error: error?.message }
}
```

### Connect state-transition migration (D-04 note column + D-15 no_block gap close), consistent with migration 031's column-privilege convention
```sql
-- Source: this project's own migration 035/031 conventions (verified by reading both files)
-- 044_connections_note.sql
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS note TEXT
    CHECK (note IS NULL OR char_length(note) <= 200);

-- Close the D-15 no_block() gap (Pitfall 2) — inert until Phase 13 populates blocks.
DROP POLICY IF EXISTS "connections_insert_own" ON connections;
CREATE POLICY "connections_insert_own" ON connections FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid() AND no_block(auth.uid(), addressee_id));

-- D-05 auto-follow seed — SECURITY DEFINER trigger, not application code (Pitfall 1).
CREATE OR REPLACE FUNCTION public.connections_seed_follows()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    INSERT INTO public.follows (follower_id, followee_id)
    VALUES (NEW.requester_id, NEW.addressee_id), (NEW.addressee_id, NEW.requester_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER connections_on_accept
  AFTER UPDATE ON connections
  FOR EACH ROW EXECUTE FUNCTION public.connections_seed_follows();
```
*(Exact naming/column choices are illustrative — planner's call per CONTEXT.md's Claude's Discretion note on "exact column/constraint shape for the new `connections.note` field.")*

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| No relationship graph beyond one-way `follows` | Explicit two-tier graph: `follows` (zero-friction) + `connections` (mutual, note-bearing) | Phase 8 schema, Phase 10 UI/API | First phase where a Connect-specific UI surface exists |
| Notifications table exists but has no in-app consumer UI | Bell + dropdown panel becomes the first UI on top of `notifications` | Phase 10 | `antenna_match`/`application_received` notification rows have been silently accumulating in the DB with no UI to view them until now |
| Nav was split `(artist)`/`(industry)` route groups (pre-Phase-15) | Single unified `(artist)` layout + capability-filtered `ArtistNav` | Phase 15 (completed 2026-07-12, immediately before this phase) | CONTEXT.md's canonical_refs referencing "both `app/(artist)/layout.tsx` and `app/(industry)/layout.tsx`" is **stale** — only one layout exists now; the bell only needs to be added once |

**Deprecated/outdated:** The `(industry)` route group referenced in CONTEXT.md's Integration Points section no longer exists as of Phase 15 — do not create or look for `app/(industry)/layout.tsx`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The DB trigger approach for D-05's auto-follow seed is preferable to a service-role insert inside the API route | Architecture Patterns / Pitfall 1 | Low — both are technically valid; if the planner prefers the service-role-insert approach for testability (easier to unit-test in TS than a SQL trigger), that's a reasonable tradeoff, just document which was chosen and why in the plan, since only the trigger closes the "direct PostgREST accept" edge case |
| A2 | `connections` INSERT should get the same `no_block()` wiring as the four tables migration 038 already covers | Pitfall 2 | Low-medium — if skipped, Phase 13 will need its own retrofit migration for `connections` specifically, contradicting migration 035's stated rationale for creating `blocks`/`no_block()` early ("Phases 10/11/13 inherit enforcement for free") |
| A3 | The notification bell belongs in `app/(artist)/layout.tsx`'s content column (not inside `ArtistNav.tsx` itself) | Architecture Patterns / Pitfall 4 | Low — either placement satisfies D-13 ("wherever the topbar renders"); this is explicitly Claude's discretion per CONTEXT.md, included here as a recommendation not a locked decision |
| A4 | No rate limiting is needed on Connect requests in this phase | Security Domain | Low — CONNECT-04 (rate limiting) is explicitly scoped to *message requests* in Phase 11, not Connect requests in Phase 10; REQUIREMENTS.md confirms this mapping. If spam becomes a problem before Phase 11 ships, this would need revisiting, but it's out of this phase's mapped requirements |

## Open Questions

1. **Should the auto-seeded `follows` rows (D-05) also fire a `new_follower` notification, or only the single `connection_accepted` notification?**
   - What we know: NOTIF-01 lists "new follower" and "connection accepted" as separate notification types; the auto-seed creates two follow relationships as a side effect of one accept action.
   - What's unclear: Firing `new_follower` notifications for both auto-seeded follows in addition to the `connection_accepted` notification would produce 3 notifications from a single user action (two redundant "so-and-so followed you" plus the connection-accepted one), which reads as notification spam.
   - Recommendation: Only fire `connection_accepted` (to the original requester) on accept — suppress `new_follower` notifications for the DB-trigger-seeded follow rows. If the planner wants this configurable, the trigger could set a sentinel (e.g. a `source` column on `follows`, not currently present) but that's scope creep beyond D-05's stated intent ("seeded on accept, not continuously enforced").

2. **Does the notification panel's "recent window (~20) with load-more" (D-11) need true cursor pagination, or is offset-based pagination acceptable for v1 volume?**
   - What we know: No pagination pattern exists anywhere else in this codebase yet (`grep` for `range(`/`.lt(`/cursor-style patterns returned nothing) — this is genuinely greenfield for the app.
   - What's unclear: Whether the plan should invest in `created_at`-cursor pagination (`WHERE created_at < :cursor ORDER BY created_at DESC LIMIT 20`, race-safe under concurrent inserts) vs. simpler `OFFSET`-based pagination (simpler to implement, but can skip/duplicate rows if new notifications arrive between page loads).
   - Recommendation: Use cursor-based (`created_at < cursor`) pagination — it is not meaningfully more code than offset-based, and this table receives concurrent inserts by design (that's the whole point of the phase), so offset pagination's skip/duplicate failure mode is not a hypothetical edge case here.

## Environment Availability

No new external tool/service dependencies. Supabase Realtime (already in use via `DmWidget`), Postgres triggers (already in use, migration 001/034/035), and Resend email (already wired, unused by this phase's in-app-only scope) are all already available in this environment — no audit needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.4.2 + ts-jest 29.4.11 |
| Config file | `jest.config.js` (ts-jest preset, `@/*` path alias mapped) |
| Quick run command | `npx jest __tests__/<file>.test.ts` |
| Full suite command | `npm test` |

Existing precedent (`__tests__/capability-grant.test.ts`) is the pattern to mirror: pure unit tests that `jest.mock('@/lib/supabase/server', ...)` to stub `createServiceClient()`'s `.from().insert().select().single()` chain, asserting on call arguments — **no live DB in test environment**, so anything requiring an actual Postgres RLS/trigger evaluation (Pitfall 1's auto-follow trigger, Pitfall 2's `no_block()` wiring) is verified via manual/DB-level checks (mirroring how migration-level checks were verified for Phase 8/15 per STATE.md's Blockers/Concerns log — e.g. "partial unique index (duplicate pending insert rejected)" was checked directly against the live DB, not via Jest).

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONNECT-01 | Follow triggers `new_follower` notification with correct type/actor snapshot | unit | `npx jest __tests__/notification-triggers.test.ts -t "new_follower"` | ❌ Wave 0 |
| CONNECT-02 | Connect request/accept/decline/withdraw state transitions build correct API payloads; note length validated (≤200 chars) | unit | `npx jest __tests__/connections.test.ts` | ❌ Wave 0 |
| CONNECT-02 | Accept seeds both `follows` directions | manual (DB trigger, no live DB in Jest) | `supabase db push` then manual: accept a request in a seeded environment, verify 2 `follows` rows via `SELECT * FROM follows WHERE ...` | N/A — DB-level check, mirrors Phase 8/15 verification precedent |
| NOTIF-01 | All 8 notification types produce a correctly-shaped payload (title/link/data/actor fields) via each `buildXNotification()` pure function | unit | `npx jest __tests__/notification-triggers.test.ts` | ❌ Wave 0 |
| NOTIF-02 | Unread count query excludes read rows, scoped to `auth.uid()` | manual (RLS-dependent COUNT, no live DB in Jest) | Manual: seed 3 unread + 2 read notifications for a test user, confirm bell badge shows 3 | N/A — RLS-dependent |
| NOTIF-03 | Mark-all-read PATCH updates only the caller's own unread rows | unit (mocked service client) | `npx jest __tests__/notifications-api.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest __tests__/<touched-file>.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`; RLS/trigger-dependent items (accept-seeds-follows, unread COUNT correctness, `no_block()` wiring on `connections`) verified manually against the live/staging DB per this project's established migration-verification convention (STATE.md's Blockers/Concerns log shows every migration-level invariant to date was checked this way, not via Jest)

### Wave 0 Gaps
- [ ] `__tests__/connections.test.ts` — covers CONNECT-02 (request/respond/withdraw payload building, note validation)
- [ ] `__tests__/notification-triggers.test.ts` — covers CONNECT-01/NOTIF-01 (per-type `buildXNotification()` pure functions)
- [ ] `__tests__/notifications-api.test.ts` — covers NOTIF-03 (mark-all-read mutation scoping)
- [ ] No fixture/mock infra gap — `capability-grant.test.ts`'s `jest.mock('@/lib/supabase/server', ...)` pattern is directly reusable, no new shared test infrastructure needed

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surface — reuses existing `createApiClient()`/session-cookie pattern |
| V3 Session Management | no | Unchanged |
| V4 Access Control | yes | RLS ownership checks (existing `connections_update_addressee`/`connections_update_requester_withdraw` two-policy split, migration 035) prevent a requester from self-accepting or either party from rewriting `requester_id`/`addressee_id`; API routes must not "helpfully" re-implement these checks with a service-role client that bypasses them (use the session-bound client for the status transition itself, as `follows`/`wall`/`endorsements` routes do) |
| V5 Input Validation | yes | `note` capped at 200 chars via Postgres `CHECK`, mirroring `wall_posts`/`endorsements` body-length precedent; notification `title`/`body` values are rendered as plain React text (auto-escaped by JSX, no `dangerouslySetInnerHTML` needed or used anywhere in this codebase's profile components) |
| V6 Cryptography | no | Not applicable |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR — forging another user's `addressee_id` when responding to a connection request | Tampering | Existing RLS policies (`connections_update_addressee` requires `addressee_id = auth.uid()`) already prevent this at the DB layer; the API route must not bypass with service-role for this specific mutation |
| Connect-request spam / harassment via unlimited requests to a blocked user | Tampering / Denial of Service | `no_block()` wiring gap on `connections` INSERT (Pitfall 2) — must be closed in this phase's migration even though currently inert, so it's live before Phase 13 populates `blocks` |
| Notification enumeration — a user reading another user's notification rows via direct PostgREST | Information Disclosure | Already covered by existing `notifications` RLS (`USING auth.uid() = user_id`, migration 009) — verify no new SELECT policy or column grant loosens this when adding actor-snapshot columns (migration 036 already confirmed to leave GRANT/REVOKE untouched) |
| Realtime channel used as an unauthenticated read path | Information Disclosure | Supabase Realtime respects RLS on `postgres_changes` subscriptions by default for authenticated clients — confirm the bell's channel filter (`filter: user_id=eq.<uid>`) is paired with RLS, not relied on as the sole access control (client-supplied filters are not a security boundary on their own) |

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/035_connections_blocks.sql`, `036_notifications_dm_reads.sql`, `009_antenna_notifications.sql`, `012_social_layer.sql`, `038_block_enforcement_existing_tables.sql`, `031_curators_column_privileges.sql`, `034_member_identity_wave4.sql`, `042_capability_grants.sql` — read directly, verified against live migration sequence (001-043 confirmed present in `supabase/migrations/`)
- `lib/notifications/index.ts`, `app/api/follows/route.ts`, `app/api/wall/route.ts`, `app/api/endorsements/route.ts`, `app/api/release-comments/route.ts`, `components/profile/DmWidget.tsx`, `lib/social/wall.ts`, `lib/social/activity-emit.ts`, `components/nav/ArtistNav.tsx`, `app/(artist)/layout.tsx`, `types/index.ts`, `__tests__/capability-grant.test.ts`, `jest.config.js`, `package.json`, `middleware.ts` — read directly
- `docs/design/wave-4-social-layer/user-profile.html` — read directly, confirmed the `.pf-top`/`.pf-iconbtn` bar is the public-profile-page-only override, not the app shell
- `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/phases/10-connections-notifications/10-CONTEXT.md` — read directly

### Secondary (MEDIUM confidence)
- [Fixing the TooManyChannels Error — Supabase Docs](https://supabase.com/docs/guides/troubleshooting/realtime-too-many-channels-error) - fetched and summarized for Pitfall 5 (channel leakage causes, predictable-channel-name fix, StrictMode double-invoke, removeAllChannels on logout)

### Tertiary (LOW confidence)
- None — all external claims in this research were fetched and cross-checked against the specific official Supabase troubleshooting page above; no unverified web-search-only claims were included.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; every pattern verified by reading the actual file in this repo
- Architecture: HIGH — Pitfall 1 (auto-follow RLS gap) and Pitfall 4 (no topbar exists) were independently discovered by reading the actual RLS policies and layout files, not assumed from CONTEXT.md's framing
- Pitfalls: HIGH — all 5 pitfalls are grounded in direct code/migration reads, not speculation; Pitfall 5 additionally corroborated by official Supabase documentation

**Research date:** 2026-07-12
**Valid until:** 30 days (stable internal codebase conventions; Supabase Realtime API surface is not fast-moving)
