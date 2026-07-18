# Phase 12: Discovery, Feed & People Search - Research

**Researched:** 2026-07-15
**Domain:** Green Room feed model, people search, visibility/audience enforcement, social interactions, admin-curated placements
**Confidence:** MEDIUM

---

## Summary

Phase 12 is larger than the original "Discovery & People Search" scope because the product direction now makes **The Green Room** a feed-first network home. The repo already has enough Wave 4 substrate to build this safely: follows, connections, blocks, wall posts, endorsements, activity events, release comments, profile search vector, Antenna opportunities, Realtime patterns, and a unified authenticated nav shell.

However, the existing profile-social tables are not sufficient for the selected V1 feed. The locked requirements include guided composer types, post visibility, full custom audiences, comments, reactions, repost/share safeguards, real-time updates, and admin-curated sponsored placements. Those require a purpose-built feed model rather than trying to stretch `wall_posts` or legacy `community_posts`.

**Primary recommendation:** Build a new Green Room feed domain with explicit post visibility, optional audience rules, linked-object attachment references, interaction tables, repost records, and admin-curated placements. Existing `activity_events`, `wall_posts`, `release_comments`, follows/connections, and opportunities should be **sources** or references for feed cards, not the only storage model.

---

## Requirement Support

| ID | Research Support |
|----|------------------|
| DISCOVER-01 | `artist_profiles.search_vector` and explicit public profile columns exist; need API/UI. |
| DISCOVER-02 | `artist_profiles.roles`, `open_to`, `location`, `genres`, `industry_roles` already support filters. |
| DISCOVER-03 | Discover tab can be built as a query mode over public profiles plus role/genre groupings. |
| FEED-01..03 | `ArtistNav` and authenticated layout exist; feed cards can reuse profile identity/follow/connect/message patterns. |
| FEED-04 | Blocks exist via `no_block()`; non-public profile/project exclusion must be added to all feed reads. |
| FEED-07..09 | Existing `community_posts.type` is too narrow and lacks visibility/custom audience; new model needed. |
| FEED-10 | Follows/connections/capability/genre/profile fields provide signals for transparent ranking. |
| FEED-11 | No admin placement model exists; add admin-curated placement table/API. |
| FEED-12 | `community_comments` and `release_comments` provide comment precedent; reaction taxonomy is net-new. |
| FEED-13 | `vault_projects`, public `/r/[projectId]`, `artist_profiles`, and `opportunities` are linkable native objects. |
| FEED-14 | No repost model exists; owner controls and invalidation need explicit schema. |
| FEED-15 | Realtime patterns exist in Phase 10/11; use "new activity" pill instead of auto-jump. |
| FEED-16..18 | Tabs are query modes; Antenna remains formal opportunities, feed supports lighter opportunity posts. |

---

## Existing Schema Findings

### Social layer

- `follows`: one-way graph, public SELECT, own INSERT/DELETE; insert policy now includes `no_block()`.
- `wall_posts`: profile guestbook with `profile_id`, `author_id`, `body`, public SELECT, own/owner delete; too profile-scoped for a global feed.
- `endorsements`: profile recommendations; can become feed activity cards.
- `release_comments`: comments on public/owned releases; useful reference for comment RLS.
- `activity_events`: profile-local activity items with `kind`, `body`, `data`; useful for system-generated feed cards, but raw `data` should be normalized before display.
- `dm_threads`/`dm_messages`: not feed content; do not leak into feed.

### Blocks and safety

- `blocks` stores one directional row; `no_block(a,b)` returns false if either direction exists.
- Migration 038 wires `no_block()` into several existing social INSERT policies.
- Feed SELECT policies must also account for blocks, not just writes. A blocked member should not see feed cards from/to the blocker.

### Search and profile identity

- `artist_profiles.search_vector` is a tsvector maintained by trigger.
- Public profile routes already use explicit column selection due to column-grant lockdown.
- Search must avoid private columns and must not expose `search_vector` internals beyond ranking/querying.

### Opportunities

- `opportunities` are formal Antenna records with active public visibility and industry-managed owner writes.
- `opportunity_matches` are artist-private and must never be globally exposed in feed.
- Feed-native opportunity posts should be separate from formal Antenna opportunities but may attach or link to an Antenna opportunity.

### Legacy community tables

- `community_posts` supports type, content, likes, comment_count, and optional project, but INSERT is Pro+-gated and type values do not match locked FEED decisions.
- These tables are useful as a historical reference but should not be used as-is for The Green Room feed.

---

## Recommended Architecture

### New domain model

Use a new set of tables, names final during plan/migration authoring:

