# Phase 12 Implementation Breakdown: Discovery, Feed & People Search

**Status:** Draft planning breakdown
**Milestone:** v1.2 — Wave 4: The Green Room
**Inputs:** `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/quick/260715-green-room-feed-plan/DISCUSSION-LOG.md`

## Goal

Ship The Green Room as a feed-first professional network home. A member clicks **The Green Room** in the left-side navigation and lands on a hybrid feed/discovery surface where they can see relevant activity, create structured posts, discover people, act on opportunities, and interact with posts safely.

## Canonical Route

Recommended route:

- `/green-room`

Future subroutes, if needed:

- `/green-room/discover`
- `/green-room/network`
- `/green-room/opportunities`

The first implementation should keep one canonical feed service/query layer. Tabs are query modes, not separate feed systems.

## Scope Summary

Phase 12 now covers:

- Left-nav **The Green Room** entry point.
- Hybrid landing page with feed center column and discovery/opportunity side modules.
- Tabs: For You, Following, Discover, Opportunities.
- Guided composer with structured post types.
- Visibility: Public, Followers, Connections, Draft, Custom Audience.
- Custom Audience: relationship, role, genre, location, specific people.
- Smart transparent ranking with explanation labels.
- Comments, reactions, repost/share with strong safeguards.
- Linked Funūn object attachments in v1.
- Real-time feed updates with user-controlled insertion.
- Admin-curated featured/sponsored placements.
- Search and discovery filters.
- Server-side privacy/block/visibility enforcement.

## Proposed Plan Waves

### Wave 1 — Foundation & Adversarial Contracts

Purpose: lock the model and guardrails before UI.

Likely plan files:

- `12-01-PLAN.md` — Feed domain model, pure helpers, ranking labels, visibility/audience validators, RED tests.
- `12-02-PLAN.md` — Migration(s): feed posts, feed comments, reactions, reposts, curated placements, custom audience storage, indexes, RLS.

Acceptance focus:

- Visibility is represented explicitly, not inferred from UI state.
- Custom audience is server-enforced.
- Draft posts are invisible to everyone except owner.
- Block relationships exclude feed reads/writes both directions.
- Reposts disappear when original content is deleted or visibility changes.
- Admin-curated placements are labeled and do not imply self-serve paid ads.

### Wave 2 — Feed Read API & Composer Write API

Purpose: make the feed data layer real before building the full screen.

Likely plan files:

- `12-03-PLAN.md` — `/api/green-room/feed` read endpoint with tab modes, cursor pagination, relationship/relevance ranking, sponsored placement insertion.
- `12-04-PLAN.md` — `/api/green-room/posts` composer write endpoint with structured type, linked object validation, visibility/custom audience validation, draft/publish behavior.

Acceptance focus:

- Feed results are explicit typed cards, not raw database rows.
- For You mixes network + discoverable public activity with transparent labels.
- Following only includes followed/connected eligible activity.
- Discover emphasizes people/content outside the viewer's graph.
- Opportunities combines Antenna-backed formal opportunities with feed-native lighter opportunity posts.
- Linked objects validate public/visible state before publication.

### Wave 3 — Interactions: Comments, Reactions, Reposts

Purpose: add social interactions without letting virality outrun safety.

Likely plan files:

- `12-05-PLAN.md` — Comments + reactions API and UI primitives.
- `12-06-PLAN.md` — Repost/share API and safeguards: owner-disable, report/remove, mute reposts, rate limits, visibility invalidation.

Acceptance focus:

- No nested comments in v1 unless explicitly re-opened.
- Reaction set: Like, Love, Fire, Congrats, Inspired, Helpful, Interested.
- Users can delete their own comments.
- Reports and owner removal controls are present for reposts.
- Repost author and original author attribution are both visually clear.
- Reposting respects `allow_resharing`-style owner controls.

### Wave 4 — Green Room UI, Nav & Real-Time

Purpose: assemble the experience.

Likely plan files:

- `12-07-PLAN.md` — `ArtistNav` Green Room item + `/green-room` page shell + tabs + composer + card components.
- `12-08-PLAN.md` — Real-time feed updates, "new posts" pill, animated insert, user-controlled jump-to-new, mobile behavior.

Acceptance focus:

- The Green Room appears in left nav for artist and industry-capable accounts.
- `/green-room` is the canonical landing page.
- The feed center column is primary; discovery/opportunity modules support it.
- Real-time updates never move the user's reading position unexpectedly.
- Empty states help new users follow/connect/discover people.

### Wave 5 — Discovery, Search & Admin Placements

Purpose: complete the feed/discovery loop and monetization runway.

Likely plan files:

- `12-09-PLAN.md` — People search and Discover filters: role, open-to, location, genre, keyword.
- `12-10-PLAN.md` — Admin-curated featured/sponsored placement management and feed rendering.

Acceptance focus:

- Search/discovery exclude blocked, hidden, and non-public profiles.
- Industry and artist accounts share the same structure but get role-tuned ranking/emphasis.
- Sponsored/featured cards are clearly labeled.
- Admin placement types support members, public releases/projects, opportunities/open calls, partner cards, curated programs, and future paid placements.
- No self-serve ad buying, targeting, billing, or ad analytics ship in this phase.

## Key Technical Risks

- **Audience leaks:** Custom audience targeting must be enforced in SQL/API reads, not merely filtered client-side.
- **Block bypasses:** Feed posts, comments, reactions, and reposts must all respect bidirectional block state.
- **Private object leakage:** Linked releases/projects/tracks must be public and visible to the viewer.
- **Repost complexity:** Reposts can preserve stale visibility unless original-state invalidation is explicit.
- **Ranking opacity:** Smart ranking should explain itself with labels; otherwise users may distrust why they see something.
- **Realtime churn:** Full live updates can make the feed jump; use a new-activity pill and user-controlled insertion.
- **Moderation gap:** Uploaded images remain deferred until reporting/moderation is stronger.
- **Ad scope creep:** Admin-curated placements are v1; self-serve paid ads need a later monetization/safety phase.

## Recommended Next Step

Before implementation, create the formal Phase 12 planning set:

1. `12-CONTEXT.md` from the discussion log and roadmap.
2. `12-RESEARCH.md` focused on current social tables, RLS, activity emitters, search_vector, and existing Antenna opportunities.
3. `12-UI-SPEC.md` for the net-new Green Room feed screen.
4. `12-VALIDATION.md` with adversarial tests for visibility, block, repost, and custom audience behavior.
5. Plan files `12-01` through `12-10`, or consolidate if the team decides to cut the first implementation slice.
