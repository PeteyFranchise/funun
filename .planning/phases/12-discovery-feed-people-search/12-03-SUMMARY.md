# Plan 12-03 Summary: Feed Read API

## What Changed

- Added `/api/green-room/feed` as the authenticated read endpoint for Green Room feed cards.
- Added `lib/green-room/feed-query.ts` with typed post/placement card shaping, tab modes, opaque cursor pagination, relationship-aware filtering, interaction counts, transparent explanation labels, and curated placement insertion.
- Added focused API/helper tests in `__tests__/green-room-feed-api.test.ts`.

## Validation Run

- `npm test -- --runInBand __tests__/green-room-feed-api.test.ts`
- `npm run lint`
- `npx tsc --noEmit`

## Notes

- The route uses the session-bound Supabase client so migration `057` RLS and `green_room_can_view_post()` remain the authoritative visibility, custom-audience, moderation, delete, and block checks.
- The API returns typed cards only; raw database rows are not exposed.
- Placement cards are labeled and server-owned; no self-serve ad buying, billing, targeting, or analytics behavior was added.

