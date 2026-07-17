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
- Wave 5: `npm test -- --runInBand __tests__/green-room-discover.test.ts __tests__/green-room-discover-api.test.ts __tests__/green-room-placements-admin.test.ts __tests__/green-room-placements-admin-api.test.ts` (34 tests) — or `npm test -- --runInBand green-room` for the full 88-test suite.
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

## Wave 5 Update (2026-07-17)

Wave 5 is now implemented and pushed to this branch (commits `56d67f3`, `7807244`, `863b604`):

- **12-09 People Search / Discover filters** — `GET /api/green-room/discover` + a `PeopleSearch` module in the Green Room rail. Keyword (search_vector), role, open-to, genre, location, relationship, and member-type filters. Reads on the session client; the discover layer additionally enforces `is_public=true`, self-exclusion, and **bidirectional** block exclusion, and projects only public-safe columns (no PII). No schema change — reuses `search_vector` and the migration-040 public column grant.
- **12-10 Admin-curated placements** — admin CRUD over the existing `green_room_placements` table (migration 057): `GET/POST /api/admin/green-room/placements` + `PATCH/DELETE [id]` behind `verifyAdmin()` + service client, and `/admin/green-room-placements` UI (create/activate/pause/resume/archive/delete). A placement can only **activate** once its destination is confirmed public/visible; the destination is immutable via PATCH so the check cannot be bypassed. No self-serve ads/targeting/billing/analytics.

**Live verification performed:** migrations 054–057 confirmed live (LOCAL=REMOTE, remote up to date); discover auth gate returns 401 unauthenticated; the full discover query shape executes against real Postgres (HTTP 200); a jsonb `open_to` containment bug was caught by the live smoke test (`.contains` array form → HTTP 400 `22P02` on the JSONB column) and fixed to the JSON-string form (→ HTTP 200), regression-locked in tests; private columns are DB-blocked (`42501`). 34 new focused tests green; full green-room suite 88/88; tsc + lint + build clean.

**Remaining Wave 5 UAT** (needs a logged-in / admin browser session — see `12-UAT.md`):
1. People Search results correct + privacy-safe (block exclusion both directions, no PII, action gating).
2. Admin placement create→activate visibility gate (private destination rejected 409; public succeeds; pause/archive lifecycle; non-admin 403).

## Known Follow-Ups

- Minimum report/remove/mute controls need to be nailed down before opening wider posting behavior.
- Full trust and safety, including reporting dashboard, block management UI, verified-badge admin grant, and profile visibility settings, remains Phase 13.
- `12-09` and `12-10` shipped without a GSD `SUMMARY.md` (unlike 12-03…12-08); the PLAN + this packet + `12-UAT.md` are the record. Worth backfilling summaries if the phase is formally closed through GSD.

