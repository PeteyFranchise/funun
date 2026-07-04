# Stack Research: Wave 4 — The Green Room

**Project:** Funūn Wave 4 — The Green Room (v1.2)
**Researched:** 2026-07-03
**Confidence:** MEDIUM (Supabase Presence/Storage/postgres_changes verified against official docs; pg_trgm recommendation cross-checked across multiple Postgres community sources; date-fns version verified via npm; lucide-react confirmed in-use from design handoff)

---

## Inherited Stack (do not re-research)

Next.js 15 App Router · TypeScript 5.5 (strict) · React 18.3 · Supabase (PostgreSQL + RLS + Storage + Realtime) · Tailwind 3.4 · Anthropic SDK 0.52+ · Resend 4 · svix 1.96 · Zod 3.23

All Wave 3 dependencies (`svix`, `csv-stringify`, `validator`) are already installed. This document covers only what Wave 4 adds or changes.

---

## New Dependencies Needed

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| `date-fns` | `^4.x` (latest) | Relative timestamps ("3 minutes ago", "2 days ago") in activity feed, notifications, wall posts, DM widget | Single named import `{ formatDistanceToNow }` — tree-shaken to ~2–3KB. Pure functions, safe in both server and client components. v4 is ESM-first with full CJS dual exports. No browser APIs, no locale config needed for English. |
| `lucide-react` | `^0.513.0` (latest ~0.513) | Lucide-style icons throughout the new social screens (profile, discover, notifications, DM widget) | The design handoff (`docs/design/wave-4-social-layer/`) explicitly uses Lucide-style inline SVG. `lucide-react` provides exact icon parity, tree-shakes per import, works in both server and client components, no special config for Next.js App Router. |

**That is the complete new-dependency list for Wave 4.** Everything else is native Supabase + Postgres. No new infrastructure service, no new auth provider, no external search engine.

---

## Supabase Capabilities Used (native — no new infra)

### 1. Realtime Presence — "Active now" status

**Provider:** `@supabase/supabase-js` (already installed at ^2.45.0)

**How it works:** Each browser tab tracks a presence payload on a named channel. The server merges all payloads keyed by presence key (user ID). All subscribers receive `sync`, `join`, and `leave` events within milliseconds.

**Integration pattern:**

```typescript
// In a client component (e.g. the DM widget or profile header)
const channel = supabase.channel('presence:global', {
  config: { presence: { key: userId } },
})

channel
  .on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState<{ user_id: string; online_at: string }>()
    // state is a Record<presenceKey, presence[]> — derive online set from keys
  })
  .on('presence', { event: 'join' }, ({ key, newPresences }) => { /* ... */ })
  .on('presence', { event: 'leave' }, ({ key, leftPresences }) => { /* ... */ })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ user_id: userId, online_at: new Date().toISOString() })
    }
  })

// Cleanup on unmount
return () => { channel.unsubscribe() }
```

**Idle / "active now" timeout:** Presence is heartbeat-driven (default 25s interval). A user is "active now" while their channel is subscribed. For the DM widget "active now" dot: show it when the conversation partner's presence key appears in presenceState(). The key disappears within ~30s of tab close or navigation away — no manual idle timer needed. Do NOT call `track()` on user interactions (typing, mouse move) — only on mount. The DM widget showing presence is a Presence channel scoped to the DM conversation (`presence:dm-{conversationId}` or a global `presence:global`) — one pattern works for both.

**Performance note:** Do NOT use Presence for high-frequency state. Do NOT call `track()` in response to scroll/mouse events. Presence is correct for online/offline binary status only.

**Supabase Realtime limits (Hosted Pro):** 200 concurrent connections per project. For a small network this is more than sufficient — scale up via project settings if needed.

---

### 2. Postgres Changes (Realtime) — Notifications delivery

**Provider:** `@supabase/supabase-js` (already installed)

**Pattern:** A `notifications` table with `recipient_id` column. Supabase Realtime delivers INSERT events to the recipient's browser channel. Unread count is computed client-side by counting rows where `read_at IS NULL`.

**Schema (migration):**

