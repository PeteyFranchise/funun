# Writer's Room Section Comments — Quick Plan

## Objective

Ship the first Stage 4 Writer's Room collaboration slice: private, section-level comment threads that let song members leave comments, reply, mention other song participants, resolve or reopen threads, and see updates without refreshing.

## Scope

- Store comments against one canonical lyric block and work.
- Support one-level threaded replies and reversible resolve/reopen state.
- Resolve `@handle` mentions only against current song participants; unrecognized handles remain plain text.
- Keep comment text and mention identities private to the work's owner and members.
- Use the existing Writer's Room private broadcast channel as an invalidation hint; the database remains canonical.
- Add concise, trigger-sourced diary events for a new thread and thread resolution/reopening.
- Add a Comments action to original lyric sections and a focused comments panel with loading, empty, error, reply and resolution states.
- Keep split percentages, contracts, identities, rights, approved metadata, identifiers and audio outside this workflow.

## Files Expected to Change

- `supabase/migrations/146_writer_room_section_comments.sql`
- `types/catalogue.ts`
- `lib/catalogue/room-collaboration.ts`
- `lib/catalogue/diary.ts`
- `app/api/works/[workId]/blocks/[blockId]/comments/route.ts`
- `app/api/works/[workId]/blocks/[blockId]/comments/[commentId]/route.ts`
- `components/catalogue/LyricCommentsPanel.tsx`
- `components/catalogue/LyricBlockCard.tsx`
- `components/catalogue/LyricsPad.tsx`
- `components/catalogue/WriterRoomPresence.tsx`
- `components/catalogue/WorkPage.tsx`
- Focused migration, API, collaboration, diary and component tests
- This quick task's `SUMMARY.md` and production-activation TODO

## Validation Plan

- Migration text/contract tests for schema, RLS, grants, integrity triggers and diary capture.
- API tests for authentication, owner/member access, block/work binding, body limits, participant-only mentions, replies and resolve/reopen authorization.
- UI tests for section affordance, thread rendering, reply, mentions and resolve/reopen states.
- Collaboration tests for comment invalidation hints.
- Diary tests for comment-created, resolved and reopened entries.
- TypeScript, focused ESLint and focused Jest.
- Production build only if no development server is running; otherwise stop at typecheck/lint/tests per the repo's recorded `.next` safety rule.

## Risks and Coordination Notes

- The worktree contains unrelated user/Claude changes; stage and commit only files owned by this quick task.
- Migration 146 is forward-only and must not edit already-applied migration 145.
- Mentions are creative routing, not legal notice, consent or approval.
- Comments do not edit lyrics and never bypass section locks or recovery history.
- Realtime messages carry ids only; every client re-fetches canonical member-authorized data.
