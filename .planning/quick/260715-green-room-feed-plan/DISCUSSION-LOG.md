# Green Room Feed Discussion Log

**Date:** 2026-07-15
**Context:** User-led GSD planning discussion while Claude was unavailable.
**Topic:** Add The Green Room feed as the landing destination for Wave 4's network layer.

## Locked Product Direction

The Green Room should be a first-class room in the authenticated app, surfaced as a primary item in the left-side navigation. Clicking **The Green Room** should land the user on a feed-first hybrid Green Room home.

Recommended canonical route: `/green-room`

Future subroutes can grow underneath that room, for example:

- `/green-room/discover`
- `/green-room/network`
- `/green-room/opportunities`
- `/green-room/feed` only if a separate feed subroute becomes necessary later

Secondary entry points, such as dashboard cards or header shortcuts, should route to the same canonical Green Room destination rather than creating duplicate feed surfaces.

## Decisions

1. **Landing shape:** Hybrid landing page. Feed is the main center column, with discovery/search modules and suggested people/opportunities around it.
2. **Center feed content:** Mixed professional timeline. It combines user posts, public milestones, public releases, endorsements, and connection-worthy moments.
3. **Composer:** Robust guided composer. It feels like a simple "Share an update" box, but every post has a structured type behind the scenes.
4. **Composer types:** Support types such as General update, Looking for collaborators, Release announcement, Question, Win/milestone, Looking for feedback, and Opportunity/need.
5. **Visibility model:** Support Public, Followers, Connections, Draft, and Custom Audience.
6. **Custom audience:** Full custom audience: relationships, roles, genres, locations, and specific people.
7. **Custom audience access:** Available to everyone with safety limits, clear labels, spam controls, and capped audience complexity. Advanced paid promotion remains separate.
8. **Ranking:** Smart but transparent. Rank by relationship strength, freshness, and relevance, with labels such as "From your network", "Popular in R&B", or "Music supervisors near you".
9. **Sponsored/ads V1:** Admin-curated featured/sponsored placements first, designed with the intent to support self-serve ads later.
10. **Featured placement types:** Admins can feature members, public releases/projects, opportunities/open calls, partner cards, curated programs, and future paid placements.
11. **Comments/replies:** Lightweight comments on feed posts in V1, similar to LinkedIn, with no nested replies initially unless later planning says otherwise.
12. **Reactions:** Facebook/Instagram-style reactions, using a compact professional reaction set: Like, Love, Fire, Congrats, Inspired, Helpful, Interested.
13. **Attachments V1:** Text plus linked Funūn objects: profiles, releases/projects, public tracks, and opportunities. Uploaded images come later once moderation/reporting is stronger.
14. **Resharing:** Full repost/share support is in scope, but must ship with strong safeguards.
15. **Reshare safeguards:** Only eligible public content can be reshared; blocked users cannot reshare/see each other; original author attribution is clear; owners can disable resharing, remove reshares of their content, report reposts, mute reposts from specific people, and reshared content disappears if original visibility changes.
16. **Real-time behavior:** Full real-time feed updates, implemented with gentle controls: show a "new posts" pill, animate new items into the top area, and let the user choose when to jump back up.
17. **Tabs/sections:** Launch with a few clear tabs, then plan toward more specialized tabs after more discussion.
18. **Launch tabs:** For You, Following, Discover, Opportunities. Sponsored content lives as labeled placements, not a dedicated Sponsored tab in V1.
19. **Opportunities model:** Hybrid. Formal opportunities stay in Antenna; lighter collab/opportunity posts can live in the feed and may later graduate into Antenna.
20. **Account-type experience:** Same Green Room structure for artists and industry members, but ranking/emphasis changes by capability/role. Artists see more opportunities, collabs, and release activity; industry members see more artists, releases, and opportunity-relevant signals.

## Product Definition

The Green Room is the professional network home for Funūn: a feed-first space where members see public and audience-appropriate activity from people they follow or connect with, discover relevant artists and industry pros, and take lightweight actions like follow, connect, message, comment, react, reshare, view profile, or open a release/opportunity.

## Implementation Notes For Phase 12 Planning

- Keep one canonical feed query/service layer; tabs should be query modes, not separate feed implementations.
- Treat visibility and audience targeting as server-enforced authorization, not UI filtering.
- Treat all feed reads as adversarial: blocked users, non-public profiles, non-public releases, changed visibility, deleted originals, muted reposts, and custom audiences must be enforced server-side.
- Do not build full self-serve ad buying in Phase 12. Build the placement abstraction so admin-curated sponsored cards can evolve into paid campaigns later.
- Do not add uploaded media until moderation/reporting is strong enough to handle image abuse.
