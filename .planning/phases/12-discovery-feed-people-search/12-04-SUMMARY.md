# Plan 12-04 Summary: Composer Write API

## What Changed

- Added `/api/green-room/posts` for authenticated Green Room post creation.
- Added `lib/green-room/post-write.ts` for strict composer validation, draft/publish state handling, custom audience normalization, linked-object validation, and post/audience insertion.
- Added adversarial tests for malformed payloads, empty published posts, visibility spoofing, invalid custom audiences, private linked project rejection, and draft linked-object behavior.

## Validation Run

- `npm test -- --runInBand __tests__/green-room-posts-api.test.ts`
- `npm run lint`
- `npx tsc --noEmit`

## Notes

- Published posts validate linked Funun objects before insert. Draft posts can retain an unverified linked object reference, but still use `draft` visibility and no `published_at`.
- Custom audiences are only accepted with `custom` visibility and reuse the bounded `normalizeCustomAudience()` contract from `12-01`.
- The route uses the session-bound Supabase client so migration `057` RLS remains the database backstop for ownership and visibility.

