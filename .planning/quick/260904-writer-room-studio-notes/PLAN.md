# Writer's Room studio notes

## Objective

Build the approved lightweight Studio Notes system so Writer's Room participants can leave persistent notes, @mention specific room members, attach notes to the whole song, an audio timestamp, or a lyric section, reply in threads, and resolve or reopen a discussion without turning songwriting into project management.

## Scope

- Add a private, participant-scoped whole-song note table with validated RPC-only writes, threaded replies, mention recipients, and reversible resolution.
- Add one validated reaction ledger spanning whole-song notes, audio comments, lyric comments, and replies. Support a restrained studio vocabulary (`like`, `love`, `fire`, `heard`, `done`, `idea`, `laugh`), per-member toggle behavior, counts, and viewer state.
- Reuse the existing lyric-section and timestamped-audio comment tables instead of creating duplicate contextual note stores.
- Add a unified server API that presents whole-song, lyric, and audio notes in one newest-first feed and routes create/reply/resolve actions to the authoritative underlying store.
- Send in-app notifications only to validated current room participants explicitly selected or @mentioned; never grant room access through a mention.
- Add a movable Studio Notes module to the approved hybrid Writer's Room layout with a quick composer, recipient chips, context selector, filters, replies, and open/resolved controls.
- Keep the automatic Diary separate. Existing hand-written Diary notes remain readable for historical continuity, but new Note actions open Studio Notes.
- Preserve the existing in-context lyric and waveform comment experiences; notes created through the unified composer must appear there because they use the same underlying tables.

## Files expected to change

- `supabase/migrations/180_writer_room_studio_notes.sql`
- `types/catalogue.ts`
- `lib/catalogue/studio-notes.ts` and tests
- `app/api/works/[workId]/studio-notes/route.ts`
- `app/api/works/[workId]/studio-notes/[noteId]/route.ts`
- `app/api/works/[workId]/studio-notes/[noteId]/reactions/route.ts`
- `components/catalogue/StudioNotes.tsx` and tests
- `components/catalogue/WorkPage.tsx`
- `app/(artist)/vault/works/[workId]/page.tsx`
- `lib/catalogue/writer-room-layout.ts` and related layout tests

## Validation plan

- Contract-test participant-only reads/writes, parent/context validation, mention limits, resolution authority, and direct table-write revocation in the migration.
- Unit-test unified note presentation, context labels, reply grouping, newest-first roots, filtering, permissions, and reaction aggregation.
- Component-test recipient/context controls, note examples, replies, resolution affordances, reaction toggles, and the movable room module.
- Run focused Jest, TypeScript, ESLint, full Jest, production build, and `git diff --check`.

## Risks and coordination notes

- Migration 180 is human-gated and must not be applied by the agent.
- A note, mention, reply, or resolution is creative context only. It never changes audio, lyrics, credits, splits, rights, approval, or room membership.
- Explicit recipient ids are treated only as notification intent and are revalidated server-side against current participants.
- The Studio Notes facade must not copy existing lyric/audio comments into a new table; each context keeps one source of truth.
- No deadlines, assignments, required acknowledgements, or blocking workflow are included in this build.
- Reactions are lightweight creative acknowledgements only. `done` does not resolve a thread or approve an edit, recording, split, right, or delivery.
- Manual GSD quick-task fallback is used because the installed GSD CLI does not expose a quick-task execution command.
