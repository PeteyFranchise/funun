# Phase 10: Connections & Notifications - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Members can build an explicit graph — follow one-way (no approval) or send a mutual Connect request that the recipient accepts/declines — and get notified when something happens to them, via a bell with an accurate unread count separate from the messages badge. Covers CONNECT-01, CONNECT-02, NOTIF-01, NOTIF-02, NOTIF-03.

Phase 8 already built the full schema this phase runs on: `connections` (pending/accepted/declined/withdrawn state machine, RLS, partial-unique-index for re-request-after-terminal-state), `blocks` + `no_block()` (wired into `follows`/`wall_posts`/`endorsements`/`dm_threads` INSERT policies already), and `notifications` extended with actor-snapshot columns (`actor_id`, `actor_name`, `actor_avatar_url`) + added to the `supabase_realtime` publication. `lib/notifications/index.ts` already has a working `createNotification()` helper (used today by the Antenna matching engine). `follows` already works end-to-end via `app/api/follows/route.ts` but does not yet emit notifications.

This phase's real work: (1) a Connect request/respond/withdraw API + UI, (2) wiring `createNotification()` into every trigger point listed in NOTIF-01 that fires from Phase 10-owned code (new follower, connection request, connection accepted, release comment, endorsement received, wall post received), (3) the notification bell + dropdown panel UI (net-new — no precedent exists in the design bundle beyond the bell icon + unread dot), and (4) a small schema addition (a note column on `connections`, decided during this discussion).

**NOTIF-01 also lists "message request" and "new DM" as notification types** — those trigger from Phase 11 features (CONNECT-03/04/05) that don't exist yet. Phase 10 should build the notification *system* (types catalog, panel, badge) generically enough that Phase 11 only needs to add two more `createNotification()` call sites when it lands those features — not re-architect anything. This is Claude's discretion during planning, not a product decision.

</domain>

<decisions>
## Implementation Decisions

### Follow/Connect button layout & states
- **D-01:** Three buttons are always visible on a profile: **Connect, Follow, Message** (not two, not Connect folded into a menu). This is net-new UI — the design bundle only has Follow + Message; Connect needs first design during `/gsd-ui-phase`.
- **D-02:** Connect button states: `Connect → Pending → Connected`. If the *other* person sent the request (i.e. viewer is the addressee), the profile shows inline **Accept/Decline** buttons instead of a plain Connect button — no need to leave the profile to respond to an incoming request encountered while browsing.
- **D-03:** The `Pending` state is clickable to **withdraw** the request, resetting the button back to `Connect`. Backed directly by the `connections.status = 'withdrawn'` transition already defined in migration 035 (`connections_update_requester_withdraw` policy).
- **D-04:** Connect requests support an **optional short note** (~200 char cap), shown to the addressee alongside Accept/Decline. **Schema gap:** migration 035's `connections` table has no note/message column — Phase 10 needs a small additive migration (e.g. `ALTER TABLE connections ADD COLUMN note TEXT`) plus a length CHECK constraint.

### Connect ↔ Follow relationship
- **D-05:** Accepting a Connect request **auto-creates a mutual Follow both ways** (connection implies follow — seeded on accept, not continuously enforced).
- **D-06:** After that seed, Follow and Connect are **independent** — either party can unfollow later while remaining connected. No UI restriction on unfollowing a connection.
- **D-07:** If/when a "remove connection" (disconnect) action is built, it does **not** remove the follow relationship — follow persists regardless of connection state. Note: disconnect itself is not a Phase 10 requirement (CONNECT-01/02 only cover follow + connect request/accept/decline); this decision is forward-looking for whichever phase adds it (likely Phase 13, alongside block/trust-safety).

