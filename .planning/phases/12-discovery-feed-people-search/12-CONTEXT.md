# Phase 12: Discovery, Feed & People Search - Context

**Gathered:** 2026-07-15
**Status:** Ready for research/UI planning

<domain>
## Phase Boundary

Phase 12 turns **The Green Room** into the network home for Funūn. The user enters from a primary left-nav item labeled **The Green Room** and lands on `/green-room`, a feed-first hybrid surface with a center professional timeline, search/discovery modules, opportunity surfaces, and safe lightweight interaction.

This phase covers:

- `DISCOVER-01` through `DISCOVER-03`
- `FEED-01` through `FEED-18`

Phase 13 still owns the broader Trust & Safety shell: full block management, reports dashboard, verified-badge admin grant, and profile visibility settings. Phase 12 may need the minimum report/remove hooks required for repost/comment safety, but should not expand into the full Phase 13 product.

**Critical current-state facts this phase changes:**

- There is no `/green-room` route and no left-nav Green Room item yet. `components/nav/ArtistNav.tsx` is the canonical nav entry point.
- Existing social primitives are profile-local, not network-home primitives: `wall_posts`, `activity_events`, endorsements, follows, release comments, and DMs exist, but no global feed service composes them.
- The repo has two older feed-ish tables, `community_posts` and `community_comments`, but they are Pro+-gated legacy community tables with no modern Green Room visibility/audience model.
- `artist_profiles.search_vector` already exists for Phase 12 people search, but search/discovery UI and server-side filtering are not implemented.
- Antenna has formal opportunities under `opportunities`; the Green Room feed also needs lighter opportunity/collab posts without duplicating Antenna's formal matching engine.

</domain>

<decisions>
## Locked Decisions

### Green Room entry and route

- **D-01:** The left-side app navigation gets a universal **The Green Room** item.
- **D-02:** The canonical first destination is `/green-room`.
- **D-03:** Secondary entry points may exist later, but they must deep-link to the same canonical Green Room route and reuse the same feed service/query layer.

### Page shape

- **D-04:** `/green-room` is a hybrid landing page: center feed first, discovery/search/opportunity modules around it.
- **D-05:** Launch tabs are `For You`, `Following`, `Discover`, and `Opportunities`.
- **D-06:** Later specialized tabs are allowed after further discussion; do not ship a sprawling tab matrix in the first pass.

### Feed content and composer

- **D-07:** The center feed is a mixed professional timeline: user posts, public milestones, public releases, endorsements, and connection-worthy moments.
- **D-08:** The composer is guided: it feels like a simple "Share an update" box but stores a structured post type.
- **D-09:** Composer types include: general update, looking for collaborators, release announcement, question, win/milestone, looking for feedback, and opportunity/need.
- **D-10:** V1 attachments are linked Funūn objects only: profiles, releases/projects, public tracks, and opportunities. Uploaded images are deferred until moderation/reporting is stronger.

### Visibility and audiences

- **D-11:** Visibility values are Public, Followers, Connections, Draft, and Custom Audience.
- **D-12:** Custom Audience supports relationships, roles, genres, locations, and specific people.
- **D-13:** Custom Audience is available to everyone with safety limits, clear labels, capped complexity, and spam controls. Advanced paid promotion remains separate.
- **D-14:** Visibility and audience are server-enforced authorization, not client-side filtering.

### Ranking and live updates

- **D-15:** Ranking is smart but transparent: relationship strength, freshness, and relevance with labels such as "From your network", "Popular in R&B", and "Music supervisors near you".
- **D-16:** Real-time updates use gentle controls: a new-activity pill, animated insertion, and user-controlled jump-to-new behavior. The feed should not jump while someone is reading.

### Interactions

- **D-17:** V1 supports lightweight comments on feed posts, similar to LinkedIn, with no nested replies initially unless later planning reopens it.
- **D-18:** Reaction set: Like, Love, Fire, Congrats, Inspired, Helpful, Interested.
- **D-19:** Full repost/share is in scope only with strong safeguards: clear original attribution, owner-controlled resharing, rate limits, report/remove controls, mute controls, and automatic disappearance when original visibility changes.

### Sponsored and opportunities

- **D-20:** V1 sponsored/featured content is admin-curated, not self-serve paid ads.
- **D-21:** Admin placements can feature members, public releases/projects, opportunities/open calls, partner cards, curated programs, and future paid placements.
- **D-22:** Formal opportunities stay in Antenna; lighter opportunity/collab posts can live in the feed and later graduate into Antenna.

