# Domain Pitfalls — Wave 4: The Green Room

**Domain:** Music-industry professional network — adding a full social/networking layer to an existing Next.js 15 / Supabase app (brownfield Wave 4)
**Researched:** 2026-07-03
**Overall confidence:** MEDIUM (RLS/Realtime pitfalls verified against codebase and Supabase docs; trust/safety and identity pitfalls LOW — cross-checked against prior-wave incidents and community patterns)

---

> **Prior wave pitfalls (Waves 2–3)** covering email deliverability, AI calendar prompt injection, admin tips pipeline, curator claim tokens, CSV export, and baseline RLS hygiene remain valid and are NOT repeated here. This document focuses exclusively on the new failure modes introduced by Wave 4's public social graph.

---

## Critical Pitfalls

Mistakes that cause rewrites, data breaches, or user trust collapse.

---

### CRITICAL-1: RLS row policies pass but private columns are still readable via PostgREST

**What goes wrong:** Wave 4 extends `artist_profiles` with new sensitive fields: phone number, private contact email, "Open to" DM preferences, internal admin notes, banned status. The row-level RLS policy for the profile table correctly restricts rows — but RLS does not restrict columns. Any authenticated user can call PostgREST directly (`supabase.from('artist_profiles').select('*')`) and receive every column on every row the row policy allows, including private fields.

**Why it happens:** Developers add private columns to an existing table with a `SELECT USING (true)` policy (as `artist_profiles` currently has for public profile data). The app-layer API route only selects safe columns, but PostgREST allows clients to request any column independently.

**Codebase precedent:** This exact pattern was the root cause of the Wave 3 migration 031 fix (`031_curators_column_privileges.sql`), where `claim_token` and `response_token` were exposed on the `curators` table. The fix pattern is already in the codebase.

**Consequences:** Private contact info, banned status, admin notes, and internal flags are exposed to any authenticated user making direct PostgREST queries. Cannot be detected by looking at API route code.

**Prevention:**
1. For every new private column added to `artist_profiles` or any new profile-extension table, add column-level grants immediately in the same migration:
   ```sql
   -- Revoke broad update access first
   REVOKE UPDATE ON artist_profiles FROM authenticated;
   -- Grant only public-facing updatable columns
   GRANT UPDATE (display_name, bio, avatar_url, banner_url, pronouns, location,
                 open_to_sync, open_to_cowrites, open_to_features, open_to_brand_deals,
                 featured_project_id) ON artist_profiles TO authenticated;
   -- Private columns (phone, admin_note, is_banned, internal_flags): no grant
   ```
2. Never use `SELECT *` in any query involving `artist_profiles` — always name columns explicitly.
3. Add a code-review checklist item: any new column on a profile table requires a column privilege audit.

**Detection:** Check that querying `artist_profiles` as an authenticated non-owner returns null for private columns. PostgREST will return the column with a null value (not an error) if column grants are missing — test explicitly.

**Phase:** Profile extension phase (earliest Wave 4 phase that touches `artist_profiles`).

---

### CRITICAL-2: Block enforcement exists in the UI but not in RLS — blocked users reach data directly

**What goes wrong:** Wave 4 will introduce a block relationship between users. The UI will hide a blocking user's profile from the blocked user. But if the block is only enforced in the Next.js application layer and not baked into RLS policies, any authenticated blocked user can bypass the app by calling PostgREST directly with the anon/authenticated key and read the blocking user's profile, wall, activity feed, and endorsements.

**Why it happens:** Block enforcement at the app layer feels sufficient because "users won't know to call PostgREST directly." But a sophisticated harasser absolutely will — this is block evasion.

**Consequences:** Harassment vector. Users who have blocked an abuser see the block as meaningless once the abuser realizes they can read the user's activity via the API.

**Prevention:**
1. Introduce a `user_blocks` table (`blocker_id`, `blocked_id`) with RLS.
2. Update the SELECT policy on `wall_posts`, `activity_events`, `endorsements`, and the public profile view to add a block exclusion check:
   ```sql
   -- Example for wall_posts
   CREATE POLICY "wall_select_no_block" ON wall_posts FOR SELECT
     USING (
       NOT EXISTS (
         SELECT 1 FROM user_blocks ub
         WHERE (ub.blocker_id = profile_id AND ub.blocked_id = (SELECT auth.uid()))
            OR (ub.blocker_id = (SELECT auth.uid()) AND ub.blocked_id = profile_id)
       )
     );
   ```
