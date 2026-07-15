# Phase 12 PR Review Packet

**Audience:** Thomas
**Prepared:** 2026-07-15
**Branch:** `codex/phase-11-presence-messaging`
**Scope:** Green Room feed foundation through realtime update pill, plus the repost eligibility fix found during adversarial review.

## Review Goal

Confirm the current Phase 12 branch is safe to merge before People Search, admin placements, and broader moderation work continue.

## What Changed

- Added the Green Room feed domain contracts: post types, visibility modes, reactions, custom audience validation, ranking labels, repost eligibility, and helper tests.
- Added migration `057_green_room_feed.sql` for posts, custom audiences, comments, reactions, reposts, admin placements, RLS helpers, indexes, and lifecycle fields.
- Added `/api/green-room/feed` with typed feed cards, tab modes, cursor support, placement insertion, and session-client RLS enforcement.
- Added `/api/green-room/posts` for structured composer writes, draft/publish behavior, custom audience storage, and linked-object validation.
- Added comments, reactions, and repost APIs plus Green Room UI primitives.
- Added `/green-room` and left-nav entry point labeled `The Green Room`.
- Added realtime new-activity pill behavior that never inserts unseen rows directly into the client feed.
- Fixed a repost false denial where follower/connection-visible posts could be blocked by app-level checks even after RLS allowed the original read.

## Files To Prioritize In Review

- `supabase/migrations/057_green_room_feed.sql`
- `lib/green-room/feed.ts`
- `lib/green-room/feed-query.ts`
- `lib/green-room/post-write.ts`
- `lib/green-room/repost.ts`
- `lib/green-room/realtime.ts`
- `app/api/green-room/feed/route.ts`
- `app/api/green-room/posts/route.ts`
- `app/api/green-room/posts/[postId]/comments/route.ts`
- `app/api/green-room/posts/[postId]/reactions/route.ts`
- `app/api/green-room/posts/[postId]/reposts/route.ts`
- `components/green-room/GreenRoomFeed.tsx`
- `components/green-room/FeedCard.tsx`
- `components/green-room/GreenRoomComposer.tsx`
- `components/nav/ArtistNav.tsx`

## Merge-Risk Checklist

- Verify migration `057` has been applied where expected and does not conflict with pending remote migrations.
- Confirm all Green Room reads use the session-bound Supabase client so RLS remains authoritative.
- Confirm no feed path returns raw `artist_profiles` rows or `activity_events.data` without explicit shaping.
- Confirm admin placements stay clearly labeled and do not imply self-serve ads.
- Confirm custom audience summaries do not reveal audience member counts or identities.
- Confirm realtime only shows a count/pill and always reloads through `/api/green-room/feed`.
- Confirm reposts are hidden when the original post is no longer visible by RLS.

## Validation Already Run

- `npm test -- --runInBand __tests__/green-room-feed.test.ts __tests__/green-room-feed-api.test.ts __tests__/green-room-posts-api.test.ts __tests__/green-room-interactions-api.test.ts __tests__/green-room-reposts-api.test.ts __tests__/green-room-ui-contract.test.ts __tests__/green-room-realtime.test.ts`
- `npm run lint`
- `npx tsc --noEmit`

## Known Follow-Ups

- People Search and Discover filters are planned in `12-09`.
- Admin placement management is planned in `12-10`.
- Minimum report/remove/mute controls need to be nailed down before opening wider posting behavior.
- Full trust and safety, including reporting dashboard, block management UI, verified-badge admin grant, and profile visibility settings, remains Phase 13.