### Account-type relevance

- **D-23:** Artists and industry members share one Green Room structure, but ranking/emphasis adapts by capability/role.
- **D-24:** Artists see more opportunities, collabs, and release activity; industry members see more artists, releases, and opportunity-relevant signals.

</decisions>

<canonical_refs>
## Canonical References

Downstream agents must read these before implementation planning:

- `.planning/ROADMAP.md` §"Phase 12: Discovery, Feed & People Search"
- `.planning/REQUIREMENTS.md` §"Discover" and §"Feed"
- `.planning/quick/260715-green-room-feed-plan/DISCUSSION-LOG.md`
- `.planning/phases/12-discovery-feed-people-search/12-IMPLEMENTATION-BREAKDOWN.md`
- `components/nav/ArtistNav.tsx` — left-side app navigation
- `app/(artist)/layout.tsx` — authenticated app shell and top header
- `supabase/migrations/012_social_layer.sql` — follows, wall_posts, endorsements, release_comments, activity_events, DMs
- `supabase/migrations/035_connections_blocks.sql` — connections, blocks, `no_block()`
- `supabase/migrations/038_block_enforcement_existing_tables.sql` — block enforcement pattern for existing social tables
- `supabase/migrations/034_member_identity_wave4.sql` — `artist_profiles.search_vector`
- `supabase/migrations/040_artist_profiles_column_privileges.sql` — artist profile column privilege doctrine
- `supabase/migrations/001_initial_schema.sql` — `opportunities`, `community_posts`, `community_comments`
- `lib/social/activity.ts`, `lib/social/activity-emit.ts`, `lib/social/wall.ts`
- `app/api/wall/route.ts`, `app/api/follows/route.ts`, `app/api/connections/route.ts`
- `app/api/antenna/opportunities/route.ts`, `app/api/antenna/opportunities/[opportunityId]/apply/route.ts`
- `docs/design/wave-4-social-layer/user-profile.html`
- `docs/design/wave-4-social-layer/antenna.html`
- `docs/design/wave-4-social-layer/app.css`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable substrate

- `follows` already represents one-way graph edges; accepted connections auto-seed follows through migration 044.
- `connections` already represents mutual relationship state and should influence ranking.
- `blocks` + `no_block()` already exist and are wired into several social writes; Phase 12 must extend the same doctrine to any new feed tables.
- `wall_posts` and `activity_events` prove the profile-social card patterns but are too profile-scoped for the Green Room feed by themselves.
- `activity_events` can be a feed source for system activity, but typed feed cards should not expose raw `data` blindly.
- `community_posts`/`community_comments` are a possible legacy source or migration reference, but their Pro+ insert gate and limited type model do not satisfy FEED-07 through FEED-18.
- `artist_profiles.search_vector` is already indexed for people search.
- `opportunities` are already active-visible to members and industry-managed by owner; feed opportunity cards must not duplicate formal Antenna matching.

### Established patterns

- Never `select('*')` from `artist_profiles` in public or semi-public surfaces; use explicit column lists.
- New private/profile columns need column-level REVOKE/GRANT in the same migration.
- Server-side enforcement beats UI hiding for capability, visibility, audience, and block checks.
- Best-effort side effects should never block primary mutations (`emitActivity()`, notifications pattern).
- Realtime should include a polling or refresh fallback where live state matters.

### Integration points

- `components/nav/ArtistNav.tsx`: add **The Green Room** item, universal across artist/industry capabilities.
- `app/(artist)/green-room/page.tsx` or equivalent route: canonical landing page.
- New API route family likely under `app/api/green-room/`.
- New domain helpers likely under `lib/green-room/` or `lib/social/feed.ts`.
- Admin placement management likely belongs under `app/(admin)/admin/` plus `app/api/admin/`.

</code_context>

<deferred>
## Deferred Ideas

- Self-serve paid ad buying, targeting, budgets, Stripe billing, and ad analytics.
- Uploaded image/media attachments for feed posts.
- Nested comments/replies.
- A dedicated Sponsored tab.
- Full Phase 13 trust/safety management: blocklist UI, complete reporting dashboard, admin moderation queue, verified-badge grant workflow, profile visibility settings.
- AI-assisted discovery recommendations.
- Live push notifications outside the app.

</deferred>

---

*Phase: 12-Discovery, Feed & People Search*
*Context gathered: 2026-07-15*
