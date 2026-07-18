# Phase 12 Adversarial Follow-ups Summary

## What Changed

- Tightened `green_room_post_matches_custom_audience()` in `057_green_room_feed.sql` so database-enforced role targeting now matches both `artist_profiles.industry_roles` and `artist_profiles.roles` JSON entries (preset slugs plus custom labels), aligning RLS with the app contract.
- Added `public.no_block(...)` checks to the comment, reaction, and repost SELECT policies in `057_green_room_feed.sql` so blocked members no longer see each other's interaction rows on shared third-party posts.
- Added forward migration `060_green_room_block_visibility_and_audience_roles.sql` so already-applied databases receive the same custom-audience and interaction-visibility fixes.
- Extended placement destination checks in `lib/green-room/placements-admin.ts` and `lib/green-room/feed-query.ts` to suppress otherwise-public placements when the destination owner is blocked in either direction for the current viewer.
- Added regression coverage for blocked placement suppression, viewer-block-aware destination checks, migration policy strings, and custom-audience role parity.

## Validation Run

- `npm test -- --runInBand --runTestsByPath __tests__/green-room-feed-api.test.ts __tests__/green-room-placements-admin.test.ts __tests__/migration-057.test.ts __tests__/green-room-interactions-api.test.ts __tests__/green-room-reposts-api.test.ts` — passed, 5 suites / 60 tests.

## Remaining Risks / Follow-ups

- `supabase/migrations/060_green_room_block_visibility_and_audience_roles.sql` still needs to be applied to the target Supabase database before the database-level fixes are live outside local source control.
- Pre-existing untracked planning artifacts in `.planning/phases/12-discovery-feed-people-search/12-BROWSER-UAT-CHECKLIST.md`, `.planning/phases/13-network-trust-safety/13-EXECUTION-PACKET.md`, and `.planning/quick/260718-phase13-uat-prep/` were left untouched.
