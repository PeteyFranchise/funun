# Architecture Patterns — Wave 4: The Green Room

**Domain:** Professional social network layer on an existing music platform
**Researched:** 2026-07-03
**Based on:** Direct codebase inspection of Waves 1–3 + brownfield integration analysis

---

## Recommended Architecture

Wave 4 is an additive layer on a brownfield Next.js 15 App Router + Supabase app.
The guiding constraint: **touch as little existing code as possible** while completing
the social graph and making both artist and industry member identities first-class.

The system gains four new data concerns:
1. A unified member identity layer (extended `artist_profiles` + `industry_profiles` alignment)
2. A richer social graph (`follows` extended + new `connections` + `blocks` tables)
3. A notifications table with realtime delivery (extends existing `notifications` from migration 009)
4. Presence via Supabase Realtime Presence on a dedicated channel

Everything is bolted onto the existing Supabase layer. No new external services.

---

## Identity Model Fork — Recommendation

### The fork

**Option A: Add role flags to `artist_profiles`, give industry members a row there too.**
Every auth.users signup creates one `artist_profiles` row (the current pattern).
Industry members get `artist_profiles.primary_role = 'industry'` and fill their
profile there. `industry_profiles` becomes a supplemental detail table pointing back
to `artist_profiles` rather than a parallel identity.

**Option B: Keep `artist_profiles` and `industry_profiles` as separate tables,
add a join view `member_profiles` that unifies them.**

**Recommendation: Option A — extend `artist_profiles` as the single member identity table.**

Rationale:

1. The `follows`, `wall_posts`, `endorsements`, `release_comments`, `activity_events`,
   `dm_threads`, `dm_messages`, and `notifications` tables already reference `auth.users(id)`
   directly — not `artist_profiles.id` or `industry_profiles.id`. A unified social graph
   works regardless of which profile table a user's details live in, because the social
   primitives key on `auth.users.id`. This means a merge of identity is a data concern,
   not a social graph concern, and Option A is the minimal change.

2. `artist_profiles` already has `roles JSONB`, `industry_roles TEXT[]`, `handle`,
   `avatar_url`, `banner_url`, `pronouns`, `verified`, `open_to JSONB`, and
   `featured_project_id` — the exact schema the Green Room profile page needs. The table is
   already the "Green Room profile" with Wave 4's additions; it just needs location, tenure,
   and a `member_type` discriminant column.

3. `industry_profiles` exists but is sparse and not yet used in any social API routes.
   It has `role TEXT` (single, CHECK-constrained to 8 values), `company`, `bio`,
   `genres_seeking`. These fields can be absorbed into `artist_profiles` via an additive
   migration (no data loss — the table has no user-facing content on the live site today).
   The `industry_profiles` table can then be deprecated and dropped in a follow-on cleanup.

4. The `middleware.ts` collaborator claim check reads `artist_profiles.claimed_at`. A
   second parallel identity table would require branching this logic — keeping one table
   avoids a middleware change.

5. The curator auth model (migration 030/031) set the precedent: a specialized user type
   is handled via `app_metadata.role` at signup + an early-return in
   `handle_new_user()`, NOT by creating a separate table per role. Industry members
   joining as "first-class" professionals follow the same pattern:
   `app_metadata.role = 'industry'` at creation, `handle_new_user()` creates their
   `artist_profiles` row with `member_type = 'industry'` (or allows them to set it
   in onboarding).

### Migration shape

```sql
-- 034_member_identity_wave4.sql
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS member_type    TEXT NOT NULL DEFAULT 'artist'
                                          CHECK (member_type IN ('artist','industry')),
  ADD COLUMN IF NOT EXISTS tenure_since   INTEGER,              -- year they joined the industry
  ADD COLUMN IF NOT EXISTS company        TEXT,                 -- absorbed from industry_profiles
  ADD COLUMN IF NOT EXISTS genres_seeking TEXT[] DEFAULT '{}',  -- absorbed from industry_profiles
  ADD COLUMN IF NOT EXISTS location       TEXT;                 -- top-level location for discovery
  -- Note: artist_profiles.location already exists (migration 001) — confirm before adding
```

Column-level privileges: `REVOKE SELECT ON artist_profiles FROM authenticated, anon` then
re-`GRANT` only non-sensitive columns (exclude `legal_first_name`, `legal_last_name`,
`legal_middle_name`, `legal_name_suffix`, `contact_phone`, `mailing_address`,
`industry_roles` unless member chose to surface them). Pattern from migration 031.