```sql
CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  kind         TEXT NOT NULL,  -- 'follow' | 'message' | 'endorsement' | 'wall_post' | 'connect'
  actor_id     UUID REFERENCES auth.users ON DELETE SET NULL,
  entity_id    UUID,           -- the follow/message/endorsement ID (nullable)
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notifications"
  ON notifications FOR SELECT TO authenticated
  USING (auth.uid() = recipient_id);
CREATE POLICY "Users mark own notifications read"
  ON notifications FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

CREATE INDEX idx_notifications_recipient ON notifications (recipient_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications (recipient_id) WHERE read_at IS NULL;

-- Enable realtime delivery
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
```

**Subscription pattern (client component):**

```typescript
useEffect(() => {
  const channel = supabase
    .channel(`notifs:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `recipient_id=eq.${userId}` },
      (payload) => {
        setUnreadCount((n) => n + 1)
        // append payload.new to notifications list
      }
    )
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}, [userId])
```

**Unread count on mount:** `SELECT count(*) FROM notifications WHERE recipient_id = $uid AND read_at IS NULL`. Increment client-side on each realtime INSERT; decrement on read.

**RLS requirement:** RLS must be enabled + SELECT policy must be set before adding to supabase_realtime publication, otherwise any authenticated user can subscribe to all rows. The migration above handles this correctly.

**Notification creation:** Notifications are created server-side by API route handlers (follow, connect, DM send, endorsement, wall post). The API handler calls `createServiceClient()` and inserts into `notifications` — bypasses RLS for the write, which is correct because the inserting party (the API) is trusted.

---

### 3. Postgres Full-Text Search + pg_trgm — People search

**Provider:** Native PostgreSQL (Supabase project, no new service)

**Recommendation: pg_trgm for name typeahead + tsvector for bio/role keyword search, combined in a single RPC function.**

Why this over external search (Algolia, Typesense, Meilisearch):
- The member dataset at Wave 4 scale is small (hundreds to low thousands of profiles). PostgreSQL is entirely sufficient.
- pg_trgm is already available in Supabase without any package installation — it's a bundled extension.
- No external API key, no sync job, no cost, no latency from external network hop.
- The existing codebase uses zero external search services.

**pg_trgm for display_name (partial + typo-tolerant):**

```sql
-- Enable extension (once, in a migration)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index on searchable name column
CREATE INDEX idx_profiles_name_trgm
  ON artist_profiles USING GIN (display_name gin_trgm_ops);

-- Query: partial match + similarity ordering
SELECT id, handle, display_name, avatar_url, industry_roles
FROM artist_profiles
WHERE display_name ILIKE '%' || $1 || '%'
ORDER BY similarity(display_name, $1) DESC
LIMIT 20;
```

**tsvector for bio + role keywords (whole-word, language-aware):**

```sql
-- Generated tsvector column for bio + roles combined
ALTER TABLE artist_profiles
ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(display_name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(bio, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(array_to_string(industry_roles, ' '), '')), 'B')
) STORED;