### Notification panel behavior
- **D-08:** The panel is a **dropdown anchored to the bell icon** (not a dedicated `/notifications` page) — a floating panel pattern similar in spirit to `DmWidget`'s fixed bottom-panel, but anchored top-right near the bell instead of bottom-right.
- **D-09:** The unread badge clears **only on an explicit "mark all read" click** — opening the dropdown does NOT auto-clear it. Matches NOTIF-03's literal wording ("can... mark all as read" as a distinct user action).
- **D-10:** Connection-request notifications get **inline Accept/Decline buttons directly on the notification row** in the panel — the panel calls the connect-respond API and updates state in place; no click-through to the requester's profile required to act on a request.
- **D-11:** The panel shows a **recent window (~20) with "load more"/scroll-to-load** for older notifications — real pagination, not a hard cutoff. Older notifications remain queryable in the DB even before pagination UI is built out further.

### Bell badge delivery mechanism
- **D-12:** Reuse the **Realtime + slow-poll-fallback pattern already proven in `components/profile/DmWidget.tsx`** — subscribe to Supabase Realtime `INSERT` events on `notifications` (already added to `supabase_realtime` publication by migration 036) for instant badge updates, with a ~20-30s poll as reconcile/fallback.
- **D-13:** Unlike `DmWidget` (which only subscribes while its panel is open), the bell's realtime subscription is **global — active wherever the topbar renders**, not gated to the dropdown being open. The badge must stay live across the whole app since the bell itself is always visible in the topbar.

