# Plan 12-07 Summary: Green Room Page, Nav & Cards

## What Changed

- Added `The Green Room` to the left navigation at `/green-room`.
- Added the canonical `/green-room` page shell.
- Added `GreenRoomFeed` with For You, Following, Discover, and Opportunities tabs calling one feed endpoint.
- Added `GreenRoomComposer` wired to `/api/green-room/posts`.
- Added `FeedCard` rendering post and placement cards, with comments, reactions, and repost controls wired to the new interaction APIs.
- Added a lightweight `GreenRoomIcon` to the nav icon set.
- Added source-level UI contract tests for the route, nav item, tab modes, and backend endpoint wiring.

## Validation Run

- `npm test -- --runInBand __tests__/green-room-ui-contract.test.ts`
- `npm run lint`
- `npx tsc --noEmit`

## Notes

- This is the first functional Green Room UI shell, not the final visual polish pass.
- Tabs are query modes over `/api/green-room/feed`, not separate feed systems.
- The page uses real API endpoints and no fake feed data.