CREATE INDEX idx_profiles_search_vector ON artist_profiles USING GIN (search_vector);
```

**Combined RPC for global people search (spans artist_profiles and any future industry_members table):**

```sql
CREATE OR REPLACE FUNCTION search_members(query TEXT, result_limit INT DEFAULT 20)
RETURNS TABLE (
  id UUID, handle TEXT, display_name TEXT, avatar_url TEXT,
  industry_roles TEXT[], member_type TEXT, rank REAL
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
    SELECT ap.id, ap.handle, ap.display_name, ap.avatar_url,
           ap.industry_roles, 'artist'::TEXT,
           ts_rank(ap.search_vector, websearch_to_tsquery('english', query)) AS rank
    FROM artist_profiles ap
    WHERE ap.search_vector @@ websearch_to_tsquery('english', query)
       OR ap.display_name ILIKE '%' || query || '%'
    ORDER BY rank DESC, similarity(ap.display_name, query) DESC
    LIMIT result_limit;
END;
$$;
```

**`websearch_to_tsquery` vs `plainto_tsquery`:** Use `websearch_to_tsquery` — it tolerates raw user input (partial words, operators) gracefully without throwing syntax errors on arbitrary strings.

**Why not Algolia/Typesense/Meilisearch:** External search requires a sync pipeline (Supabase → external index), adds cost, adds latency, and adds a new infrastructure dependency. pg_trgm GIN indexes are 98.7% faster than unindexed ILIKE and are sufficient for a professional network at this scale. Add external search only if search latency becomes measurable at 10K+ members.

---

### 4. Supabase Storage — Avatar and Banner image handling

**Provider:** `@supabase/supabase-js` (already installed); Supabase Storage (already configured for `vault-assets` and `track-audio` buckets)

**New bucket:** `profile-images` — public bucket for avatar and banner images.

**Upload pattern (signed URL, service-role stays on server):**

```typescript
// Server-side API route: generate a signed upload URL
const { data, error } = await serviceClient.storage
  .from('profile-images')
  .createSignedUploadUrl(`avatars/${userId}/${Date.now()}.jpg`)
// Return data.signedUrl to browser

// Browser client: upload directly to Supabase Storage
const { error } = await supabase.storage
  .from('profile-images')
  .uploadToSignedUrl(path, token, file, {
    contentType: file.type,
    upsert: true,
    cacheControl: '3600',
  })
```

**Image transforms on delivery (no new library):**

```typescript
// Avatar: 200×200 circle crop
const { data } = supabase.storage
  .from('profile-images')
  .getPublicUrl(`avatars/${userId}/photo.jpg`, {
    transform: { width: 200, height: 200, resize: 'cover' },
  })

// Banner: 1200×300 letterbox crop
const { data } = supabase.storage
  .from('profile-images')
  .getPublicUrl(`banners/${userId}/banner.jpg`, {
    transform: { width: 1200, height: 300, resize: 'cover' },
  })
```

Supabase Storage automatically serves WebP to supporting clients — no `format` param needed for that. Use `format: 'origin'` only when the original format must be preserved (e.g., PNG with transparency).

**Constraints:** Max 25MB source file. Max 2500px in either dimension for transforms. Store only the original upload path in the database; always derive served URLs via `getPublicUrl(..., { transform })` at render time — do NOT store the transformed URL.

**RLS on `profile-images` bucket:**

```sql
-- Anyone can read public images
CREATE POLICY "Public read profile images"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'profile-images');

-- Users can only upload to their own folder
CREATE POLICY "Users upload own profile images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-images' AND
    (storage.foldername(name))[1] IN ('avatars', 'banners') AND
    auth.uid()::text = (storage.foldername(name))[2]
  );

-- Users can update (upsert) their own images
CREATE POLICY "Users update own profile images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-images' AND
    auth.uid()::text = (storage.foldername(name))[2]
  );
```

---

## Schema Additions Summary

These are the new tables Wave 4 adds to the database. Migrations follow the existing pattern (`supabase/migrations/034_...sql`).

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `notifications` | Realtime notification delivery + unread count | `recipient_id`, `kind`, `actor_id`, `read_at` |
| `connections` | Explicit "Connect" relationship (bidirectional vs follow's directed) | `requester_id`, `addressee_id`, `status` (pending/accepted/declined) |
| `member_presence` | Optional: DB-backed presence snapshot for users who do not have a live Supabase Realtime connection (server-side polling fallback) | `user_id`, `last_seen_at` |

`artist_profiles` table gets new columns (migration extends existing table — no new table):
- `banner_url TEXT` — path in `profile-images/banners/`
- `avatar_url TEXT` — path in `profile-images/avatars/` (may already exist; confirm)
- `pronouns TEXT`
- `location TEXT`
- `member_since TIMESTAMPTZ DEFAULT NOW()`
- `open_to TEXT[]` — e.g. `['sync', 'co_writes', 'features', 'brand_deals']`
- `bio TEXT`
- `featured_project_id UUID REFERENCES vault_projects ON DELETE SET NULL`
- `search_vector tsvector GENERATED ALWAYS AS (...) STORED` — computed from name + bio + roles
- `is_open_to_network BOOLEAN DEFAULT false` — controls Discover visibility

---

## Supporting Libraries — Version Details

### `date-fns` ^4.x

The current npm latest as of mid-2025 is date-fns v4. v4 vs v3 breaking changes relevant to Funūn:
- v4 is ESM-first (CJS still supported via dual package exports — no breaking change for Next.js)
- `constants` no longer exported from the main entrypoint — import from `date-fns/constants` if needed (Funūn does not use constants)
- `formatDistanceToNow` signature is unchanged
- No dependency on browser APIs; safe in server components and API routes

**Usage in Funūn:**

```typescript
import { formatDistanceToNow } from 'date-fns'

