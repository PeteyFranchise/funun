# Green Room Feed Planning Summary

## What Changed

- Confirmed the prior Wave 4 plan did not explicitly include a Green Room feed/home surface.
- Added `FEED-01` through `FEED-05` to `.planning/REQUIREMENTS.md`.
- Mapped the new feed requirements to Phase 12.
- Renamed Phase 12 in `.planning/ROADMAP.md` from "Discovery & People Search" to "Discovery, Feed & People Search".
- Updated Phase 12 success criteria to include the feed, exploration actions, privacy/block exclusions, and future sponsored-slot readiness.
- Updated `.planning/PROJECT.md` so the milestone overview describes a Feed / Discover / Opportunities / Network shell.
- Captured the navigation decision that "The Green Room" should be a primary left-side navigation item, and its default destination should be the feed.
- Added `.planning/quick/260715-green-room-feed-plan/DISCUSSION-LOG.md` with the user-confirmed decisions from the one-by-one GSD planning discussion.
- Expanded feed scope from `FEED-01` through `FEED-06` to `FEED-01` through `FEED-18`, covering guided composer, visibility/custom audiences, transparent ranking, admin-curated sponsored placements, comments/reactions, linked Funūn object attachments, strongly safeguarded repost/share, real-time behavior, launch tabs, hybrid opportunities, and role-tuned experiences.

## Validation Run

- `rg -n "FEED-[0-9][0-9]|Discovery, Feed|Green Room feed|Feed / Discover" .planning/REQUIREMENTS.md .planning/ROADMAP.md .planning/PROJECT.md .planning/quick/260715-green-room-feed-plan/PLAN.md`
- `sed -n '20,95p' .planning/REQUIREMENTS.md`
- `sed -n '180,215p' .planning/ROADMAP.md`
- `git status --short --branch`

## Remaining Risks / Follow-Ups

- Phase 12 still needs full `/gsd-ui-phase` and implementation plans; this quick task only integrated feed into scope.
- The first feed should reuse existing public activity/wall/release signals where possible before adding a large new content model.
- Phase 12 should choose one canonical route, likely `/green-room` or `/green-room/feed`; any secondary entry point should route there instead of creating a second feed surface.
- Sponsored placement should stay as a reserved, clearly labeled slot in v1; self-serve ad buying, targeting, billing, and ad review need a later monetization/safety phase.
- Feed reads must be designed adversarially: block enforcement, profile visibility, non-public release leakage, and report/moderation paths all need explicit acceptance criteria.
- Because the selected V1 scope is now robust, Phase 12 decomposition should probably split feed into multiple plans: schema/helpers, feed read API/ranking, composer/visibility writes, comments/reactions/reposts, Green Room UI/tabs/nav, and sponsored/admin placements.
