# Lyric Lift no-vocals safeguard

## Objective

Detect instrumental or effectively lyric-free recordings before Lyric Lift
creates a draft, then show a clear non-error outcome without retrying paid work
or touching the source recording.

## Scope

- Treat the accurate transcript and the independent timestamp-alignment pass as
  corroborating vocal evidence.
- Reject empty output, music-only transcript cues, and alignment segments whose
  Whisper `no_speech_prob` conservatively indicates no human voice.
- Persist the outcome using the existing failed-lift storage shape, but handle
  it as a distinct non-retriable `no_vocals` result in the worker and UI.
- Create no draft sections and never apply anything to Lyric Blocks for this
  outcome.
- Prevent direct retry or repeat processing of the same immutable version after
  a no-vocals result.
- Keep the uploaded recording intact and direct the artist to a vocal version.
- Add focused domain, provider/worker contract, route, and component coverage.
- No database migration.

## Files expected to change

- `lib/catalogue/lyric-lift.ts`
- `lib/catalogue/lyric-lift-provider.ts`
- `lib/catalogue/lyric-lift-service.ts`
- `app/api/works/[workId]/versions/[versionId]/lyric-lift/route.ts`
- `app/api/works/[workId]/lyric-lifts/[liftId]/retry/route.ts`
- `components/catalogue/LyricLiftPanel.tsx`
- `lib/catalogue/lyric-lift.test.ts`
- `lib/catalogue/lyric-lift-provider.test.ts`
- `lib/jobs/handlers.test.ts`
- `components/catalogue/LyricLiftPanel.test.tsx`
- `__tests__/writer-room-lyric-lift-routes.test.ts`
- `.planning/quick/260904-lyric-lift-no-vocals/SUMMARY.md`

## Validation plan

- Run focused Lyric Lift domain, UI, and route tests.
- Run strict TypeScript, ESLint, the full Jest suite, and a production build.
- Confirm no migration was added and no existing audio or lyric data is mutated
  by detection.

## Risks and coordination notes

- False instrumental classifications are more harmful than sending an
  uncertain vocal draft to review, so the no-speech threshold must be
  conservative and require corroborating evidence.
- OpenAI's current transcription reference documents segment timestamps and
  Whisper's `no_speech_prob`; the detection rule must tolerate absent optional
  evidence rather than trusting an undocumented field.
- A no-vocals outcome is permanent for one immutable work version. A new vocal
  mix should be uploaded as a new version and processed independently.
