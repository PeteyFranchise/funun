# Writer's Room Recovery & Take Management — Summary

## Completed

- Vocal punch-ins now upload immediately after each recording stops; another recording cannot start until the prior clip is durable or explicitly retried.
- Recording sessions expose `Loading`, `Saving`, `Saved`, and `Offline — waiting to sync` states and prevent an in-app close while work is unsynced.
- Draft and rendered vocal sessions reopen with their immutable backing take, raw clips, levels, and timing compensation.
- Changing levels, timing, removing a clip, or adding a punch-in reopens a rendered session as a draft; saving creates another immutable rough-take version.
- Take cards now expose `Resume vocal draft` / `Edit vocal session` when the signed-in creator has a matching session.
- Added take archiving and restoration. Archived takes move behind a collapsed collection while their audio, comments, diary history, session lineage, and Passport evidence remain intact.
- Selected Passport masters cannot be archived. Only the uploader or room owner can archive/restore a take.
- Raw vocal clip removal is non-destructive and recoverable at the data layer.
- Existing 600ms lyric autosave now has conflict-aware local crash/network recovery; unfinished room notes and timed comments also recover locally, namespaced to the signed-in viewer.
- Added retry-idempotence for clip completion after a lost response.

## Migration

- `163_writer_room_recovery_take_management.sql` (depends on migration 162)

## Verification

- `npm run typecheck` — passed.
- `npm run lint` — passed with zero warnings.
- `npm test -- --runInBand` — 389 suites / 3917 tests passed.
- `npm run build` — passed; 121 static pages generated and the new session/clip/version routes compiled.
- `git diff --check` — passed.

## Safety Boundary

- Completed takes are archived rather than permanently destroyed because every version is part of the Writer's Room evidence/history model. Active punch-ins can be removed from a comp without erasing their underlying historical record.
- Audio still being captured at the exact moment a browser or device terminates cannot be recovered. Once Stop is pressed, Funūn begins durability immediately and reports whether it succeeded.
