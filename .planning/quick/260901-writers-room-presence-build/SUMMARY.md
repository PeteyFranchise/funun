# Writer's Room Presence — Build Summary / Claude Handoff

## Status

Implemented in code. Production activation requires migration 143 and multi-account UAT.

## What shipped

- A private, work-scoped Supabase Realtime Presence channel: `writers-room:<work-id>:presence`.
- RLS authorization on `realtime.messages` that admits only an authenticated work owner or claimed work member and only for the Presence extension.
- A compact Writer's Room panel showing connected collaborators and privacy-safe activity:
  - In the room
  - Editing a named lyric section
  - Listening to a numbered take
  - Recently active
- Visibility and lifecycle handling: hidden tabs untrack, visible tabs re-track, channels clean up on unmount, and disconnected channels visibly report reconnecting state.
- Multiple tabs for one user coalesce into one person using the newest valid activity.
- Realtime payloads contain no name, avatar, lyric text, note text, legal data, or approved metadata. Names and avatars come from the access-checked server roster; unknown Presence keys are ignored.
- Debounced lyric saves, audio play/pause/end, and saved notes update the viewer's creative activity.

## Why this shape

This is Stage 1 of the approved collaboration plan: it makes a shared room feel live without attempting a Google Docs-style merge engine. It preserves the doctrine that creative collaboration and legal consent are different systems. Splits, agreements, identities, approved metadata, and uploaded audio remain outside collaborative live editing.

## Files

- `components/catalogue/WriterRoomPresence.tsx` — private channel lifecycle and room UI.
- `lib/catalogue/room-presence.ts` — payload validation, roster binding, multi-tab coalescing, labels.
- `components/catalogue/WorkPage.tsx` — mounts presence and announces lyric/listening/note activity.
- `app/(artist)/vault/works/[workId]/page.tsx` — builds the trusted presence roster after access resolution.
- `supabase/migrations/143_writer_room_presence_authorization.sql` — private Realtime Presence authorization.
- Focused tests in `lib/catalogue/room-presence.test.ts`, `components/catalogue/WriterRoomPresence.test.tsx`, and `__tests__/migration-143.test.ts`.

## Verification

- New focused suites: 10/10 passing.
- `npm run typecheck`: passing.
- `npm run lint`: passing.
- `npm run build`: passing, including `/vault/works/[workId]`.
- Existing `WorkPage.test.tsx`: 12 passing, 3 pre-existing stale-copy assertions failing (`Add to this song —` and `Next for this song:` no longer match the current UI). The presence integration introduced no additional failure in that suite.

## Required production step

Run:

```bash
npm run db:push
```

Then verify migration 143 is listed and run UAT with two authenticated accounts and at least one extra tab. The feature should not be marketed as live in production until that migration and UAT are complete.

## Nigil meeting document

Updated the live Google Doc `Funun-Nigil-Wednesday-Meeting-Battle-Plan` in place. The executive summary, claim ladder, Today/Coming soon lists, demo truth boundary, FAQ, meeting language, and deck instructions now distinguish:

- Built: private Writer's Room presence and creative activity.
- Activation gate: migration 143 plus production UAT.
- Coming soon: simultaneous section-level editing, soft locks, recovery, comments, and Song Passport continuity.
- Not claimed: Google Docs-style character merging or collaborative edits to legal/approved data.

## UAT script

1. Owner and claimed collaborator open the same Writer's Room; both names appear.
2. One user saves Verse 1; the other sees “Editing Verse 1” without receiving its text in the Presence payload.
3. One user plays v1; the other sees “Listening to v1.”
4. Open a second tab as one user; only one person chip remains.
5. Background and restore a tab; its presence disappears and returns.
6. Disable/re-enable network; the panel reports reconnecting and recovers without a page refresh.
7. A non-member cannot subscribe to the room channel.

## Next GSD slice

Section-aware soft locks and live lyric refresh, followed by recoverable snapshots. Do not extend Presence payloads into legal approval state.
