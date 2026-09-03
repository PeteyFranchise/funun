# Writer's Room Recovery & Take Management — Quick Build Plan

## Scope

- Persist each vocal punch-in as soon as recording stops and retain a resumable session draft.
- Autosave recording levels/timing and expose honest saving/saved/offline-retry status.
- Reopen draft or saved vocal sessions from their backing/rendered take.
- Archive and restore takes without removing their history or storage object.
- Permit guarded permanent deletion only for an uploader or room owner when no recording/passport/AI dependency requires the take.
- Keep the current 600ms lyric autosave and immutable lyric history; add local recovery for a failed/in-flight lyric save.
- Retain unfinished note and timed-comment text locally per viewer/device.

## Assumptions

- Migration 162 is applied before migration 163.
- Archive is the ordinary cleanup action. Permanent deletion is intentionally harder and dependency-aware.
- A draft can sync across devices after each punch-in reaches storage; an audio interval still being captured cannot survive a device/browser crash.
- Local draft recovery supplements server durability for text that has not completed a mutation.

## Verification

- Add pure helper and structural UI tests.
- Run full Jest, TypeScript, lint, production build, and SQL policy/dependency review.