### Middleware impact

`middleware.ts` currently short-circuits after reading `artist_profiles.claimed_at`.
Wave 4 must NOT add a parallel profile table check here. The existing `/discover`,
`/network`, `/u/[handle]` routes should be public-accessible (no isProtected gate needed
for public profile pages). Only profile editing routes need session gates — those live
inside `(artist)/settings` which is already in `isProtected`. Industry members navigating
to `(industry)/` routes remain governed by the existing `(industry)/layout.tsx` auth
check (no middleware change needed).

New routes to add to `isProtected` in `middleware.ts`:
- `/discover` (requires session for follow/connect actions — could be public-read-only; keep
  discovery page itself unprotected, gate mutations at the API level)
- `/network` (requires session — your own network tab)
- `/notifications` (requires session)

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `app/u/[handle]/page.tsx` | Elevated public member profile (server) | `artist_profiles`, `follows`, `connections`, `activity_events`, `notifications` (for viewer's unread) |
| `app/(artist)/discover/page.tsx` | People search, member directory | `artist_profiles` via `/api/network/search` |
| `app/(artist)/network/page.tsx` | Your connections + follow/connection requests | `connections`, `follows` via `/api/network/connections` |
| `app/(artist)/notifications/page.tsx` | Full notification inbox | `notifications` via `/api/notifications` |
| `components/profile/ProfileView.tsx` | **MODIFY**: full Green Room profile shell | All profile sub-components |
| `components/network/DmFloatingWidget.tsx` | **REPLACE** current `DmWidget.tsx` with presence-aware version | `dm_threads`, `dm_messages`, Supabase Presence channel |
| `components/network/UnreadBadge.tsx` | NEW: unread notification/DM count badge | `/api/notifications/unread-count` (polling) |
| `components/network/PeopleSearch.tsx` | NEW: global search input + results | `/api/network/search` |
| `components/network/ConnectButton.tsx` | NEW: Follow / Connect / Message action bar | `/api/follows`, `/api/connections` |
| `app/api/network/search/route.ts` | NEW: RLS-safe people search | `artist_profiles` FTS/trigram index |
| `app/api/connections/route.ts` | NEW: send/accept/decline/withdraw connect | `connections` table |
| `app/api/notifications/route.ts` | EXTEND existing: unread count + mark-read | `notifications` table |
| `lib/network/search.ts` | NEW: query builder for FTS/trigram people search | Supabase client |
| `lib/network/graph.ts` | NEW: graph utilities (isFollowing, isConnected, isBlocked) | `follows`, `connections`, `blocks` |

---

## Social Graph Data Model

### Design: extend `follows`, add `connections` and `blocks` as separate tables

**Decision: keep `follows` as-is (unilateral follow), add `connections` for mutual professional linking, add `blocks` for safety.**

```
follows (existing, unilateral)
  follower_id → auth.users
  followee_id → auth.users
  created_at

connections (new, mutual / bidirectional)
  id              UUID PK
  requester_id    UUID → auth.users   -- who sent the request
  addressee_id    UUID → auth.users   -- who received it
  status          TEXT CHECK IN ('pending','accepted','declined','withdrawn')
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ
  UNIQUE (requester_id, addressee_id)
  CHECK (requester_id <> addressee_id)

blocks (new)
  blocker_id    UUID → auth.users
  blocked_id    UUID → auth.users
  created_at    TIMESTAMPTZ
  PRIMARY KEY (blocker_id, blocked_id)
```

`follows` is kept unchanged. It handles the asymmetric "fan follows artist" model already
live in the app (13+ API usages). `connections` is the new symmetric "professional link"
action surfaced as "Connect" on the Green Room profile. They are different social gestures
with different UX semantics — do not merge them.

A mutual follow (A follows B AND B follows A) is NOT automatically a `connection`. Users
explicitly send a connection request via the Connect button. The UI can surface a
"Connect back" prompt if a mutual follow exists, but the tables remain decoupled.

`blocks` must filter ALL social surfaces: wall posts, endorsements, DMs, activity feed,
search results. The RLS policies on social tables should check that neither party has
blocked the other. Implement as a helper function:

```sql
-- Helper for RLS policies: returns true if the two users have no active block
CREATE OR REPLACE FUNCTION no_block(a UUID, b UUID) RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM blocks
    WHERE (blocker_id = a AND blocked_id = b)
       OR (blocker_id = b AND blocked_id = a)
  )
$$;
```

### RLS for `connections`

```sql
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

-- Participants see their own connection rows
CREATE POLICY "connections_select_participant" ON connections FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Only requester can insert
CREATE POLICY "connections_insert_requester" ON connections FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- Either participant can update status (accept/decline/withdraw)
CREATE POLICY "connections_update_participant" ON connections FOR UPDATE TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid())
  WITH CHECK (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Either can delete
CREATE POLICY "connections_delete_participant" ON connections FOR DELETE TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());
```

Column-level privilege: `connections` has no sensitive columns (no tokens, no emails).
Standard full-column READ for authenticated is safe for participant-owned rows because
the row policy already constrains to the participant's own data.

### RLS for `blocks`

```sql
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocks_select_own" ON blocks FOR SELECT TO authenticated
  USING (blocker_id = auth.uid());  -- blocker can see who they've blocked; blocked cannot see

CREATE POLICY "blocks_insert_own" ON blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid());

CREATE POLICY "blocks_delete_own" ON blocks FOR DELETE TO authenticated
  USING (blocker_id = auth.uid());
```

Column-level privilege: `REVOKE SELECT ON blocks FROM anon` — anon must never see block
relationships. Authenticated only sees their own rows (the policy enforces this).
The `no_block()` SECURITY DEFINER function can check both directions without exposing
who blocked whom.

---

## Notifications Table — Extended Design

Migration 009 created `notifications` with fields:
`id, user_id, type TEXT, title TEXT, body TEXT, link TEXT, data JSONB, emailed BOOLEAN, read BOOLEAN, created_at`.

Wave 4 requires:
- Unread count badge in the top nav (fast COUNT query)
- Realtime delivery (Supabase Realtime postgres_changes on INSERT)
- DM unread count separate from general notifications

### Extensions needed

```sql
-- Migration 034 or 035 — extend notifications
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS actor_id    UUID REFERENCES auth.users ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actor_name  TEXT,    -- snapshot at emit time (avoids join on read)
  ADD COLUMN IF NOT EXISTS actor_avatar_url TEXT; -- snapshot at emit time
```

`actor_id/name/avatar_url` are snapshots so the notification list renders without a join,
matching the pattern in `wall_posts` (author initials computed at emit time in the demo).

New notification types for Wave 4:
`'follow'`, `'connect_request'`, `'connect_accepted'`, `'wall_post'`, `'endorsement'`,
`'dm'` (unread DM nudge — NOT per-message, just a nudge when a thread has unseen messages),
`'release_comment'`.

### Realtime delivery

Add `notifications` to the realtime publication:
```sql
-- idempotent
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;
```

Client subscribes in `UnreadBadge.tsx`:
```typescript
supabase.channel('notifications-mine')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `user_id=eq.${viewerId}`,
  }, () => setCount(c => c + 1))
  .subscribe()
```

The channel is keyed on `user_id` so each user's client only receives their own row.
RLS on `notifications` (policy "Users see own notifications") gates the Realtime
delivery — Supabase Realtime respects RLS on broadcast. No secondary check needed
in the client handler.

### Unread count endpoint

```
GET /api/notifications/unread-count
```

Returns `{ count: number }` — a server-side COUNT query against `notifications WHERE
user_id = auth.uid() AND read = false`. Uses `createApiClient()` pattern. Polled at a
slow interval (60s) as a fallback to realtime.

No dedicated DM unread count table: derive it from `dm_threads` at query time:
```sql
SELECT COUNT(*) FROM dm_messages m
JOIN dm_threads t ON t.id = m.thread_id
WHERE (t.a_id = $1 OR t.b_id = $1)
  AND m.sender_id <> $1
  AND m.created_at > COALESCE(
    (SELECT last_read_at FROM dm_thread_reads WHERE thread_id = t.id AND user_id = $1),
    '1970-01-01'
  )
```

This requires a new `dm_thread_reads` table:
```sql
CREATE TABLE dm_thread_reads (
  thread_id UUID REFERENCES dm_threads ON DELETE CASCADE,
  user_id   UUID REFERENCES auth.users ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);
ALTER TABLE dm_thread_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dm_reads_own" ON dm_thread_reads FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

The DM widget upserts `dm_thread_reads` when the panel is opened. Unread DM count is then
a fast JOIN. The existing `DmWidget` reconcile-poll endpoint (`GET /api/dm/messages`)
already returns `threadId` — extend it to also upsert `dm_thread_reads` on fetch.

---

## Presence via Supabase Realtime Presence

### Design

Use a single dedicated Presence channel: `presence-global`. Each connected client tracks
a minimal payload:

```typescript
type PresencePayload = {
  userId: string
  handle: string | null
  avatarUrl: string | null
  onlineAt: string // ISO timestamp
}
```

Clients join on mount of any page that needs presence (the DM widget, the profile page when
viewing someone you DM). They leave on unmount. `supabase.channel('presence-global')`
with `.track(payload)`.

### Coexistence with existing DM channels

The existing DM realtime subscriptions use `postgres_changes` channels keyed per thread
(`dm-${threadId}`). These are entirely separate from the Presence channel.
No conflict: one channel handles message delivery; the other handles online state.

There is a minor concern about channel count: a user with many open DM threads could
accumulate multiple `postgres_changes` subscriptions. The existing `DmWidget` already
handles this correctly — it subscribes only when the panel is open and removes the channel
on close. Wave 4 does not change this behavior. The Presence channel adds exactly one
additional persistent subscription per client.

Supabase Free tier limits are 200 concurrent realtime connections and 200 channels.
At current scale this is not a concern.

### Presence on the profile page

The `user-profile.html` design shows "Active now" in the DM widget header. Implementation:

1. When the DmWidget mounts, subscribe to `presence-global` and check whether the
   `ownerId` is in the presence state.
2. Show the green dot if `presenceState[ownerId]` exists and `onlineAt` is within 5 minutes.
3. Presence is **best-effort** — if the user has the app in a background tab, the dot may
   be stale. Do not treat absence as confirmation the user is offline.

```typescript
// In DmWidget (client component)
const [isOnline, setIsOnline] = useState(false)
useEffect(() => {
  const ch = supabase.channel('presence-global')
  ch.on('presence', { event: 'sync' }, () => {
    const state = ch.presenceState<PresencePayload>()
    const entries = Object.values(state).flat()
    setIsOnline(entries.some(e => e.userId === dm.ownerId))
  }).subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await ch.track({ userId: viewerId, handle, avatarUrl, onlineAt: new Date().toISOString() })
    }
  })
  return () => { supabase.removeChannel(ch) }
}, [dm.ownerId, viewerId])
```

---

## People Search Architecture

### Approach: Postgres FTS + pg_trgm trigram index

Do NOT use an external search service. The member directory is small (< 100K rows
initially) and Postgres FTS with trigram similarity covers name, handle, bio, and role
search with acceptable performance.

```sql
-- Migration: add trgm extension + search index
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index for substring / fuzzy search on name + handle
CREATE INDEX IF NOT EXISTS artist_profiles_search_gin
  ON artist_profiles
  USING GIN (
    (coalesce(artist_name,'') || ' ' || coalesce(handle,'') || ' ' || coalesce(bio,''))
    gin_trgm_ops
  );
