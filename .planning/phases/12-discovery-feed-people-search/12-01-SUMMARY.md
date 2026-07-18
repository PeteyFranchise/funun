# Plan 12-01 Summary: Feed Domain Contracts

## What Changed

- Added `lib/green-room/feed.ts` — the pure TypeScript contract layer for The Green Room feed, authored before any schema/API/UI work.
- Exported post-type, visibility, reaction, linked-object, tab, and audience-relationship values as readonly arrays plus union types, each with an `isX()` type guard.
- Added custom-audience normalization (`normalizeCustomAudience`, `summarizeAudience`) supporting relationship/role/genre/location/specific-person targeting, with empty and over-broad audiences rejected and complexity capped.
- Added pure, server-side-ready visibility and repost checks (`matchesCustomAudience`, `canViewerSeePost`, `canRepost`): blocked users never pass, drafts are owner-only, and reposts fail on disabled resharing, unavailable/draft/custom originals, or an unseeable original.
- Added transparent ranking (`scoreFeedCard`, `explainFeedCard`) using relationship/relevance/recency/engagement/placement inputs, with explicit sponsored/featured labels that never imply self-serve ads.
- Added `__tests__/green-room-feed.test.ts` (14 tests) covering value guards, audience normalization, draft privacy, block exclusion, custom-audience matching, repost safety, and ranking labels — no Supabase/network access.

## Validation Run

- `npm test -- --runInBand __tests__/green-room-feed.test.ts`
- `npm run lint`
- `npx tsc --noEmit`

## Notes

- Backfilled 2026-07-18 for GSD consistency (12-03…12-10 already had summaries); the code shipped in commit `7106c0b` "feat: add green room feed contracts".
- Requirements: FEED-01, FEED-02, FEED-03, FEED-05, FEED-06.
- This module is the domain foundation every later Phase 12 plan builds on — the schema (12-02) mirrors its visibility model in `green_room_can_view_post()`, and the feed API (12-03) reuses its ranking/label helpers.
