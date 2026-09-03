# Timed track comments

## Objective

Let Writer's Room members play an uploaded take, attach threaded comments to exact timestamps, mention current room members, resolve/reopen notes, and explicitly choose which unresolved notes to carry to a newly added version.

## Scope

- Add version-scoped timed-comment and carry-review persistence with RLS and guarded RPC writes.
- Add authenticated APIs for listing, creating, resolving, and selectively carrying comments.
- Replace the basic version audio control with a compact seekable player, markers, threads, and mention composer.
- Offer `Review unresolved notes` or `Start fresh` on the newest version; never carry notes automatically.
- Broadcast version-comment changes through the existing private Writer's Room realtime channel.

## Files expected to change

- `supabase/migrations/160_writer_room_timed_track_comments.sql`
- `types/catalogue.ts`
- `lib/catalogue/comments.ts` and focused tests
- `app/api/works/[workId]/versions/[versionId]/comments/**`
- `components/catalogue/TimedTrackPlayer.tsx` and focused tests
- `components/catalogue/WorkPage.tsx`
- `components/catalogue/WriterRoomPresence.tsx`
- `lib/catalogue/room-collaboration.ts` and tests

## Validation plan

- Run focused component and pure-helper tests.
- Run the full Jest suite, TypeScript typecheck, and ESLint.
- Do not run `next build` while the owner's dev server may be using the shared `.next` directory.
- Inspect the migration and final git diff/status without applying the migration automatically.

## Risks and coordination notes

- Preserve the unrelated unfinished existing-take-picker files already present in the worktree.
- Comments are creative discussion only and must not change audio, credits, rights, splits, or approvals.
- Carry-forward copies only selected unresolved root notes from the immediately previous version, preserves author/body/timestamp, and records provenance. An explicit empty selection records `Start fresh`.
- Timestamps are validated against the target recording duration when that duration is known.
