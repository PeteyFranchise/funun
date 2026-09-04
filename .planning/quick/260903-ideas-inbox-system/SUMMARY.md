# Ideas Inbox and Capture System — Summary

## Shipped

- Added a dedicated, private-by-default `/ideas` home above the Sound Vault in artist navigation.
- Added zero-setup microphone capture with pause/resume, moment markers, local-time automatic names, file import, local download, direct signed storage upload, and IndexedDB recovery for interrupted/offline saves.
- Added a linear Ideas Inbox with search, state filters, collection filters, pin, seven-day snooze/resurfacing, archive/restore, mood tags, notes, transcript/rough lyrics, references, and per-take `keep`/`maybe`/archive controls.
- Added native playback, downloads, recording markers, whole-idea and timed recording comments, contribution receipts, one contextual next move, and private similarity-based resurfacing.
- Added non-destructive branches that preserve source recording lineage without copying or mutating the underlying audio object.
- Added `listen`, `comment`, and `contribute` permissions; direct invites for claimed roster members; notifications; and revocable, one-use, seven-day private links for existing Funūn accounts.
- Added promotion into a new or owner-controlled existing Writer's Room. Promotion atomically carries active recordings, timestamps, creator identity, and contributing members, then shows the source Idea in the Writer's Room.
- Promotion deliberately creates no split parties and infers no rights, publishing, approval, registration, master, or release facts.
- Added a downloadable JSON provenance manifest plus signed individual-audio downloads.

## Security and durability

- All Idea tables use RLS, authenticated reads, and service-only writes.
- Every mutation resolves owner/member access before using service credentials.
- Recording completion binds the signed path to the Idea and random recording id, verifies the stored object, validates type and size, and supports idempotent completion.
- Private invitation claims are hashed, expiring, revocable, one-use, and row-locked against concurrent claims.
- Original audio stays immutable. Archive and branch actions only change or add database records.

## Explicitly deferred

The visual Idea Canvas remains unbuilt. No board, node graph, freeform spatial layout, or drag/drop canvas was introduced. Before any later Canvas implementation, present the owner with a UI mockup and wait for explicit approval.

## Verification

- `npm test -- --runInBand` — 406 suites, 3,990 tests passed.
- `npm run lint` — passed with zero warnings.
- `npm run typecheck` — passed.
- `npm run build` — production build passed; `/ideas`, invite, and all Ideas API routes compiled.
- `git diff --check` — passed.

## Deployment

Migration `169_ideas_inbox.sql` was applied and verified by the owner on 2026-09-03.

The manual GSD quick fallback was used because Claude's native `/gsd-quick` slash command is not callable from this Codex environment.
