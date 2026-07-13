# Phase 11: Presence & Messaging - Context

**Gathered:** 2026-07-13
**Status:** Ready for planning

<domain>
## Phase Boundary

The network feels alive — members see who is online (presence dot + "Active now"/"Active X ago"), message strangers safely through a rate-limited message-request flow, and message connections directly, all backed by a new `/messages` inbox page with a desktop pop-out floating DM widget showing unread counts. Covers PRESENCE-01, PRESENCE-02, PRESENCE-03, CONNECT-03, CONNECT-04, CONNECT-05.

**Critical current-state facts this phase changes:**
- Today's `DmWidget` (`components/profile/DmWidget.tsx`) is profile-scoped — it opens only on `/u/[handle]` for that one person. Phase 11 replaces this model with a page-primary inbox + desktop pop-out widget (D-01..D-05).
- Today **any authenticated user can message anyone** — `app/api/dm/send/route.ts` gates only auth + no-self-message. Phase 11 introduces the connection gate: direct messaging requires a mutual connection (CONNECT-05); everyone else goes through the message-request flow (CONNECT-03/04).
- The topbar messages icon (designed in `user-profile.html` line 253, chat bubble + `.dotn` dot) does not exist yet — Phase 10 shipped only the bell. Phase 11 adds it (satisfying NOTIF-02's "separate messages badge" half).
- "Active X ago" has no storage behind it — Supabase Realtime Presence is ephemeral (connected-now only). Phase 11 must persist a `last_seen_at` (schema addition; exact home is planner's call).

Phase 8 pre-built for this phase: `dm_thread_reads` (migration 036) for unread counts, `no_block()` already enforced on `dm_threads`/`dm_messages` INSERTs (migrations 035/038 + Phase 8 D-15 extension to dm_messages), and the notifications system (Phase 10) was designed so this phase only adds `message_request`/`new_dm` call sites — no re-architecture.

</domain>

<decisions>
## Implementation Decisions

### Inbox architecture (hybrid: page primary + pop-out widget)
- **D-01:** Net-new **`/messages` page is the primary messaging surface** — a hybrid of Facebook's floating messenger and Instagram's DM page, with the page as the anchor. The floating widget is quick access, not the main experience.
- **D-02:** **Both entry points navigate to `/messages`**: the topbar messages icon (net-new this phase, next to the Phase 10 bell) and the profile Message button both go to the page, opening the relevant thread. The profile Message button no longer opens an in-place widget.
- **D-03:** **Desktop: pop-out dock.** On `/messages`, each conversation has a pop-out/minimize control; popping out docks it bottom-right as the floating DM widget (visually the designed `.pf-dm`) and it **persists across navigation** until explicitly closed — Gmail-compose-style. This docked widget is where PRESENCE-02's "Active now / Active X ago" header and PRESENCE-03's unread badge live (in addition to the page).
- **D-04:** **Mobile: no floating widget.** `/messages` is a full-screen Instagram-like experience — thread list → tap → full-screen conversation. The pop-out affordance is desktop-only (breakpoint discretion to planner).
- **D-05:** **Desktop page layout is two-pane** — thread list left, active conversation right. Mobile collapses to single-pane.
- **D-06:** **Auto-read on open:** opening a conversation (page or docked widget) immediately upserts the viewer's `dm_thread_reads` marker; that thread leaves the unread count. No explicit mark-read control.
- **D-07:** **Badges count threads with unread, not total messages** — the topbar messages icon badge and the docked widget badge both show "how many conversations have something new." Computed from `dm_thread_reads.last_read_at` vs `dm_messages.created_at`; never a cached counter (per Wave 4 research rule: compute unread via COUNT/comparison, no drift-prone counters).
- **D-08:** **Inbox search is people-only this phase** — filters the thread list by the other person's name/handle. No message-content full-text search (deferred; see `<deferred>`).

### Message-request flow (CONNECT-03/05)
- **D-09:** **The first message IS the request** (Instagram/LinkedIn model). A non-connection just writes their message; the recipient sees it as a pending request. Accept → it becomes the opening message of a normal thread. No separate "request to message" step.
- **D-10:** **Recipients act on requests in a dedicated Requests section of `/messages`** (kept visually apart from real threads, visible in both page and widget thread lists) **plus a `message_request` notification** in the Phase 10 bell. Accept/decline buttons live inside the request's thread view — the recipient reads the message, then decides. The notification deep-links to the request.
- **D-11:** **Decline is silent.** The sender is never notified; their side still shows the message as sent — it simply never gets a reply. Sender may re-request later (each new request spends rate-limit budget).
- **D-12:** **Minimal Block action ships now:** the request view includes a Block option that inserts a `blocks` row — Phase 8's schema + `no_block()` RLS enforcement makes it immediately effective (stops follows, messages, requests). Phase 13 still owns the full block experience: profile block button, blocked-list management, search exclusion, unblock. CONNECT-03's "accept, decline, or block" is fully satisfiable this phase.
- **D-13:** **Mutual connections message directly** with no request step (CONNECT-05) — the connection check gates which path a new conversation takes. Enforce server-side (not just UI): the send/request APIs must check `connections.status = 'accepted'` (and `no_block()`) themselves.

### Rate limiting (CONNECT-04)
- **D-14:** **Rolling 7-day window** computed from message-request timestamps — no reset job, no calendar-week gaming.
- **D-15:** **Limits: 10/week baseline, verified members higher (default 30/week)** — both stored as tunable constants (exact verified number is Claude's discretion; ~30 suggested). Applies to outbound cold message requests only, never to messaging connections or replying.
- **D-16:** **Every request counts — no refunds** for accepted/declined/ignored requests. Simple to compute and explain.
- **D-17:** **Sender sees a visible budget:** when composing a message to a non-connection, show remaining requests ("7 message requests left this week"). At zero, a friendly wall explains why, when the next slot frees up, and nudges toward sending a Connect request instead.
- **D-18:** **Pending requests allow a few stacked messages (cap ~3)** — Instagram-style: the sender can add context (a link, an intro) to an unanswered request without it costing extra budget; the cap prevents pestering. All messages in a pending request ride the one rate-limit slot.
- **D-19:** **No admin UI for outreach behavior this phase** — server-side enforcement only; admins query the DB if needed. An abuse/reporting dashboard belongs to Phase 13.

### Presence semantics (PRESENCE-01/02)
- **D-20:** **"Active now" = app open AND tab visible/focused.** Backgrounding the tab drops the member to "Active Xm ago" after a short grace period — matches the research-locked `visibilitychange` re-track pattern exactly.
- **D-21:** **Offline status uses coarse buckets with a cutoff:** "Active now" → "Active 5m ago" → "Active 2h ago" → "Active today" → "Active this week" → **nothing after ~7 days** (a stale member shows no status rather than advertising a dead network). Requires persisting `last_seen_at` — Realtime Presence alone cannot answer "X ago."
- **D-22:** **Presence dots appear on: the profile avatar** (designed `.pf-avatar .live` "Online" pill), **the docked DM widget header, the `/messages` thread list, and the two-pane conversation header.** Notification panel and wall avatars stay presence-free this phase; Phase 12 adds search results.
- **D-23:** **Presence is visible to all signed-in members — no hide toggle this phase.** A "show my online status" setting is deferred to Phase 13 alongside SAFETY-04's visibility controls (its natural sibling).

### Claude's Discretion
- **Grandfathering existing threads:** default = existing `dm_threads` between non-connected members keep working (the connection gate applies to *new* conversation starts only). User explicitly left this to Claude; deviate only with good reason found during planning.
- Exact verified-member rate cap number (~30/week) and the constants' home.
- Where `last_seen_at` lives (e.g. column on `artist_profiles` vs. a dedicated presence table), its write cadence/throttle (avoid a write per heartbeat), and column-privilege treatment per the migration-031/040 doctrine.
- How the message-request state is modeled (e.g. a status on `dm_threads`, a separate `message_requests` table, or reuse of thread rows with a `pending` flag) — must support: requests section, ~3-message cap, silent decline, accept→normal thread, block, rate-limit counting, and the CONNECT-05 connection check.
- Pop-out widget state persistence across navigation (client state vs. localStorage) and the desktop/mobile breakpoint.
- `new_dm` notification behavior (whether a bell notification fires for every DM vs. only when the recipient hasn't read; suppression while the thread is open) — follow NOTIF-01's letter (new DM is a listed type) while avoiding notification spam; planner's call.
- Requests-section empty states, thread-list preview truncation, exact bucket boundaries for D-21.
- Realtime Presence channel topology (one global lobby channel vs. per-surface channels) within the research-locked constraints (user-scoped key, explicit unsubscribe, visibilitychange re-track). Confirm Supabase Realtime concurrent-connection budget during planning (carried from STATE.md pending todos).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 11: Presence & Messaging" — goal, 4 success criteria, design-reference note (DM widget fully designed; message-request flow is a net-new design gap)
- `.planning/REQUIREMENTS.md` §"Presence & DMs" and §"Connect" — PRESENCE-01/02/03, CONNECT-03/04/05 full text; also v2 deferral of PRESENCE-04 (typing indicator) and NOTIF-04/05
- `.planning/PROJECT.md` §"Key Decisions" — Wave 4 research locks: native Supabase Realtime Presence (zero new infra), presence channel hygiene flags (unsubscribe/visibilitychange/user-scoped key), notifications computed-unread rule
- `.planning/STATE.md` §"Pending Todos" — "Confirm during Phase 11 planning: Supabase Realtime concurrent-connection budgeting / monitoring strategy"

### Prior-phase decisions this phase builds on
- `.planning/phases/10-connections-notifications/10-CONTEXT.md` — D-08..D-13 (notification panel, realtime+poll pattern, global bell subscription); the explicit note that Phase 10 built the notification catalog so Phase 11 only adds `message_request`/`new_dm` call sites
- `.planning/phases/08-identity-schema-foundation/08-CONTEXT.md` — D-15 (block enforcement pre-wired into dm_threads/dm_messages), schema rationale

### Schema this phase runs on
- `supabase/migrations/012_social_layer.sql` — `dm_threads` (canonical a<b pair) + `dm_messages` base schema and RLS
- `supabase/migrations/036_notifications_dm_reads.sql` — `dm_thread_reads` (thread_id, user_id, last_read_at) built specifically for PRESENCE-03 unread badges; notifications realtime publication
- `supabase/migrations/035_connections_blocks.sql` — `connections` state machine (the CONNECT-05 gate reads `status='accepted'`), `blocks` table + `no_block()` helper (D-12's block action inserts here)
- `supabase/migrations/050_connections_symmetric_active_pair.sql` — most recent connections constraint state; read before touching connection queries
- `supabase/migrations/053_restore_user_profiles_table.sql` — current migration high-water mark; new Phase 11 migrations start at 054

### Code to reuse or replace
- `components/profile/DmWidget.tsx` — current profile-scoped widget: realtime-subscribe + 20s reconcile-poll lifecycle, optimistic send with revert, `.pf-dm`-faithful styling. The docked widget (D-03) should inherit this component's patterns (and much of its JSX) even as its mounting model changes entirely
- `lib/social/dm.ts` — `canonicalPair()`/`findThread()`/`ensureThread()`/`loadConversation()` — the thread model all new inbox queries build on
- `app/api/dm/messages/route.ts`, `app/api/dm/send/route.ts` — existing endpoints; `send` gains the connection/request gate (D-13), plus new endpoints for thread list, requests, accept/decline/block, read-marking
- `components/nav/NotificationBell.tsx` + `app/(artist)/layout.tsx` header — the topbar messages icon (D-02) mounts beside the bell; mirror the bell's global realtime + fresh-COUNT badge pattern (Phase 10 D-13)
- `lib/notifications/index.ts` — `createNotification()` for the two new call sites (`message_request`, `new_dm`) with actor-snapshot fields populated

### Design
- `docs/design/wave-4-social-layer/user-profile.html` — `.pf-dm` (lines ~211-227, 506-520: floating widget — header avatar + "Active now" status, bubbles, date divider, composer), `.pf-avatar .live` (lines 57-58: profile online pill), topbar chat icon + `.dotn` (lines 34-36, 253). **Gaps confirmed:** no `/messages` page, no requests section, no rate-limit UI exist anywhere in the bundle — net-new design during `/gsd-ui-phase`, using `.pf-dm`'s visual language as the base
- `docs/design/wave-4-social-layer/app.css` — locked design tokens for all net-new surfaces

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DmWidget.tsx`'s realtime channel lifecycle (subscribe on open, `removeChannel` cleanup) + 20s reconcile poll — proven pattern to carry into the inbox page, docked widget, and presence hooks
- `dm_thread_reads` table — already migrated, RLS'd, and shaped exactly for D-06/D-07 (upsert own marker, compare timestamps)
- `NotificationBell.tsx` — the global-subscription + fresh-COUNT badge architecture to mirror for the messages icon badge
- Phase 10's notification catalog + `NotificationPanel` — designed to accept new types without rendering changes

### Established Patterns
- Realtime + slow-poll fallback for anything live (Phase 10 D-12) — applies to presence, unread badges, and inbox message delivery
- Unread counts computed fresh (COUNT/timestamp comparison), never client-incremented or cached (Wave 4 research + Phase 10 D-13 precedent)
- Column-level REVOKE/GRANT ships in the same migration as any new private column (migration 031/040 doctrine) — applies to `last_seen_at` home and any message-request state columns
- Server-side enforcement over UI gating (Phase 15 D-14 precedent) — the connection gate and rate limit must live in the API/RLS layer, not just hidden composer UI
- Notification triggers as best-effort try/catch side effects after the primary mutation (Phase 10 plan 10-04 pattern) — applies to `message_request`/`new_dm` emits

### Integration Points
- `app/(artist)/layout.tsx` sticky header — messages icon mounts beside `NotificationBell` (one header, unified nav post-Phase 15)
- `components/profile/ProfileView.tsx` line ~289 — current `DmWidget` mount; Message button becomes a link to `/messages?with=…` (or equivalent)
- `app/u/[handle]/page.tsx` — `canMessage` derivation and initial DM data loading get replaced by the page-primary model; profile presence dot (D-22) wires into the existing avatar/live-pill slot Phase 9 built
- New route group surface: `/messages` page (likely `app/(artist)/messages/page.tsx` under the unified nav) + API routes under `app/api/dm/`

</code_context>

<specifics>
## Specific Ideas

- The user's compass for the whole inbox: **"a solid hybrid of both"** Facebook and Instagram — Facebook's persistent docked-conversation continuity on desktop, Instagram's clean full-screen DM page on mobile. When a layout call is ambiguous, resolve desktop questions toward Facebook/LinkedIn messenger conventions and mobile questions toward Instagram DMs.
- The message-request experience should read as Instagram's requests inbox: strangers' messages are quarantined but readable, acting on them is calm (read first, then accept/decline/block), and declining carries zero social cost because it's invisible.

</specifics>

<deferred>
## Deferred Ideas

- **Message-content full-text search** in the inbox (D-08 chose people-only) — revisit when inbox volume justifies a tsvector index on `dm_messages`.
- **"Show my online status" privacy toggle** (D-23) — ship with Phase 13's SAFETY-04 visibility controls.
- **Admin cold-outreach/limit-hits dashboard** (D-19) — Phase 13 Trust & Safety territory.
- **Full block UX** (profile block button, blocked-list management, unblock, search exclusion) — Phase 13 (SAFETY-01); this phase ships only the request-view block action (D-12).
- **Typing indicator** — PRESENCE-04, already deferred to v1.x in REQUIREMENTS.md; the Realtime Broadcast channel it needs is separate from Presence. Nothing in this phase's channel design should preclude it.

### Reviewed Todos (not folded)
None — `todo.match-phase` returned zero matches for this phase. (The STATE.md pending todo about Realtime connection budgeting is carried into Claude's Discretion above, not a folded scope item.)

</deferred>

---

*Phase: 11-Presence & Messaging*
*Context gathered: 2026-07-13*