```

The query in `lib/network/search.ts`:
```typescript
export async function searchMembers(supabase: SupabaseClient, query: string, limit = 20) {
  const q = query.trim()
  if (!q) return []
  return supabase
    .from('artist_profiles')
    .select('id, handle, artist_name, avatar_url, roles, member_type, verified, is_public')
    .eq('is_public', true)
    .or(`artist_name.ilike.%${q}%,handle.ilike.%${q}%`)
    .order('verified', { ascending: false })
    .limit(limit)
}
```

For the MVP, a simple `.ilike` scan against the GIN index is sufficient. The GIN trgm
index makes `ILIKE '%query%'` use the index rather than a sequential scan.

### RLS safety for search

The `artist_profiles` RLS policy "Public profiles visible" already uses `USING (true)` —
every row is readable. For privacy, the search result should be filtered to `is_public =
true` at the query level (not RLS). This matches the existing `app/u/[handle]/page.tsx`
pattern which renders `notFound()` when `is_public = false`.

The column-level privilege migration (to be added in Wave 4) must ensure `artist_name`,
`handle`, `avatar_url`, `roles`, `member_type`, `verified`, `is_public`, `bio`, `open_to`
are GRANTed to `authenticated` and `anon`. Private columns (`legal_first_name`,
`legal_last_name`, `contact_phone`, `mailing_address`, `claim_token` — if any) must be
REVOKEd, following the migration 031 pattern.

### API endpoint

```
GET /api/network/search?q=<query>
```

Auth: open to authenticated users; `anon` may be permitted (discovery is a growth surface)
but throttle at the API layer via rate-limit headers or a simple `if (!session) return 401`
to stay conservative.

---

## Data Flow

### Follow / Connect actions on the profile page

```
User clicks "Follow" on /u/[handle]
  → client ConnectButton.tsx calls POST /api/follows { followeeId }
  → follows/route.ts: auth, self-check, upsert follows row
  → server emits notification via createServiceClient():
      INSERT INTO notifications (user_id=followeeId, type='follow', actor_id=viewerId, ...)
  → followee's UnreadBadge receives realtime INSERT event → count increments