3. For DMs: a blocked user must not be able to open a new thread with the blocker. Enforce in `dm_threads` INSERT CHECK.
4. Performance note: the block check subquery hits `user_blocks` on every row evaluation. Index `(blocker_id, blocked_id)` and `(blocked_id, blocker_id)`. Wrap with `(SELECT auth.uid())` pattern (not bare `auth.uid()`) per the existing RLS performance convention.

**Detection:** Write a test: User A blocks User B. Log in as User B. Call `supabase.from('wall_posts').select('*').eq('profile_id', userA_id)` from the browser console. Should return empty array.

**Phase:** Trust & safety phase. Must ship before block UI is exposed to users.

---

### CRITICAL-3: Identity migration — industry members create `artist_profiles` rows if role is set after trigger fires

**What goes wrong:** Wave 4 adds industry members (producers, supervisors, A&R, execs) as first-class Funūn accounts. The `handle_new_user()` PostgreSQL trigger fires on `INSERT INTO auth.users` and creates an `artist_profiles` row. If the Wave 4 signup flow creates the user and then sets `app_metadata.role = 'industry'` in a second operation, the trigger has already fired and created an `artist_profiles` row for the industry member. They now have an orphaned artist profile, their middleware behavior is unpredictable, and their role-based routing breaks.

**Codebase precedent:** This exact bug was fixed in Wave 3 for curators: "app_metadata.role='curator' set at admin.createUser() time (not a post-insert UPDATE) so handle_new_user() early-returns" (PROJECT.md Key Decisions). The same pattern must be applied for industry members.

**Why it happens:** It feels natural to create the user and then configure their role. But the trigger fires synchronously on insert.

**Consequences:** Industry members land on artist-facing routes (/vault, /dashboard). Middleware's `claimed_at` query hits `artist_profiles` and returns a row for them unexpectedly. The readiness score calculation runs against their phantom artist profile. Data integrity violations across the social graph (endorsements, follows, wall posts) if some code paths assume all users have `artist_profiles` rows.

**Prevention:**
1. Industry member signup must set `app_metadata.role = 'industry_member'` at `admin.createUser()` time, not via a subsequent `admin.updateUser()` call.
2. The `handle_new_user()` function must include an early-return branch for `app_metadata.role = 'industry_member'` (mirroring the existing `curator` early-return).
3. `middleware.ts` currently queries `artist_profiles.claimed_at` for every authenticated non-auth request. For industry members who have no `artist_profiles` row, this returns null safely (the claim-link block is skipped). Verify this assumption explicitly before shipping: confirm that a null result from `maybeSingle()` on the `artist_profiles` query does not trigger an unintended redirect.
4. Add the `/network`, `/discover`, and `/industry-profile` routes to middleware's protected path list — but do NOT redirect industry members to `/vault` on auth. The post-auth redirect for industry members must route to their own home (e.g. `/discover` or `/network`).

**Detection:** Create a test industry member account via `admin.createUser()` with the role set. Confirm no `artist_profiles` row exists. Confirm middleware does not redirect them to `/vault`.

**Phase:** Identity & profiles phase (the first Wave 4 phase touching signup flows).

---

## Moderate Pitfalls

---

### MOD-1: Supabase Realtime presence channel leakage in SPA navigation

**What goes wrong:** The floating DM widget and "Active now" presence indicator each open a Supabase Realtime channel. In a Next.js App Router SPA, navigating between routes without explicitly unsubscribing from a channel accumulates open channels. At Pro tier, the limit is 500 concurrent connections per project. An active Funūn session opening 5–10 channels without cleanup reaches the limit quickly under modest concurrent user load.

**Why it happens:** Developers wire `supabase.channel('presence-<userId>')` inside a `useEffect` with no cleanup function. The channel persists after the component unmounts.

**Consequences:** New users cannot subscribe to the presence channel; DM widget shows "offline" for all users; Realtime error `too_many_connections` logged.

**Prevention:**
1. Every `supabase.channel()` call must have a paired cleanup:
   ```typescript
   useEffect(() => {
     const channel = supabase.channel(`presence-${userId}`)
     channel.subscribe()
     return () => { supabase.removeChannel(channel) }
   }, [userId])
   ```
