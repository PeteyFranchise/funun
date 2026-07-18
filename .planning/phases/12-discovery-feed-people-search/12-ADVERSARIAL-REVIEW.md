# Phase 12 Adversarial Review

**Reviewed:** 2026-07-18
**Scope:** Current Green Room feed branch through 12-10, including post-review follow-up fixes for interactions, custom audiences, and admin placements.

## Review Focus

- Direct API access to feed, post, comment, reaction, repost, and placement data.
- Server-side visibility and RLS dependence.
- Bidirectional block enforcement.
- Private profile or linked-object leakage.
- Repost privacy and stale visibility.
- Realtime row leakage.
- Admin placement labeling and active-window behavior.

## Findings

### Fixed: Blocked members could still see each other's interaction rows on shared posts

`green_room_comments`, `green_room_reactions`, and `green_room_reposts` all inherited
post visibility through `green_room_can_view_post(...)`, but their SELECT policies did
not also require `no_block(viewer, interaction_author)`. That meant two members who had
blocked each other could still read each other's comments/reactions/reposts on a third
member's public post.

Fix:

- Added `public.no_block(auth.uid(), author_id)` to the comment and repost SELECT policies.
- Added `public.no_block(auth.uid(), user_id)` to the reaction SELECT policy.
- Added forward migration `060_green_room_block_visibility_and_audience_roles.sql` so
  already-applied databases receive the same policy fix.
- Regression coverage lives in `__tests__/migration-057.test.ts`; the focused and broad
  Green Room suites are green after the change.

### Fixed: Custom-audience role matching was weaker in RLS than in app logic

The app-side audience matcher treated `audience.roles` as matching both
`artist_profiles.industry_roles` and the structured `artist_profiles.roles` JSON field.
The database helper `green_room_post_matches_custom_audience()` only checked
`industry_roles`, so viewers whose matching role lived only in the JSON profile-role
field could be allowed by local logic but denied by RLS.

Fix:

- Expanded `green_room_post_matches_custom_audience()` to match:
  - `industry_roles`
  - preset role slugs in `artist_profiles.roles`
  - custom role labels in `artist_profiles.roles`
- Added forward migration `060_green_room_block_visibility_and_audience_roles.sql`.
- Regression coverage lives in `__tests__/migration-057.test.ts`.

### Fixed: Admin placements could surface blocked public destinations

Placement activation/visibility checks ensured the destination was public/active, but
for profile/project/track/opportunity/post destinations they did not additionally check
whether the destination owner was blocked in either direction for the current viewer.
That allowed a blocked but otherwise public destination to appear as a placement card.

Fix:

- Extended `isDestinationVisible()` in `lib/green-room/placements-admin.ts` to accept
  an optional viewer and call `no_block(viewer, owner)` for viewer-facing checks.
- Updated `filterVisiblePlacementRows()` and feed placement loading to pass the viewer id.
- Regression coverage lives in `__tests__/green-room-feed-api.test.ts` and
  `__tests__/green-room-placements-admin.test.ts`.

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

## Current Status

- Feed reads return typed cards and use explicit author profile columns.
- Comment, reaction, and repost reads/writes use session-bound clients and now hide
  blocked interaction authors at the RLS layer.
- Realtime only increments a pending count and reloads through `/api/green-room/feed`; it does not insert raw rows into the UI.
- Placement cards render explicit labels and explanation text.
- Custom audience rules are stored separately and enforced through `green_room_can_view_post()`
  plus role parity in `green_room_post_matches_custom_audience()`.
- The branch now includes the Jest discovery guard that ignores stale `.claude/worktrees`
  duplicates, so `npm test -- --runInBand green-room` is clean in this checkout.

## Residual Risks Before Wider Launch

- Rate limiting is still needed for posts, comments, reactions, reposts, and reports.
- Report/mute UI is not fully implemented; Phase 12 now has guardrails, while Phase 13 owns the full Trust & Safety surface.
- People Search still depends on explicit public-safe column selection and app-level
  `is_public`/block exclusion because `artist_profiles` remains broadly readable by RLS.
- Browser-only UAT remains for People Search visual behavior and admin placement lifecycle
  confirmation (`12-BROWSER-UAT-CHECKLIST.md`).