User clicks "Connect"
  → client calls POST /api/connections { addresseeId }
  → connections/route.ts: auth, self-check, insert with status='pending'
  → server emits notification (type='connect_request') to addressee
  → addressee sees bell badge

Addressee accepts on /notifications page
  → PATCH /api/connections/[id] { status: 'accepted' }
  → server emits notification (type='connect_accepted') back to requester
```

### DM with presence

```
User opens DmWidget on /u/[handle]
  → DmWidget subscribes to presence-global + dm-${threadId}
  → Checks presenceState for ownerId → shows "Active now" dot
  → Sends message → POST /api/dm/send { threadId, body }
  → dm/send/route.ts inserts dm_messages row
  → Supabase Realtime delivers INSERT to other party's postgres_changes subscription
  → dm/send route ALSO upserts dm_thread_reads for sender (last_read_at = now())
  → On receive: other party's client increments DM unread count in UnreadBadge
```

### Notification emit pattern

All social actions that generate notifications must emit via the SERVICE client
(bypassing RLS), not the user's session client. This mirrors migration 009's pattern
("Inserts happen server-side via the service-role client"). The rule: user-facing API
routes do the auth + mutation via `createApiClient()`, then call a `emitNotification()`
helper via `createServiceClient()`:

```typescript
// lib/network/notify.ts
import { createServiceClient } from '@/lib/supabase/server'