- `green_room_posts`: author, type, body, visibility, audience JSON, linked object type/id, resharing setting, status/draft, timestamps.
- `green_room_comments`: post, author, body, timestamps, soft-delete/moderation fields if needed.
- `green_room_reactions`: post, user, reaction type, timestamps, unique `(post_id, user_id)`.
- `green_room_reposts`: original post, reposter, optional quote/comment, visibility/audience, mute/remove/report controls.
- `green_room_featured_placements`: admin-curated sponsored/featured units with placement type, target object, label, start/end, active, ordering.

Keep card rendering typed:

- `post`
- `activity`
- `release`
- `endorsement`
- `opportunity`
- `suggested_member`
- `sponsored`

### API shape

Recommended routes:

- `GET /api/green-room/feed?tab=for-you|following|discover|opportunities&cursor=...`
- `POST /api/green-room/posts`
- `PATCH /api/green-room/posts/[postId]`
- `DELETE /api/green-room/posts/[postId]`
- `POST /api/green-room/posts/[postId]/comments`
- `POST /api/green-room/posts/[postId]/reactions`
- `POST /api/green-room/posts/[postId]/repost`
- `POST /api/green-room/reposts/[repostId]/remove`
- `GET /api/green-room/search?...`

Admin routes:

- `GET/POST /api/admin/green-room/placements`
- `PATCH/DELETE /api/admin/green-room/placements/[placementId]`

### Feed read service

Create one service that returns typed cards. Tabs should be modes over the same service:

- `for-you`: network + discoverable + role/genre relevance + curated placements.
- `following`: followed/connected activity only.
- `discover`: outside graph, public and relevant.
- `opportunities`: Antenna formal opportunities + feed-native opportunity posts.

Do not create four separate feed implementations.

---

## Ranking Signals

Use transparent scoring. Suggested inputs:

- Relationship: connection > following > followed-by > none.
- Recency: newer cards score higher.
- Role/capability relevance: artist vs industry emphasis.
- Genre overlap: profile genres and post linked object genres.
- Location overlap where present.
- Engagement: comments/reactions/reposts, with caps to prevent rich-get-richer.
- Sponsored/featured placement: inserted by placement rules, not disguised as organic score.

Every non-obvious item should carry a label:

- `From your network`
- `Because you follow {name}`
- `Popular in {genre}`
- `{role} near you`
- `Featured`
- `Sponsored`

---

## Security And Privacy Findings

### Must enforce server-side

- Post visibility.
- Custom audience.
- Draft visibility.
- Blocks in both directions.
- Linked object visibility.
- Repost eligibility.
- Owner resharing disabled.
- Removed/muted repost state.
- Non-public profile exclusion.
- Non-public release exclusion.

### Pitfalls

1. **Client-only audience filtering:** leaks custom-audience posts through API or direct PostgREST.
2. **RLS SELECT too broad:** public SELECT on feed tables would leak followers/connections/custom audience posts.
3. **Repost stale visibility:** original is made private or deleted, but repost keeps showing.
4. **Linked object leakage:** post attaches a private project id; card renderer exposes title/artwork.
5. **Block one-way leak:** only blocker hides blocked user, but blocked user still sees blocker activity.
6. **Custom audience enumeration:** response labels/counts reveal "who is in my audience" or "who blocked me".
7. **Ad disguise:** admin placements must be labeled; sponsored cards cannot look organic.
8. **Realtime bypass:** realtime subscription must not deliver rows that the current viewer could not fetch.
9. **Moderation gap:** uploaded images are deferred for this reason; do not sneak image upload into V1.

---

## UI/Frontend Research Notes

- `user-profile.html` has usable patterns for search input, wall posts, activity, comments, reactions, and profile cards.
- `antenna.html` has usable filter-panel and opportunity-card patterns.
- The feed screen itself has no design handoff and must be net-new during UI planning.
- Existing nav uses inline SVG icons; continue that pattern. Do not add an icon library.
- The authenticated app shell already has left nav + top header; Green Room should fit that shell, not the full-page public profile override.

---

## Standard Stack

No new package is required for Phase 12 planning.

Use:

- Next.js App Router
- React client components where interactivity is needed
- Supabase Postgres/RLS/Realtime
- Zod for request validation
- Tailwind and existing tokens
- Jest for pure helpers and migration contract tests

Potentially useful but not recommended yet:

- Full-text/vector ranking packages: not needed; use Postgres tsvector + deterministic scoring first.
- External moderation APIs: defer until image uploads or scale makes it necessary.
- Ad-tech libraries: explicitly out of scope.

---

## Recommended Plan Decomposition

Follow the existing implementation breakdown:

1. Feed helper contracts + tests.
2. Schema/RLS migration.
3. Feed read API.
4. Composer write API.
5. Comments/reactions.
6. Reposts/share safeguards.
7. Green Room UI/nav/tabs/composer/cards.
8. Real-time new-activity behavior.
9. Search/discover filters.
10. Admin placements.

---

*Phase: 12-Discovery, Feed & People Search*
*Research gathered: 2026-07-15*