2. Use a single shared presence channel per authenticated user (keyed on `userId`), not one per component or route.
3. The DM widget and the profile "Active now" indicator must share the same channel rather than each creating their own.
4. Add a Realtime monitoring alert when active channel count approaches 80% of plan limit.

**Detection:** Supabase dashboard → Realtime → Reports shows concurrent connection count. Navigate through 10 pages of the app; verify connection count does not increment on each navigation.

**Phase:** Presence & DM widget phase.

---

### MOD-2: Presence shows ghost "Active now" users after tab close or visibility change

**What goes wrong:** Supabase Realtime Presence is eventually-consistent in-memory state. When a user closes a tab or hides the browser, the WebSocket disconnects and the presence `leave` event fires — but only after a timeout (typically 10–30 seconds). During this window, other users see the person as "Active now" when they are not. Additionally, when the page regains visibility (`document.visibilityState === 'visible'`), the presence state is not automatically re-synced — resulting in stale "offline" states for users who are actually active.

**Why it happens:** Developers wire presence on mount and assume disconnect = immediate leave.

**Consequences:** "Active now" is misleading; users initiate DMs expecting a live response from someone who closed their browser.

**Prevention:**
1. On `visibilitychange` to `'visible'`, call `channel.track({ online_at: new Date().toISOString(), user_id: userId })` to re-establish presence with a fresh timestamp.
2. On `visibilitychange` to `'hidden'`, call `channel.untrack()`.
3. Show presence as "Active recently (X min ago)" rather than a binary "Active now" using the `online_at` timestamp — this gracefully handles the disconnect lag.
4. Never treat presence state as authoritative for database operations (e.g. do not write a `last_active_at` column from presence events; use a dedicated `last_seen_at` updated on authenticated API calls instead).

**Detection:** Open app in two tabs as the same user. Close one tab. Observe the presence indicator in the remaining tab — it should degrade from "Active now" to stale within 30–60 seconds, not remain "Active now" indefinitely.

**Phase:** Presence & DM widget phase.

---

### MOD-3: Multi-tab same user creates duplicate presence entries

**What goes wrong:** By default, Supabase Presence assigns a generated UUIDv1 key to each channel subscription. When the same user has the app open in 3 tabs, they appear as 3 distinct "Active now" entries with different keys. In a "Who's online in the network" feature, the user appears to be 3 people.

**Why it happens:** Developers use the default auto-generated presence key.

**Consequences:** Active-user counts are inflated. User profile shows "Active" multiple times in a "Recently active" list.

**Prevention:** Always supply a custom presence key tied to the user's ID:
```typescript
const channel = supabase.channel('network-presence', {
  config: { presence: { key: userId } }
})
```
With a user-scoped key, all tabs for the same user merge into a single presence entry (last-write-wins for the metadata like `online_at`).

**Phase:** Presence & DM widget phase.

---

### MOD-4: Notifications table becomes a write-amplification source for follow/wall events

**What goes wrong:** The existing `notifications` table (migration 009) has one row per recipient per event. For Wave 4 events like "User X followed Y" or "User X posted on Y's wall," each event writes exactly one notification row — this is fine. The risk emerges if Wave 4 adds "activity broadcast" notifications (e.g. "User X posted a new release — notify all followers"). At 1,000 followers, one release post = 1,000 notification INSERTs inside a DB trigger or server function. At 10,000 followers, this is a write-amplification bomb.

**Why it happens:** Fan-out-on-write feels natural for notifications ("write to everyone who needs to see this"). It works until the follow count is large.

**Consequences:** Supabase connection pool saturation, slow API responses for the triggering user, potential row lock contention on the `notifications` table.

**Prevention:**
1. For Wave 4, limit notification writes to 1:1 events only (follow received, DM received, endorsement received, wall post received). These never fan out.
2. For any "broadcast to all followers" notification, do NOT fan-out at insert time. Use fan-out-on-read: store a single "broadcast event" row in a separate `broadcast_events` table; when a follower loads their notification bell, query `broadcast_events` for any source they follow since their last-read timestamp. One read-time join, zero write amplification.
3. Add a `CHECK` constraint or server-side guard: no notification INSERT inside a DB trigger (they are hard to debug and can silently fail due to `SECURITY DEFINER` context). All notification writes go through the service-role API handler.