export async function emitNotification(n: {
  userId: string
  type: string
  title: string
  body?: string
  link?: string
  actorId?: string
  actorName?: string
  actorAvatarUrl?: string
  data?: Record<string, unknown>
}): Promise<void> {
  try {
    const supabase = createServiceClient()
    await supabase.from('notifications').insert({
      user_id: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      actor_id: n.actorId,
      actor_name: n.actorName,
      actor_avatar_url: n.actorAvatarUrl,
      data: n.data ?? {},
    })
  } catch {
    /* best-effort — mirrors emitActivity() in lib/social/activity-emit.ts */
  }
}
```

This extends the existing `emitActivity()` pattern with the same never-throws contract.

---

## New vs. Modified Components

### New files

| File | Type | Description |
|------|------|-------------|
| `app/(artist)/discover/page.tsx` | Server page | Member directory / people search |
| `app/(artist)/network/page.tsx` | Server page | Your connections + pending requests |
| `app/(artist)/notifications/page.tsx` | Server page | Full notification inbox |
| `app/api/connections/route.ts` | API route | POST (send request), GET (list) |
| `app/api/connections/[id]/route.ts` | API route | PATCH (accept/decline/withdraw) |
| `app/api/network/search/route.ts` | API route | GET people search |
| `app/api/notifications/route.ts` | API route | GET list + PATCH mark-read |
| `app/api/notifications/unread-count/route.ts` | API route | GET fast unread count |
| `app/api/dm/read/route.ts` | API route | POST upsert dm_thread_reads |
| `components/network/ConnectButton.tsx` | Client component | Follow/Connect/Message action bar |
| `components/network/PeopleSearch.tsx` | Client component | Search input + results |
| `components/network/MemberCard.tsx` | Client component | Profile card in search/directory |
| `components/network/UnreadBadge.tsx` | Client component | Bell + DM badge (realtime + poll) |
| `components/network/NotificationList.tsx` | Client component | Notification inbox items |
| `components/network/ConnectionList.tsx` | Client component | Network tab connections list |
| `lib/network/search.ts` | Lib module | searchMembers() query builder |
| `lib/network/graph.ts` | Lib module | isFollowing, isConnected, isBlocked helpers |
| `lib/network/notify.ts` | Lib module | emitNotification() (extends emitActivity pattern) |

### Modified files

| File | Change |
|------|--------|
| `components/profile/DmWidget.tsx` | Add Presence subscription, online-dot UI, upsert dm_thread_reads on open |
| `components/profile/ProfileView.tsx` | Add ConnectButton, role badges, "Open to" chips, stats sidebar; owner vs. public view switching |
| `components/profile/FollowButton.tsx` | Integrate with ConnectButton — may be absorbed |
| `app/u/[handle]/page.tsx` | Server component: fetch connections state, notifications for viewer, connections count |
| `app/(artist)/layout.tsx` | Add UnreadBadge to nav, add Discover/Network/Notifications nav items |
| `middleware.ts` | Add `/discover`, `/network`, `/notifications` to `isProtected` |
| `lib/social/activity-emit.ts` | No change needed — keep as-is |
| `types/index.ts` | Add `ConnectionStatus`, `NotificationType`, `PresencePayload` types |

---

## RLS + Column-Level Privilege Concerns

### Critical lessons from prior waves (applied here)

**Wave 3 finding (migration 031):** RLS row policies restrict which rows a client can
access, but Supabase's default schema grants `authenticated`/`anon` full column-level
SELECT/UPDATE on all tables. App-layer column allowlists in API routes are bypassable via
direct PostgREST calls. Every new table with sensitive columns needs a companion
`REVOKE`/`GRANT` column-level privilege migration.

### Column privilege analysis for Wave 4 tables

| Table | Sensitive columns needing REVOKE | Safe to SELECT for authenticated |
|-------|----------------------------------|----------------------------------|
| `connections` | None (no tokens/emails) | All columns (row-policy scoped to participants) |
| `blocks` | `blocked_id` from `anon` | `blocker_id, blocked_id, created_at` for `authenticated` (row-policy to own rows) |
| `dm_thread_reads` | None | All (row-policy to own rows) |
| `notifications` | `data JSONB` (may carry internal details) | `id, user_id, type, title, body, link, actor_id, actor_name, actor_avatar_url, read, emailed, created_at` |
| `artist_profiles` (extended) | `legal_*`, `contact_phone`, `mailing_address`, `industry_roles` | `id, handle, artist_name, avatar_url, banner_url, bio, pronouns, roles, open_to, member_type, verified, is_public, location, tenure_since, company, genres, monthly_listeners, total_streams, career_stage` |

`artist_profiles` has the widest blast radius because it is the unified identity table and
already has accumulated 6+ migrations worth of columns, some private (legal name, address,
phone). The column-level privilege migration is **mandatory** for Wave 4's profile rework —
especially because the Green Room profile fetches `artist_profiles` on a public page
(`/u/[handle]`) where any authenticated visitor could hit the PostgREST endpoint directly.

### RLS on `connections` and blocks for social graph consistency

The `no_block()` SECURITY DEFINER function must be called from the RLS policies on
`wall_posts`, `endorsements`, and `dm_messages` to enforce the block relationship:

```sql
-- Example: update wall_posts insert policy to respect blocks
DROP POLICY IF EXISTS "wall_insert_author" ON wall_posts;
CREATE POLICY "wall_insert_author" ON wall_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND no_block(auth.uid(), profile_id)
  );
