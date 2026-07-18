# Plan 12-08 Summary: Realtime Feed Updates

## What Changed

- Added `lib/green-room/realtime.ts` for Green Room feed Realtime subscriptions and event filtering.
- Added user-controlled new-activity pill behavior to `GreenRoomFeed`.
- Added focused tests for unpublished-event filtering, opportunity-tab filtering, channel cleanup, and pill/API reload behavior.

## Validation Run

- `npm test -- --runInBand __tests__/green-room-realtime.test.ts`
- `npm run lint`
- `npx tsc --noEmit`

## Notes

- Realtime never inserts cards directly into the feed.
- Incoming events only increment a pending activity count.
- Clicking the pill reloads through `/api/green-room/feed`, preserving server-side visibility and block checks.
- The subscription cleanup returns `supabase.removeChannel(channel)` on unmount/tab change.

