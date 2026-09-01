# Writer's Room Section Soft Locks — GSD Quick Plan

## Objective

Ship Stage 2 of Writer's Room collaboration: writers can work concurrently in different lyric sections, see who holds a section, wait or explicitly take over a collision, and receive canonical saved lyrics without refreshing the page.

## Scope

- Add server-authoritative, expiring lyric-block leases keyed by work, block, user and browser-tab session.
- Make lock acquire/renew/release/takeover atomic and enforce the active lease on every lyric text save.
- Add private-room broadcast authorization for lock/save invalidation messages; receivers fetch canonical database state instead of trusting another client's payload.
- Show reserving, “you are editing,” other-writer lock, wait and warned-takeover states on each lyric card.
- Flush the debounced lyric save before releasing a section on blur.
- Renew active leases only while the tab is visible, release after a successful blur save, and expire hidden, disconnected or abandoned leases automatically.
- Add Presence heartbeats and stale-meta filtering to bound the ghost-presence defect found during production UAT.
- Keep formal rights and release facts out of the live channel and lock system.
- Produce a Claude-ready summary, migration/UAT todo and user-impact report.

## Non-goals

- Character-by-character merging, CRDT/OT, simultaneous editing inside one section or silent overwrite resolution.
- Recoverable lyric snapshots/version restoration (the next approved safety slice).
- Collaborative edits to splits, contracts, legal identity, approved metadata, identifiers, audio files or rights records.
- Collaborative notes/comments or session summaries.

## Expected files

- Migration 144 for the lock table/functions and private broadcast authorization.
- Lock API routes under `app/api/works/[workId]/` and locked lyric enforcement in the existing block route.
- `lib/catalogue/room-collaboration.ts` for payload/lease normalization and pure decisions.
- `WriterRoomPresence`, `WorkPage`, `LyricsPad` and `LyricBlockCard` integration.
- Focused migration, pure-module and static component tests.
- This quick plan, summary and production activation todo.

## Validation

- Prove atomic acquire, same-session renewal, collision response, explicit takeover and session-scoped release in migration contract tests.
- Prove unknown/stale broadcasts and expired locks cannot drive the UI.
- Render-test mine/other/acquiring section states and warned takeover copy.
- Run focused Jest suites, TypeScript, lint and production build.
- After migration 144: production UAT with three users editing separate sections, a same-section collision/takeover, a disconnected lease expiry and a live saved-lyric update without refresh.

## Risks and coordination

- Migration 144 remains human-gated; application code must fail safe when the migration is not yet applied.
- A broadcast is only an invalidation hint. Every lock and lyric displayed after a remote event is re-read from an authenticated API.
- The worktree contains unrelated user/Claude changes. Stage only files listed by this plan and do not modify active roadmap/deliberation work.
