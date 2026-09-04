# Green Room and Network merge

## Objective

Make The Green Room the single member-facing social destination, with distinct Room, Find People, and My Network views, while preserving relationship-management behavior and legacy links.

## Scope

- Add a Green Room hub shell with URL-addressable primary views.
- Keep feed filters nested within the Room view.
- Move the existing People Search into a full-width Find People view.
- Embed the existing Network manager as My Network and load it only when selected.
- Remove the separate Network sidebar item.
- Redirect `/network` to the Green Room network view for bookmarks and old links.
- Apply the same Green Room viewer gate to the Network read and block-management APIs.

## Files expected to change

- `app/(artist)/green-room/page.tsx`
- `app/(artist)/network/page.tsx`
- `components/green-room/GreenRoomHub.tsx`
- `components/green-room/GreenRoomFeed.tsx`
- `components/green-room/PeopleSearch.tsx`
- `components/network/NetworkTab.tsx`
- `components/nav/ArtistNav.tsx`
- `app/api/network/route.ts`
- `app/api/network/blocks/route.ts`
- `app/api/green-room/discover/route.ts`
- Relevant Green Room, navigation, and Network tests

## Validation plan

- Verify the three primary Green Room views and URL mapping.
- Verify `/network` redirects to `/green-room?view=network`.
- Verify Network is no longer a separate sidebar item.
- Verify Network APIs reject unauthenticated and non-Green-Room principals before data access or mutation.
- Run focused Jest, TypeScript, ESLint, full Jest, production build, and `git diff --check`.

## Risks and coordination notes

- Do not merge the feed and relationship data layers; preserve their separate APIs and RLS assumptions.
- Do not load Network data until My Network is opened.
- Keep Collaborators separate because it represents song/work relationships rather than the social graph.
- No database migration is expected.
