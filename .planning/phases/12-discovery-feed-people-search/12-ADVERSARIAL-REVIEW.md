# Phase 12 Adversarial Review

**Reviewed:** 2026-07-15
**Scope:** Current Green Room feed branch through 12-08, plus next-step readiness for 12-09 People Search and 12-10 Admin Placements.

## Review Focus

- Direct API access to feed, post, comment, reaction, repost, and placement data.
- Server-side visibility and RLS dependence.
- Bidirectional block enforcement.
- Private profile or linked-object leakage.
- Repost privacy and stale visibility.
- Realtime row leakage.
- Admin placement labeling and active-window behavior.

## Findings

### Fixed: Expired admin placements could pass the app-level query

`green_room_placements` RLS correctly limits placement reads to active rows whose `starts_at <= now()` and whose `ends_at` is null or in the future. The app feed query checked `status = active` and `starts_at <= now()`, but did not mirror the `ends_at` expiration condition.

Impact was limited because the normal feed route uses the authenticated session client and RLS still protects reads. However, the service layer should explicitly model the same active-window rule before admin tooling expands.

Fix:

- Added `buildPlacementWindowPredicate()` in `lib/green-room/feed-query.ts`.
- Applied it in `loadPlacementCards()`.
- Added regression coverage in `__tests__/green-room-feed-api.test.ts`.

### Previously Fixed: RLS-visible follower/connection reposts were falsely denied

The repost service loaded the original post through session-client RLS, then called the pure `canRepost()` helper without follower/connection context. That could reject eligible follower/connection-visible posts after RLS had already proven the viewer could see the original.

Fix:

- `lib/green-room/repost.ts` now treats the RLS-loaded original as relationship-eligible for follower/connection visibility while still blocking draft, custom, disabled, deleted, hidden, or unpublished originals.
- Regression coverage lives in `__tests__/green-room-reposts-api.test.ts`.

## No New Blocking Findings

- Feed reads return typed cards and use explicit author profile columns.
- Comment, reaction, and repost reads/writes use session-bound clients and inherit post visibility through RLS.
- Realtime only increments a pending count and reloads through `/api/green-room/feed`; it does not insert raw rows into the UI.
- Placement cards render explicit labels and explanation text.
- Custom audience rules are stored separately and enforced through `green_room_can_view_post()`.

## Residual Risks Before Wider Launch

- Rate limiting is still needed for posts, comments, reactions, reposts, and reports.
- Report/mute UI is not fully implemented; Phase 12 now has guardrails, while Phase 13 owns the full Trust & Safety surface.
- People Search must use explicit public-safe columns and block/non-public exclusion from day one.
- Admin placement creation must validate destination visibility before activation.

