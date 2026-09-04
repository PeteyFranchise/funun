# Ideas Inbox and Capture System — Plan

## Objective

Create a private, capture-first Ideas layer that can hold an unnamed voice-note-style spark before it becomes a Writer's Room, then preserve its recordings, branches, contributions, comments, organization, and provenance when it is promoted.

## Locked product boundary

- The default path is always `Record → Stop → Done or Record another`.
- No title, beat, metadata, setup, analysis, collaborator, rights fact, or organizational choice is required before capture.
- Advanced actions appear only after an idea is durable.
- The visual Idea Canvas is explicitly tabled. This build must not introduce a board, node graph, drag canvas, or decide its UI without a separate owner-approved mockup.

## Scope

- Add a private Ideas Inbox, a dedicated navigation entry, recent/active organization, search, pin/snooze/archive, moods, notes, transcript text, references, and immutable original recordings.
- Add quick microphone capture with pause/resume, tap markers, automatic naming, immediate signed upload, file import, downloads, and clear sync/error recovery.
- Add linear idea development: append recordings, branch an idea, relate child ideas, comments at exact recording moments, and private member permissions.
- Add optional collaborator contribution invites for claimed Funūn accounts and notification deep links.
- Add promotion into a new or existing Writer's Room while preserving the idea, audio lineage, contributor identity, timestamps, and a reversible link back to the source idea; do not infer splits or rights.
- Add private export manifests, derived resurfacing/next-move/similarity suggestions, and contribution receipts from canonical activity.
- Add security contract tests, helpers, focused UI tests, full type/lint/test/build verification, and operator migration instructions.

## Expected files

- `supabase/migrations/169_ideas_inbox.sql`
- `lib/ideas/*`
- `app/api/ideas/**`
- `app/(artist)/ideas/**`
- `components/ideas/**`
- Artist navigation and icons
- Migration, route, helper, and component tests
- This task's `SUMMARY.md`

## Validation

- Verify strict path binding, stored-object validation, size/type limits, retry idempotence, and short-lived signed URLs.
- Verify owner/member read boundaries, permission ordering, caller-bound writes, private-by-default behavior, and service-only promotion/invite mutations.
- Verify promotion never creates splits, rights, registration, approval, master, or release state.
- Verify quick capture has no required metadata and that unsupported/denied recording degrades to file import.
- Run focused Jest, `npm run typecheck`, zero-warning ESLint, full Jest, production Next.js build, and `git diff --check`.

## Coordination and deployment

- Migration 169 is human-applied and must land before the UI/API deployment.
- Manual GSD quick fallback is used because Codex cannot invoke Claude's native `/gsd-quick` slash command in this environment.
