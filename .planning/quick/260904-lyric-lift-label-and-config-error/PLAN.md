# Lyric Lift labeling and configuration error

## Objective

Make the post-upload transcription experience unmistakably branded as Lyric
Lift and prevent server configuration details from appearing in the Writer's
Room when the provider key is unavailable.

## Reproduction and root cause

- `Heartburn` and its active 3.9 MB MP3 take are safely stored in production.
- No lift row was created because the start route rejected the request before
  queueing work.
- Production Vercel does not currently define `OPENAI_API_KEY`.
- The post-upload modal's small eyebrow says `Lyric Lift`, but its headline,
  primary action, and take action say only `Pull lyrics`, making the tool name
  easy to miss.
- The 503 response exposes an operator instruction directly to artists.

## Scope

- Brand the post-upload question and primary action as Lyric Lift.
- Brand the persistent take-card action as Lyric Lift.
- Replace missing-provider-key responses with artist-safe availability copy in
  both start and retry routes.
- Ensure background provider authentication failures do not expose environment
  variable instructions through a failed draft.
- Add focused regression coverage.
- No migration or production-data mutation.

## Product and cost model decision

- Lyric Lift is a Funūn-provided feature for eligible signed-in User Accounts;
  artists and collaborators do not supply or manage their own OpenAI keys.
- `OPENAI_API_KEY` remains a server-only Funūn production secret. It must never
  be returned by an API route, exposed through a `NEXT_PUBLIC_*` variable,
  stored in a user profile, or sent to the browser.
- Funūn's OpenAI account pays for Lyric Lift usage. The launch guardrail is the
  existing per-user daily limit; before broad scale, connect usage to Funūn
  plan allowances or credits and add account-level spend monitoring.
- Access remains room-scoped: a user must have contribution access to the
  Writer's Room containing the recording.

## Files expected to change

- `components/catalogue/WorkPage.tsx`
- `components/catalogue/TimedTrackPlayer.tsx`
- `components/catalogue/WorkPage.test.tsx`
- `components/catalogue/TimedTrackPlayer.test.tsx`
- `app/api/works/[workId]/versions/[versionId]/lyric-lift/route.ts`
- `app/api/works/[workId]/lyric-lifts/[liftId]/retry/route.ts`
- `lib/catalogue/lyric-lift.ts`
- `lib/catalogue/lyric-lift-provider.ts`
- `__tests__/writer-room-lyric-lift-routes.test.ts`
- `.planning/quick/260904-lyric-lift-label-and-config-error/SUMMARY.md`

## Validation plan

- Run focused Lyric Lift and Writer's Room component tests.
- Run strict TypeScript, lint, full Jest, and the production build.
- Confirm the repository diff contains no secret value.

## Risks and coordination notes

- The feature cannot process audio until the owner adds `OPENAI_API_KEY` to
  Vercel Production and redeploys; the key must never be pasted into chat or
  committed.
- Do not introduce bring-your-own-key UI as a workaround. Configuration and
  billing remain a Funūn operator responsibility, not user onboarding.
- Current OpenAI developer documentation lists `gpt-transcribe` as supported,
  so this task does not change model selection.
