# Phase 12 PR Review Packet

**Audience:** Thomas
**Prepared:** 2026-07-18
**Branch:** `codex/phase-11-presence-messaging`
**Scope:** Green Room feed foundation through Wave 5, plus the full adversarial-review follow-up fix set and Jest cleanup needed for stable broad-suite validation.

## Review Goal

Confirm the current Phase 12 branch is safe to merge now that People Search, admin placements, and the adversarial follow-up fixes are all in place.

## What Changed

- Added the Green Room feed domain contracts: post types, visibility modes, reactions, custom audience validation, ranking labels, repost eligibility, and helper tests.
- Added migration `057_green_room_feed.sql` for posts, custom audiences, comments, reactions, reposts, admin placements, RLS helpers, indexes, and lifecycle fields.
- Added `/api/green-room/feed` with typed feed cards, tab modes, cursor support, placement insertion, and session-client RLS enforcement.
- Added `/api/green-room/posts` for structured composer writes, draft/publish behavior, custom audience storage, and linked-object validation.
- Added comments, reactions, and repost APIs plus Green Room UI primitives.
- Added `/green-room` and left-nav entry point labeled `The Green Room`.
- Added realtime new-activity pill behavior that never inserts unseen rows directly into the client feed.
- Fixed a repost false denial where follower/connection-visible posts could be blocked by app-level checks even after RLS allowed the original read.
- Fixed interaction-row visibility so blocked members cannot read each other's comments,
  reactions, or reposts on shared third-party posts.
- Fixed custom-audience role parity so database enforcement matches both
  `industry_roles` and profile `roles` JSON semantics.
- Fixed placement destination checks so blocked public destinations do not render as feed cards.
- Added migration `060_green_room_block_visibility_and_audience_roles.sql` to apply those
  fixes to already-live databases.
- Updated `jest.config.js` to ignore duplicate tests under `.claude/worktrees`, which
  restored a clean `npm test -- --runInBand green-room` run for this checkout.

## Files To Prioritize In Review

- `supabase/migrations/057_green_room_feed.sql`
- `supabase/migrations/060_green_room_block_visibility_and_audience_roles.sql`
- `lib/green-room/feed.ts`
- `lib/green-room/feed-query.ts`
- `lib/green-room/post-write.ts`
- `lib/green-room/placements-admin.ts`
- `lib/green-room/repost.ts`
- `lib/green-room/realtime.ts`
- `jest.config.js`
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
- Confirm blocked members cannot read each other's interaction rows on shared posts.
- Confirm custom-audience role rules behave the same in SQL as they do in app-side logic.
- Confirm broader Jest runs ignore stale `.claude/worktrees` duplicates.

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

**Live verification performed:** migrations `058`, `059`, and `060` were pushed to the
remote database on **July 18, 2026**, and `supabase migration list` shows LOCAL=REMOTE
through `060`. Discover auth gate returns 401 unauthenticated; the full discover query
shape executes against real Postgres (HTTP 200); a jsonb `open_to` containment bug was
caught by live smoke testing and fixed to the JSON-string form; private columns are
DB-blocked (`42501`). Focused adversarial regression slice is green; broader
`npm test -- --runInBand green-room` now passes cleanly in this checkout after ignoring
stale `.claude/worktrees` duplicates.

## July 18 Follow-up Update

Additional commits on this branch:

- `306eedd` — `fix(12): close adversarial review follow-ups`
- `656a307` — `test: ignore codex worktree duplicates in jest`

These close the three confirmed follow-up findings:

- blocked interaction-row visibility on shared posts
- custom-audience role parity at the SQL layer
- blocked public destinations rendering as placements

**Remaining Wave 5 UAT** (needs a logged-in / admin browser session — see `12-UAT.md`):
1. People Search results correct + privacy-safe (block exclusion both directions, no PII, action gating).
2. Admin placement create→activate visibility gate (private destination rejected 409; public succeeds; pause/archive lifecycle; non-admin 403).

## Known Follow-Ups

- Minimum report/remove/mute controls need to be nailed down before opening wider posting behavior.
- Full trust and safety, including reporting dashboard, block management UI, verified-badge admin grant, and profile visibility settings, remains Phase 13.
- `12-09-SUMMARY.md` and `12-10-SUMMARY.md` are in place (backfilled for GSD consistency with 12-03…12-08).
- Browser-only UAT remains the last non-code sign-off step for People Search rendering and
  admin placement lifecycle confirmation.
