# Green Room Feed Planning

## Objective

Add a GSD-aligned plan for a Green Room feed/home surface because the current Wave 4 roadmap covers profiles, search, discovery, network management, notifications, and DMs, but does not explicitly define a browsable feed of public posts/activity from other members.

## Scope

- Confirm whether a feed is already covered by existing Phase 12/13 requirements.
- Add feed requirements to the Wave 4 requirements document if missing.
- Update the roadmap so the feed is integrated into the correct upcoming phase.
- Capture the product navigation decision: "The Green Room" should be a primary left-side app navigation item whose default destination is the feed.
- Keep this as planning-only work; do not implement feed UI/API/schema in this quick task.

## Files Expected To Change

- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/PROJECT.md`
- `.planning/quick/260715-green-room-feed-plan/DISCUSSION-LOG.md`
- `.planning/quick/260715-green-room-feed-plan/SUMMARY.md`

## Validation Plan

- Re-read the updated roadmap sections for Phase 12 and Phase 13.
- Grep for `FEED-` requirement IDs to confirm traceability is present.
- Confirm `git status --short --branch` so the planning diff is explicit.

## Risks / Coordination Notes

- Feed scope can sprawl into full social-network complexity quickly. Phase 12 should ship a v1 feed that reads existing public activity/wall/release signals before inventing a large new ad marketplace.
- The Phase 12 route should have one canonical feed destination, likely `/green-room` or `/green-room/feed`; secondary entry points should deep-link there instead of creating competing feed implementations.
- Monetization/ad slots should be designed as reserved placements and moderation contracts in v1, not paid self-serve buying flows yet.
- Trust & Safety from Phase 13 must remain a dependency for broader exposure: blocks, reports, visibility, and moderation need to govern feed distribution.
