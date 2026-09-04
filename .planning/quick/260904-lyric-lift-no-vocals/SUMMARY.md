# Lyric Lift no-vocals safeguard — summary

## Completed

- Added a conservative no-vocals classifier that requires the accurate
  transcript and the independent Whisper alignment pass to corroborate human
  words.
- Rejects empty transcripts, music/instrumental cues, and purported words when
  every meaningful alignment segment has a very high `no_speech_prob`.
- Returns the exact artist-facing result:
  `No vocals detected—this sounds like an instrumental`.
- Stores this as a durable, completed analysis outcome without creating lyric
  sections, touching Lyric Blocks, or changing the uploaded audio.
- Prevents worker retries, manual retries, and repeat paid processing of the
  same immutable instrumental version, including after the notice is dismissed.
- Added a neutral Writer's Room state with reassurance that the recording is
  safe and direction to upload or choose a vocal version.
- No database migration was required.

## Verification

- Focused Lyric Lift suite: 5 suites, 30 tests passed.
- Full Jest suite: 427 suites, 4,089 tests passed.
- Strict TypeScript: passed.
- ESLint: passed.
- Next.js production build: passed.
- `git diff --check`: passed.

## Operational note

- Production now has the shared server-side `OPENAI_API_KEY`; individual Funūn
  users do not supply their own key.
- A vocal mix must be uploaded as a new work version before Lyric Lift is run
  again on a song previously identified as instrumental.

## Reference

- OpenAI's current transcription API reference documents verbose timestamped
  segments and Whisper's segment-level `no_speech_prob` evidence used here.
