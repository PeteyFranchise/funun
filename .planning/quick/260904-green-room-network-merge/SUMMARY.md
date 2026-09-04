# Green Room and Network merge summary

## What changed

- Made The Green Room the single member-facing social destination with three URL-addressable spaces: The Room, Find People, and My Network.
- Preserved the feed's For You, Following, Discover, and Opportunities filters inside The Room.
- Moved People Search into a full-width discovery view and added a direct Connect action so discovered members can become managed relationships.
- Embedded the existing relationship manager as My Network, with Connections, Following, Followers, Pending, and a quieter Safety view.
- Lazy-loaded People Search and My Network so their API calls and component bundles are not loaded while a member is simply reading the room.
- Removed Network as a separate sidebar item and made the Green Room nav item active for legacy `/network` paths.
- Preserved `/network` as a redirect to `/green-room?view=network` for old bookmarks and notifications.
- Applied the existing Green Room viewer gate to people discovery, network reads, and block/unblock mutations.

## Validation run

- Focused Jest: 5 suites, 55 tests passed.
- Full Jest: 444 suites, 4,169 tests passed.
- TypeScript: passed.
- ESLint: passed with zero warnings.
- Next.js production build: passed (122 static pages generated).
- Local browser shell: `/green-room` returned 200 with no build overlay; the isolated browser correctly received 401 for member feed data without a signed-in cookie.
- `git diff --check`: passed.

## Remaining risks or follow-ups

- The implementation is local until committed and deployed.
- No database migration is required.
- The top-level My Network view intentionally does not preload a pending-request count; doing so would violate the chosen lazy-load behavior. Existing notification surfaces and the Pending count inside My Network remain authoritative.