**Detection:** Run EXPLAIN ANALYZE on the notification SELECT for a user with 100 unread items — should hit the `(user_id, read, created_at DESC)` index from migration 009.

**Phase:** Notifications phase.

---

### MOD-5: Unread badge count drifts from actual unread row count

**What goes wrong:** A common optimization is to store `unread_count` as a cached integer on the user's profile row, increment on notification INSERT, and decrement on mark-as-read. This cache drifts when: (a) bulk mark-as-read operations decrement by 1 instead of N, (b) notifications are deleted without updating the count, (c) a race condition between two concurrent "mark read" requests decrements twice.

**Why it happens:** Developers reach for a cached count to avoid a COUNT(*) query on every page load.

**Consequences:** Notification badge shows "3" when there are 0 unread. Or shows 0 when there are real unread items. Users stop trusting the badge.

**Prevention:** Do NOT cache unread count. The `notifications` table already has an index on `(user_id, read, created_at DESC)` (migration 009). Use `COUNT(*)` with a filter on `read = false` and `user_id = auth.uid()` — this is an index scan, not a seq scan, and is fast for typical notification volumes (<1,000 rows per user). If at scale this becomes a bottleneck, use a materialized counter table updated via a single server-side function (not via concurrent client-side decrements).

**Phase:** Notifications phase.

---

### MOD-6: People search leaks private profiles and blocked users via direct PostgREST filter

**What goes wrong:** Wave 4 adds a global people-search endpoint. If the underlying query runs against `artist_profiles` or a combined members view with a loose `USING (true)` SELECT policy, any authenticated user can:
- Search for users who have set their profile to `is_public = false` (private profiles)
- Find users who have blocked the searcher (the block only hides the profile in the UI)
- Use PostgREST `ilike` filters to enumerate profiles by partial name, bypassing app-layer search rate limiting

**Why it happens:** Full-text or ILIKE people search feels like "just a SELECT with a WHERE clause." The RLS policies on the underlying tables are open for public profiles.

**Consequences:** Private profiles are discoverable. Blocked users can find their blocker. Username enumeration enables targeted harassment.

**Prevention:**
1. The people-search endpoint must be a server-side Next.js API route — never a direct PostgREST call from the client.
2. The search query must enforce:
   - `is_public = true` (exclude private profiles)
   - `NOT EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = target_profile_id AND blocked_id = auth.uid())` (exclude profiles that have blocked the searcher)
3. Apply rate limiting on the search API route: max 20 requests/minute per authenticated user (use a lightweight in-memory rate limiter or a `search_rate_limit` table with a time-window check).
4. Use `pg_trgm` trigram indexes for ILIKE queries on large tables — ILIKE without an index causes a full table scan on every keystroke.
5. Do not expose `tsvector` columns or full-text search functions directly via PostgREST — wrap in a SECURITY INVOKER function that applies the privacy filters before returning results.

**Detection:** Log in as User B (who is blocked by User A). Call the people-search API with User A's name. Should return no results. Also verify that private profiles do not appear in any search result.

**Phase:** Discovery & people search phase.

---

### MOD-7: Self-notification — users notified of their own actions

**What goes wrong:** The notification service inserts a notification for every follow, wall post, endorsement, and DM. If the INSERT logic does not check `recipient_id != actor_id`, users receive notifications for their own actions (e.g. "You followed yourself" if the follow guard on the API route has a bug, or "You posted on your own wall" — which is fine and expected, but should probably not notify the poster).

**Why it happens:** The notification function takes `(actor_id, recipient_id, event_type)` and callers assume they have already excluded self-events.

**Consequences:** User sees a notification for their own activity; notification count inflates; user stops trusting notifications.

**Prevention:** The notification INSERT function (or the API route before calling it) must check `actor_id != recipient_id` before writing. Make this a DB-level constraint on the `notifications` table:
```sql
ALTER TABLE notifications ADD CONSTRAINT no_self_notification
  CHECK (user_id != (data->>'actor_id')::uuid);
```
Or enforce it in the service function. Do not rely on callers to remember.

**Phase:** Notifications phase.

---

### MOD-8: RLS N+1 policy evaluation on social feed queries with joins

