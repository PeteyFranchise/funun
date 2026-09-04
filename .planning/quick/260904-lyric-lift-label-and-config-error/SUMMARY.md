# Lyric Lift label and configuration-error fix

## Completed

- Confirmed the production `Heartburn` work and its uploaded MP3 are intact, active, supported, and below Lyric Lift's upload limit.
- Confirmed the failed attempt created no partial lyric-lift record because production does not currently expose `OPENAI_API_KEY`.
- Branded the post-upload prompt, primary action, and track action consistently as **Lyric Lift**.
- Replaced artist-facing environment-variable instructions and provider-auth details with a safe temporary-unavailability message that reassures the artist their recording remains saved.
- Added accessible context to the track-level Lyric Lift action.
- Kept the existing `gpt-transcribe` model configuration; current OpenAI API documentation lists it as supported for transcription.

## Verification

- Focused Jest: 3 suites, 30 tests passed.
- Full Jest: 425 suites, 4,080 tests passed.
- Strict TypeScript: passed.
- ESLint: passed.
- `git diff --check`: passed.
- Next.js production build: passed; 122 static pages generated.

## Operational follow-up

- Add `OPENAI_API_KEY` to the Vercel Production environment and create a fresh production deployment before retrying Lyric Lift.
- No database migration is required.
