# Record Over Beat — Quick Build Plan

## Scope

- Add a non-destructive recording-session model linked to an existing Writer's Room take.
- Let contributors record multiple microphone punch-ins while the backing take plays.
- Provide layered preview, seek, beat/vocal levels, timing adjustment, clip deletion, and re-recording.
- Persist raw vocal clips and save a rendered stereo rough mix as a new immutable take.
- Keep rights, splits, publishing, and profile completion outside the recording gate.

## Assumptions

- The existing `track-audio` private bucket and signed-upload flow remain the audio transport.
- Each record-on/record-off interval is a separate raw clip positioned on one visual vocal lane.
- The first release renders WAV in the browser; a queued server renderer can replace this later without changing session lineage.
- Headphones are recommended, not required. A manual timing offset covers first-release device latency.

## Verification

- Unit-test timeline/mix helpers and recorder fallback states.
- Run targeted tests, TypeScript, lint, and production build.
- Verify the Writer's Room exposes the recorder only for playable takes and refreshes after save.
- Review migration RLS and server-side work/session/version ownership checks.