**What goes wrong:** Wave 4 activity feeds and follow-based timelines join multiple tables (follows → activity_events, follows → wall_posts, follows → vault_projects). Each row returned by a join triggers RLS policy evaluation on that row. If a policy on `activity_events` references a subquery (`EXISTS (SELECT 1 FROM follows WHERE ...)`), PostgreSQL evaluates that subquery once per row in the result set — classic N+1.

**Codebase precedent:** The existing `act_select_all` policy on `activity_events` is `USING (true)` — fully open. The existing `rc_select_public` policy on `release_comments` does a correlated `EXISTS` subquery into `vault_projects` per row. This is the pattern to audit and fix before the feed grows.

**Why it happens:** RLS policy subqueries feel like database-level security, not like application-level code that can have performance implications.

**Consequences:** Feed loads that join 50 activity events perform 50 policy subqueries. At 100 concurrent users loading feeds, this is 5,000 subqueries per second on the `follows` table.

**Prevention:**
1. Use the `(SELECT auth.uid())` wrapper in all policies — this evaluates the function once per query, not per row (already the established pattern in this codebase).
2. For feed queries, prefer open policies (`USING (true)`) on tables that are inherently public (activity_events, wall_posts) and enforce privacy at the query level (filter by `profile_id IN (SELECT followee_id FROM follows WHERE follower_id = ...)`) rather than in the policy predicate.
3. For the release comments policy `rc_select_public`: the `EXISTS (SELECT 1 FROM vault_projects ...)` subquery runs per comment row. Refactor: add a `is_public` denormalized flag to comments (updated by trigger) so the policy is `USING (is_public OR author_id = auth.uid())` — a simple column check, not a join.
4. Run `EXPLAIN (ANALYZE, BUFFERS)` on the feed query before shipping. Watch for "Rows Removed by Filter" counts that indicate policy filtering is scanning more rows than the query returns.

**Detection:** Use Supabase's built-in query advisor and the PostgREST explain endpoint to profile feed queries before launch.

**Phase:** Feed & activity phase.

---

### MOD-9: Activity feed is unbounded — no cursor pagination means full table scans at scale

**What goes wrong:** The existing `emitActivity()` call (lib/social/activity-emit.ts) writes to `activity_events` without a retention policy. A user who has been active for 12 months could have thousands of activity events. A feed query with `ORDER BY created_at DESC LIMIT 20` without a cursor (using `OFFSET` instead) gets progressively slower as the user loads more pages — PostgreSQL scans and discards `OFFSET` rows before returning the requested 20.

**Why it happens:** OFFSET-based pagination is easy to implement and works fine for the first 3 pages.

**Consequences:** Feed page 10 is 5x slower than page 1. Feed page 100 may time out.

**Prevention:**
1. All feed queries must use cursor-based pagination: `WHERE created_at < :cursor ORDER BY created_at DESC LIMIT 20`. The cursor is the `created_at` timestamp of the last item seen.
2. Index on `(profile_id, created_at DESC)` already exists on `activity_events` (migration 012) — cursor pagination will use this index at constant cost regardless of depth.
3. Consider a soft retention policy: activity events older than 12 months are moved to a `activity_events_archive` table via a weekly cron. The main table stays bounded.
4. For the DM history, `loadConversation()` in `lib/social/dm.ts` already uses `.limit(200)` — this is a hard cap, not cursor-based. Refactor to cursor pagination before Wave 4 ships presence (the DM list will grow significantly with the widget).

**Phase:** Feed & activity phase.

---

## Minor Pitfalls

---

### MINOR-1: Verified badge is self-claimable if admin gate is missing

**What goes wrong:** Wave 4 introduces a verified check on profiles. If the `is_verified` column on `artist_profiles` (or the new member profiles table) is included in the `GRANT UPDATE` column list, any user can set `is_verified = true` on their own profile via a direct PostgREST PATCH call.

**Prevention:** `is_verified` must NEVER be in the column grants for the `authenticated` role. It is updated exclusively by admin API routes using the service-role client, with the `verifyAdmin()` gate from `lib/admin/gate.ts` — the same pattern used for all admin routes in Wave 3.

**Phase:** Profile extension phase.

---

### MINOR-2: Endorsement spam — one user can flood another's profile

**What goes wrong:** The existing `endorsements` table has a `UNIQUE (profile_id, author_id)` constraint preventing multiple endorsements from the same author — good. But it does not prevent a user from deleting their endorsement and immediately re-inserting a new one. A bot account could cycle through delete/insert to keep an endorsement at the top of the list (most-recent ordering) or to spam the notification system.

