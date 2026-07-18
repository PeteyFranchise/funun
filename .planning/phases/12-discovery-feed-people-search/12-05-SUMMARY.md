# Plan 12-05 Summary: Comments & Reactions

## What Changed

- Added Green Room comments API at `/api/green-room/posts/[postId]/comments`.
- Added Green Room reactions API at `/api/green-room/posts/[postId]/reactions`.
- Added `FeedActions` and `CommentComposer` UI primitives for the later feed screen.
- Moved reaction labels into the pure Green Room feed contract layer so tests and components share one source of truth.
- Added focused tests for auth, empty/nested comment rejection, scoped comment delete, reaction validation, single active viewer reaction replacement, and viewer reaction removal.

## Validation Run

- `npm test -- --runInBand __tests__/green-room-interactions-api.test.ts`
- `npm run lint`
- `npx tsc --noEmit`

## Notes

- Comments and reactions use the session-bound Supabase client. Migration `057` RLS remains the backstop for post visibility, custom audience, moderation state, deletes, and bidirectional block checks.
- Nested comments remain explicitly deferred for v1.
- The API contract treats viewer reaction as one active reaction per post even though the database primary key permits multiple reaction types.