// In an activity feed item, notification row, or DM timestamp:
const label = formatDistanceToNow(new Date(created_at), { addSuffix: true })
// → "3 minutes ago", "about 2 hours ago", "5 days ago"
```

Single import. Tree-shaken. ~2–3KB minzipped in the final bundle.

### `lucide-react` ^0.513.0

Lucide-react is used in the design handoff as the icon system. The project currently uses inline SVGs; `lucide-react` makes that systematic and maintainable.

```typescript
import { Bell, MessageCircle, Users, Search, UserPlus } from 'lucide-react'
// Each is a ~1KB tree-shaken SVG component
```

Works in server components (pure SVG, no browser APIs). Works in client components. No special Next.js config.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| People search | pg_trgm + tsvector (native Postgres) | Algolia, Typesense, Meilisearch | External service adds sync pipeline, cost, latency, and operational complexity. Postgres GIN is sufficient for <10K members and already in the stack. |
| Presence | Supabase Realtime Presence | Custom `user_status` DB table + polling | Presence is designed exactly for this. A DB table with `last_seen_at` requires either polling (polling interval = perceived staleness) or Realtime anyway. Use Presence for live status; use `last_seen_at` column only as a server-side fallback for users without active sockets. |
| Relative timestamps | `date-fns` | `dayjs`, `timeago.js`, `Intl.RelativeTimeFormat` | `dayjs` is smaller (~2KB) but requires manual plugin installation for relative time. `timeago.js` hasn't had a meaningful release since 2021, no TypeScript-first. `Intl.RelativeTimeFormat` is native but verbose (requires computing the diff manually). `date-fns` formatDistanceToNow is one line, TypeScript-native. |
| Notifications delivery | Supabase Realtime postgres_changes | Pusher, Ably, Firebase Realtime DB | All require new external accounts, billing, and SDK. Supabase Realtime is already in the stack and used for DMs. |
| Image upload | Supabase Storage (existing buckets) | Cloudinary, Imgix, AWS S3 | Cloudinary/Imgix add external dependency and per-transformation cost. Supabase Storage built-in transforms cover avatar/banner use cases completely. AWS S3 requires a separate bucket setup, IAM, and no built-in transforms. |
| Icon system | `lucide-react` | `react-icons`, `heroicons`, inline SVG | `react-icons` bundles multiple icon sets together — larger if not tree-shaken properly. `heroicons` is Tailwind's preferred set but diverges from the design handoff which explicitly uses Lucide style. Inline SVG (current approach) is unmaintainable at scale. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Algolia / Typesense / Meilisearch | External search service is not needed at Wave 4 member scale; adds sync pipeline, cost, and new infra dependency | pg_trgm + tsvector via Supabase (native Postgres) |
| Pusher / Ably / Firebase | New external real-time services when Supabase Realtime already handles DMs and can handle notifications and presence | Supabase Realtime Presence + postgres_changes |
| `socket.io` | Not compatible with Vercel edge; Supabase Realtime handles websocket connections already | Supabase Realtime (already in stack) |
| Cloudinary / Imgix | Adds external media CDN when Supabase Storage transforms cover avatar/banner sizing entirely | Supabase Storage `getPublicUrl` with `{ transform }` options |
| `react-query` / `swr` | Codebase is server-component-first; no client-side data cache needed. DM and notification state is local React state + Realtime events | React `useState` + Supabase Realtime subscriptions |
| Redis / Upstash | Not needed for Wave 4. Presence state lives in Supabase Realtime channel; notification unread count lives in React state + DB count query | Native Supabase features |
| `sharp` (Node.js image processing) | Runs server-side and requires native binaries — problematic on Vercel. Supabase Storage handles transforms at CDN level | Supabase Storage transform params in `getPublicUrl()` |
| `next-auth` / auth changes | Supabase Auth is the SSoT and is already working. Extending profiles to industry members requires adding a `member_type` column to `artist_profiles`, NOT a new auth system | Extend `artist_profiles` table + `lib/industry-roles.ts` |
| `moment.js` | Deprecated; 232KB bundle. Not tree-shakeable | `date-fns` |
| `emoji-mart` or emoji picker | Emoji in DMs is not in the locked design scope for Wave 4 | Text-only DM composer per design |
| `react-virtuoso` / virtual scroll | Member count at Wave 4 scale does not require virtualization. Add if Discover page loads 500+ members | Plain `<ul>` with pagination or cursor-based infinite scroll |
| `react-beautiful-dnd` / drag-and-drop | Not needed in social profile screens | N/A — not a feature in scope |
| Push notifications (FCM / APNs) | Requires service workers, separate infrastructure, and platform approvals. In-app notification badge (bell icon) is the Wave 4 scope | Supabase Realtime postgres_changes for in-app badge |

---

## Installation

```bash
# New runtime dependencies only (Wave 4)
npm install date-fns lucide-react