### Claude's Discretion
- Exact shape of the notification-type catalog/discriminated union so Phase 11 can add `message_request`/`new_dm` types later without touching the panel's rendering logic.
- Where the global realtime subscription for the bell badge should live architecturally (e.g. a shared layout-level hook/provider vs. duplicated per route group) — implementation detail, not a product decision.
- Exact column/constraint shape for the new `connections.note` field (D-04) — e.g. `TEXT` with a `CHECK (char_length(note) <= 200)` vs. `VARCHAR(200)` — standard SQL choice, no product implication either way.
- Per-notification-type deep-link targets (e.g. does "wall post received" link to the wall post itself vs. the profile's wall tab) — follow existing `link` column convention from migration 009, planner's call per type.
- Icon/visual treatment differentiating notification types in the panel (new follower vs. connection request vs. endorsement, etc.) — UI polish, resolved during `/gsd-ui-phase`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 10: Connections & Notifications" — goal, 4 success criteria, design-reference gap note (no notification panel precedent exists in the design bundle)
- `.planning/REQUIREMENTS.md` §"Connections" and §"Notifications" — CONNECT-01/02, NOTIF-01/02/03 full text
- `.planning/PROJECT.md` — Wave 4 milestone framing, existing thin social layer inventory

### Schema this phase builds on (Phase 8 delivered these already — read before writing any new migration)
- `supabase/migrations/035_connections_blocks.sql` — `connections` table (state machine, RLS, partial unique index for re-request), `blocks` table, `no_block()` SECURITY DEFINER helper
- `supabase/migrations/036_notifications_dm_reads.sql` — `notifications` actor-snapshot columns (`actor_id`, `actor_name`, `actor_avatar_url`), realtime publication add, `dm_thread_reads` (Phase 11, not this phase)
- `supabase/migrations/009_antenna_notifications.sql` — base `notifications` table schema (`type`, `title`, `body`, `link`, `data`, `emailed`, `read`) and its existing RLS policy
- `supabase/migrations/012_social_layer.sql` — `follows`, `wall_posts`, `endorsements` tables and RLS (all three need notification-emit wiring this phase)
- `supabase/migrations/038_block_enforcement_existing_tables.sql` — confirms `no_block()` is already wired into `follows`/`wall_posts`/`endorsements`/`dm_threads` INSERT policies (Phase 8 D-15); Phase 10's new `connections` INSERT should get the same treatment if not already covered by 035
- `.planning/phases/08-identity-schema-foundation/08-CONTEXT.md` — full rationale for why this schema exists and what D-15/D-17 etc. already decided

### Code to reuse directly
- `lib/notifications/index.ts` — `createNotification()` helper; call this from every Phase 10 trigger point, don't reimplement
- `app/api/follows/route.ts` — existing follow/unfollow API; needs a `createNotification()` call added on follow (new-follower notification)
- `components/profile/DmWidget.tsx` — the realtime-subscribe + slow-poll-fallback pattern (D-12) and the fixed-panel UI pattern (D-08) to adapt for the bell dropdown
- `app/api/wall/route.ts`, `app/api/endorsements/route.ts`, `app/api/release-comments/` — existing creation endpoints that need a `createNotification()` call added (wall post received, endorsement received, release comment)

### Design
- `docs/design/wave-4-social-layer/user-profile.html` — `.pf-actions` (Follow/Message buttons, lines ~289-291), `.pf-iconbtn`/`.dotn` (bell icon + unread dot, lines 34-36, 253-254). **Gap confirmed during this discussion:** no Connect button and no notification panel exist anywhere in the bundle — both need net-new design during `/gsd-ui-phase`, not recreation of an existing screen.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/notifications/index.ts` (`createNotification()`) — accepts a service-role client, `userId`, `type`, `title`, `body`, `link`, `data`, optional email copy; already proven in the Antenna matching engine
- `components/profile/DmWidget.tsx` — realtime channel subscribe/unsubscribe lifecycle + `setInterval` reconcile-poll fallback; direct pattern match for D-12/D-13
- `app/api/follows/route.ts` — existing follow/unfollow mutation shape (service-role-free, uses caller's own `createApiClient()`) to extend for the new-follower notification and as a structural sibling for the new Connect API routes

### Established Patterns
- Every new/altered table gets RLS enabled immediately (CVE-2025-48757 convention) — applies to the new `connections.note` column's containing table (already has RLS; no new policy needed for an additive column, but confirm column-level grants aren't restricted before assuming plain `INSERT`/`UPDATE` works)
- `no_block()` gets appended to INSERT policies on socially-exposed tables (migration 038 precedent) — the new Connect-request API path should be checked against whether `connections` INSERT already has this (it does, per 035's `no_block` intent in Phase 8 D-15 — verify at implementation time)
- Notifications carry a denormalized actor snapshot (`actor_id`/`actor_name`/`actor_avatar_url`) so the bell renders without a join — every new `createNotification()` call site in this phase should populate these three fields, not just `user_id`/`type`/`title`

### Integration Points
- New Connect API routes (request/accept/decline/withdraw) join `app/api/follows/route.ts` as siblings, likely `app/api/connections/route.ts` or similar — planner's call on exact routing shape
- Notification bell + dropdown panel lives in the shared topbar — wherever `.pf-iconbtn`/`.dotn` currently render in the layout, both for artist and industry route groups (per `app/(artist)/layout.tsx` / `app/(industry)/layout.tsx` — confirm both need it)
- `follows`, `wall_posts`, `endorsements`, and release-comments creation endpoints all get a new `createNotification()` call added as a side effect of their existing insert — mirrors how `activity-emit.ts` is called as a best-effort side effect elsewhere in the codebase (though `createNotification()` currently is not documented as "never throws" — confirm at implementation time whether it needs the same best-effort/swallow-errors wrapping as `emitActivity()`)

</code_context>

<specifics>
## Specific Ideas

- Connect request UX should feel LinkedIn-style: an optional short note attached to the request (D-04), and the recipient can act on it inline wherever they encounter it (profile page per D-02, notification panel per D-10) — no forced navigation to a separate "requests" screen.
- Follow stays the zero-friction, always-independent action; Connect is the deliberate, mutual, note-bearing action — the two should read as clearly different weights of relationship, not near-duplicates of each other.

</specifics>

<deferred>
## Deferred Ideas

- **Dedicated "Requests" list/tab** for incoming connection requests — considered implicitly during D-10's discussion but not chosen; requests surface via the profile (D-02) and notification panel (D-10) instead. Could resurface later if request volume grows enough that the notification panel feels insufficient.
- **Disconnect / remove-connection action** — not in Phase 10's mapped requirements; D-07 only pre-decided its interaction with follow state for whenever it is built (likely Phase 13, Trust & Safety).
- **Full notification history page** — D-11 chose recent-window + load-more over a full paginated archive view; a dedicated history page is not ruled out for later but isn't Phase 10 scope.

</deferred>

---

*Phase: 10-Connections & Notifications*
*Context gathered: 2026-07-12*