**Prevention:** Add a `created_at` column with a cooldown check: prevent re-endorsement within 30 days of deletion. Implement in the API route: check `endorsement_deletions` log before allowing a new insert. For V1, simply remove the delete capability from the UI (endorsements are permanent) — this eliminates the spam vector without schema changes.

**Phase:** Profile extension phase.

---

### MINOR-3: Handle squatting before identity is verified

**What goes wrong:** Wave 4 allows industry members to sign up and choose a handle. A squatter could register `@drakesmanager`, `@sonymusic`, or high-value industry handles before the real parties join. Without a reservation or verification pathway, the platform faces an impersonation problem before it has scale.

**Prevention:**
1. Reserve a list of obviously brand-protected handles at signup validation: reject handles matching known labels, major publishers, or industry institutions.
2. The `is_verified` badge is the trust signal — surface it prominently so users know an unverified high-profile handle is not the real party.
3. Add a report-handle-as-impersonation path to the reporting system.

**Phase:** Profile extension phase.

---

### MINOR-4: DM rate limit not enforced — cold-outreach abuse vector

**What goes wrong:** The existing `/api/dm/send` route checks that `toUserId` is not the sender and that the message is non-empty. It does not rate-limit new thread creation. An abusive user can programmatically open DM threads with every user on the platform — the `ensureThread` function will create new `dm_threads` rows indefinitely. The 4,000-character body limit does not stop a flood of short messages.

**Prevention:**
1. In `/api/dm/send`, enforce: max 10 new DM threads opened per user per hour. Track in a `dm_rate_limit` table with a time-window check, or use a sliding-window counter.
2. Consider a "connection request before message" model for cold outreach: a user who does not follow another and has no existing thread must send a connection request that the recipient accepts before a full DM thread opens. This matches the Wave 4 "Connect" action.
3. For existing threads (parties already connected), do not rate-limit message frequency — that would hurt legitimate active conversations.

**Phase:** DM widget phase.

---

### MINOR-5: Wall post body not sanitized for HTML/URL injection

**What goes wrong:** The existing `/api/wall` route accepts `body` text with a 2,000-character limit and length check. It does not strip HTML tags or validate that embedded URLs are safe. A wall post containing `<script>alert(1)</script>` will be stored and, if the frontend renders `body` as `innerHTML` (even accidentally via a markdown renderer), executes as XSS.

**Why it happens:** The API correctly truncates length but treats text as plain content. React's JSX rendering escapes HTML by default — but if any component uses `dangerouslySetInnerHTML` or a markdown renderer on wall post bodies, the gate is open.

**Prevention:**
1. At the API level, strip any HTML tags from `body` before insert (use a server-side sanitizer; DOMPurify server-side or a simple regex strip for the plain-text use case).
2. In the frontend, never render wall post body as HTML. Render as plain text or use a controlled Markdown renderer with an allowlist that excludes `<script>`, `<iframe>`, and event handlers.
3. If URLs are allowed in posts (e.g. for sharing links), validate URL scheme to `http://` or `https://` only — reject `javascript:` and `data:` URLs.

**Phase:** Profile extension phase (when wall posts first appear in the new hi-fi UI).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Profile extension (new columns) | Column-level exposure of private fields (CRITICAL-1) | REVOKE/GRANT column privileges in same migration as new column; never SELECT * on artist_profiles |
| Industry member signup | Role set after trigger fires (CRITICAL-3); middleware redirects to /vault | Set role at admin.createUser() time; add industry early-return to handle_new_user(); audit post-auth redirect |
| Public profile RLS | is_verified self-claim (MINOR-1); block evasion (CRITICAL-2) | is_verified never in column grants; block enforcement in RLS not just UI |
| Presence / DM widget | Channel leakage (MOD-1); ghost users (MOD-2); multi-tab duplication (MOD-3); DM cold-outreach abuse (MINOR-4) | Cleanup on unmount; visibilitychange re-track; user-scoped presence key; DM thread rate limit |
| Notifications | Fan-out write amplification (MOD-4); unread drift (MOD-5); self-notification (MOD-7) | 1:1 events only for fan-out; COUNT not cached; actor != recipient check |
| People search | Private profile leak; block evasion in search (MOD-6) | Server-side route only; is_public filter + block exclusion in query; pg_trgm index |
| Activity feed | N+1 RLS evaluation (MOD-8); unbounded OFFSET pagination (MOD-9) | Open USING(true) policies + query-level privacy filters; cursor pagination from day one |
| Wall / endorsements | HTML injection (MINOR-5); endorsement spam (MINOR-2) | Strip HTML before insert; never dangerouslySetInnerHTML; remove or rate-gate delete+reinsert |
| Handles / identity | Handle squatting / impersonation (MINOR-3) | Reserve brand-protected handles; verified badge prominently displayed; impersonation report path |
| Every new Wave 4 table | RLS not enabled by default | Migration checklist: ENABLE ROW LEVEL SECURITY immediately after CREATE TABLE |
| All RLS policies | Performance: auth.uid() called per row (MOD-8) | Use (SELECT auth.uid()) wrapper in every policy predicate |