# No new dev dependencies needed
```

Current versions at install time: `date-fns@^4.x`, `lucide-react@^0.513.0` (or latest; pin exact only if react peer-dep issue found).

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|----------------|-------|
| `date-fns@4.x` | React 18.3, Next.js 15, TypeScript 5.5 | Pure functions, no React peer dep. ESM-first + CJS dual exports are both handled by Next.js bundler. |
| `lucide-react@0.5x` | React 18.3, Next.js 15, TypeScript 5.5 | Peer dep `react@^16 \|\| ^17 \|\| ^18` — satisfied by React 18.3. Server-component safe. |
| `@supabase/supabase-js@2.45` | Realtime Presence, postgres_changes, Storage transforms | All Wave 4 Supabase features (Presence, notifications, image transforms, pg_trgm) are available in the already-installed version. No upgrade needed. |
| `pg_trgm` Postgres extension | Supabase hosted projects | Bundled by default on all Supabase projects. Enable with `CREATE EXTENSION IF NOT EXISTS pg_trgm` in a migration. |

---

## Sources

- Supabase Realtime Presence docs (track/untrack/presenceState API): https://supabase.com/docs/guides/realtime/presence
- Supabase Realtime Presence heartbeat and Web Worker config: https://github.com/orgs/supabase/discussions/30058
- Supabase postgres_changes subscription filter syntax: https://supabase.com/docs/guides/realtime/postgres-changes
- Supabase Storage image transformations (transform params, resize modes, format): https://supabase.com/docs/guides/storage/image-transformations
- Supabase Full Text Search (tsvector, websearch_to_tsquery, GIN, multi-column weighted vectors): https://supabase.com/docs/guides/database/full-text-search
- pg_trgm vs tsvector comparison for short string/name matching: https://medium.com/@daniel.tooke/performant-text-searching-and-indexes-in-psql-trigrams-like-and-full-text-search-784c000efaa6
- Instagram-like profile search with pg_trgm on Supabase: https://medium.com/@nik14gos/instgram-like-profile-search-with-a-postgresql-function-w-supabase-c56efb40cdc8
- Supabase RLS + postgres_changes security requirement: https://supabase.com/docs/guides/realtime/postgres-changes
- date-fns v4 release notes and breaking changes: https://blog.date-fns.org/v40-with-time-zone-support/
- date-fns npm page: https://www.npmjs.com/package/date-fns
- lucide-react npm page: https://www.npmjs.com/package/lucide-react
- lucide-react Next.js App Router compatibility: https://lucide.dev/guide/react/getting-started
- Supabase Realtime with Next.js guide: https://supabase.com/docs/guides/realtime/realtime-with-nextjs
- Real-time notification system with Supabase + Next.js: https://makerkit.dev/blog/tutorials/real-time-notifications-supabase-nextjs

---

*Stack research for: Funūn Wave 4 — The Green Room social/network layer*
*Researched: 2026-07-03*