```

Apply same pattern to `endorsements` (insert) and `dm_messages` (insert).
`release_comments` already gates on project visibility — add block check there too.

---

## Scalability Considerations

| Concern | At current scale (<1K members) | At 10K members | At 100K members |
|---------|--------------------------------|----------------|-----------------|
| People search | GIN trgm + ilike is fast enough | Add `to_tsvector` FTS index on `artist_name` + `bio` | Consider pg_bigm or offload to Typesense |
| Unread count | COUNT on notifications per user | Add partial index `WHERE read = false` (already in migration 009) | Denormalize unread_count column, decrement on mark-read |
| Realtime channels | One presence channel + N DM channels | Per-user channels scale well on Supabase | Shard into presence-{bucket} if connection limits hit |
| Follow counts | COUNT from follows table | Denormalize follower_count to artist_profiles (updated by trigger) | Already denormalized with trigger |
| `no_block()` in RLS | Fast — blocks table is sparse | Acceptable with index on `blocker_id` | Consider materializing block pairs to a lookup table |

The follow count denormalization (trigger on `follows` table to update `artist_profiles.follower_count`) should be done in the Wave 4 migration — the demo already mocks a follower count (12,800) and the design shows it in the stats sidebar.

---

## Suggested Build Order (Dependency-Ordered)

### Step 1 — Identity & Schema Foundation
**Prerequisite for everything.**
- Migration: extend `artist_profiles` (`member_type`, `tenure_since`, `company`, `location`, `genres_seeking`)
- Migration: add `connections` + `blocks` tables with RLS + `no_block()` function
- Migration: extend `notifications` with `actor_id/name/avatar_url`; add realtime publication
- Migration: add `dm_thread_reads` table
- Migration: add GIN trgm index on `artist_profiles`
- Migration: column-level privilege lockdown for `artist_profiles` and `notifications`
- `types/index.ts`: add `ConnectionStatus`, `NotificationType`, `PresencePayload`
- `lib/network/notify.ts`: `emitNotification()` helper

This step has zero UI surface but unblocks all later work. Build and push to Supabase first.

### Step 2 — Rich Member Profile (owned view + public view)
**Depends on Step 1 identity schema.**
- Upgrade `components/profile/ProfileView.tsx`: banner, avatar, role badges, "Open to" chips, stats sidebar, owner vs. public view switch
- Upgrade `app/u/[handle]/page.tsx`: fetch connections state, extended profile fields
- `app/api/profile/route.ts`: extend EDITABLE_FIELDS allowlist with new Wave 4 fields
- `components/network/ConnectButton.tsx`: Follow / Connect / Message actions

This delivers the hero screen from the design handoff. Validates the identity model in
the browser before any network infrastructure is live.

### Step 3 — Connections & Notifications
**Depends on Step 1 schema, Step 2 profile page for navigation targets.**
- `app/api/connections/route.ts` + `app/api/connections/[id]/route.ts`
- `app/api/notifications/route.ts` + `app/api/notifications/unread-count/route.ts`
- `components/network/UnreadBadge.tsx` (realtime + slow poll fallback)
- `components/network/NotificationList.tsx`
- `app/(artist)/notifications/page.tsx`
- Update `app/(artist)/layout.tsx`: add UnreadBadge + Notifications nav item

### Step 4 — Presence + DM Widget Upgrade
**Depends on Step 1 schema (dm_thread_reads), Step 2 (profile page context).**
- Upgrade `components/profile/DmWidget.tsx`: add Presence subscription + "Active now" dot
- `app/api/dm/read/route.ts`: upsert dm_thread_reads on widget open
- Extend `/api/notifications/unread-count` to include DM unread from dm_thread_reads
- Float widget as a persistent layout component (move into artist layout, not just profile page)

### Step 5 — Discovery & People Search
**Depends on Step 1 GIN index, Step 2 MemberCard component.**
- `lib/network/search.ts`: searchMembers() query builder
- `app/api/network/search/route.ts`
- `components/network/PeopleSearch.tsx` + `MemberCard.tsx`
- `app/(artist)/discover/page.tsx`: member directory shell
- Update topbar to include global search input across artist layout
- `middleware.ts`: add `/discover`, `/network`, `/notifications` to `isProtected`

### Step 6 — Network Tab
**Depends on Step 3 connections API, Step 5 MemberCard.**
- `app/(artist)/network/page.tsx`: server-fetched connections list + pending requests
- `components/network/ConnectionList.tsx`
- `lib/network/graph.ts`: isFollowing, isConnected, isBlocked helpers

---

## Sources

- Direct codebase inspection: `supabase/migrations/001–033`, `app/api/follows/route.ts`,
  `app/api/dm/messages/route.ts`, `components/profile/DmWidget.tsx`,
  `components/profile/ProfileView.tsx`, `lib/social/dm.ts`, `lib/social/activity-emit.ts`,
  `lib/industry-roles.ts`, `middleware.ts`, `types/index.ts`
- Pattern references from this codebase:
  - Column-level privilege lockdown: `supabase/migrations/031_curators_column_privileges.sql`
  - Notification table + service-client emit: `supabase/migrations/009_antenna_notifications.sql`
  - Curator auth isolation pattern: `supabase/migrations/030_curators_pitch_history.sql`
  - Realtime publication: `supabase/migrations/014_dm_realtime.sql`
  - Best-effort activity emit: `lib/social/activity-emit.ts`
  - Wave 4 design handoff: `docs/design/wave-4-social-layer/README.md`