---

## Sources

- Funūn codebase: `supabase/migrations/012_social_layer.sql` — baseline social table RLS policies; USING(true) patterns to audit for Wave 4
- Funūn codebase: `supabase/migrations/031_curators_column_privileges.sql` — the REVOKE/GRANT column-level privilege pattern to replicate for profile private fields
- Funūn codebase: `supabase/migrations/009_antenna_notifications.sql` — notifications table schema; (user_id, read, created_at DESC) index
- Funūn codebase: `supabase/migrations/014_dm_realtime.sql` — dm_messages added to realtime publication
- Funūn codebase: `lib/social/dm.ts` — existing DM helpers; loadConversation uses .limit(200) fixed cap (needs cursor refactor)
- Funūn codebase: `lib/social/activity-emit.ts` — best-effort swallow pattern; no retention/pagination
- Funūn codebase: `middleware.ts` — artist_profiles claimed_at query on every navigation; must not break for industry members with no artist_profiles row
- Funūn PROJECT.md Key Decisions — curator role isolation pattern (role set at createUser time) confirmed as the correct pattern for industry member identity
- [Supabase Column-Level Security Docs](https://supabase.com/docs/guides/database/postgres/column-level-security) — REVOKE/GRANT column privilege pattern (MEDIUM confidence)
- [Supabase RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv) — (SELECT auth.uid()) wrapper, correlated subquery performance (MEDIUM confidence)
- [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits) — connection/channel/presence quotas per plan (MEDIUM confidence)
- [Supabase Realtime in Production: What Nobody Tells You](https://www.agilesoftlabs.com/blog/2026/05/supabase-realtime-in-production-what) — channel leakage as #1 production cause of connection limit hits (LOW confidence)
- [Supabase Realtime Presence Docs](https://supabase.com/docs/guides/realtime/presence) — custom presence key pattern for multi-tab deduplication (MEDIUM confidence)
- [Supabase Troubleshooting: Realtime Concurrent Peak Connections Quota](https://supabase.com/docs/guides/troubleshooting/realtime-concurrent-peak-connections-quota-jdDqcp) — quota enforcement behavior (MEDIUM confidence)
- [Social Platform Fan-out on Write vs. Read Trade-offs](https://rurutia1027.medium.com/system-design-social-platforms-fan-out-on-write-vs-fan-out-on-read-trade-offs-3a9a6eb339f0) — fan-out write amplification patterns (LOW confidence)
- [Designing a Scalable Notification System](https://theaugmenteddev.com/blog/designing-scalable-notification-system) — notification database design patterns (LOW confidence)
- [Postgres Row-Level Security Footguns — Bytebase](https://www.bytebase.com/blog/postgres-row-level-security-footguns/) — RLS bypass patterns including views, materialized views, SECURITY DEFINER (MEDIUM confidence)
- [Hacking Thousands of Misconfigured Supabase Instances](https://deepstrike.io/blog/hacking-thousands-of-misconfigured-supabase-instances-at-scale) — PostgREST filter exploitation patterns (LOW confidence, real-world evidence)
- [Supabase: Multi-role auth with app_metadata](https://github.com/orgs/supabase/discussions/36574) — app_metadata.role set at createUser time for security (LOW confidence)
- [GetStream: Block List patterns](https://getstream.io/glossary/blocklist/) — block enforcement architecture for social platforms (LOW confidence)
