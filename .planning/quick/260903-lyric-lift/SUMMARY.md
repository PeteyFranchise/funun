# Lyric Lift — Summary

## Delivered

- Added `Pull lyrics` to every eligible uploaded Writer's Room recording and an opt-in prompt immediately after a new audio upload.
- Added a durable `lyric_lift` background job. The source recording is fetched from private storage on the server and never sent through the browser.
- Added an OpenAI transcription pipeline with a faithful transcript pass, timestamp alignment, and structured song-section detection.
- Added deterministic output validation. If section detection drops too many words or invents too much text, the UI receives one editable full-transcript block instead.
- Added a Writer's Room review panel with source-time playback, editable text, section labels, ordering, inclusion controls, confidence review flags, and exact-repeat linking.
- Added explicit cancel/discard behavior. Cancellation wins even if provider work is already in progress; the source audio and canonical lyrics remain untouched.
- Added atomic approval into Lyric Blocks. Existing lyrics can only be preserved and appended to; no replace path exists.
- Kept transcription provenance separate from songwriting authorship. Imported words use human-source blocks with no writer assigned until the room confirms the actual writers.
- Added authenticated contributor-only API routes, server-only provider credentials, daily start throttling, provider file validation, durable retries, and a five-minute job lease.
- Added OpenAI configuration to `.env.example` and the status page.

## Database

- Added `supabase/migrations/171_writer_room_lyric_lift.sql`.
- The migration creates private lift, draft-section, and block-provenance tables with RLS enabled and browser grants revoked.
- Service-only SQL functions apply and reorder a reviewed draft atomically with defense-in-depth Writer's Room membership checks.
- The migration is authored but was not applied by Codex.

## Verification

- Focused Lyric Lift and job suite: 68 tests passed.
- Full repository suite: 412 suites and 4,015 tests passed.
- ESLint: passed with zero warnings.
- Standard TypeScript check: passed.
- Next.js production build: passed, including all new routes and the Writer's Room page.
- `git diff --check`: passed.
- Strict unused-symbol TypeScript check was also run. It remains red on existing unrelated unused symbols; none are in the Lyric Lift files.
- Local Supabase DB lint could not run because the local Postgres/Supabase stack was not running on port 54322. Migration contract tests passed, but the owner still needs to apply migration 171 in the linked environment.
- No live provider call was made because `OPENAI_API_KEY` is not configured in the local environment.

## Required before live use

1. Apply migration 171.
2. Add `OPENAI_API_KEY` to the server environment. Optional model overrides are documented in `.env.example`.
3. Test one representative mixed song after deployment, paying particular attention to vocal clarity, timestamps, and section labels.

## Planning note

The repository did not expose a runnable GSD command, so the required manual quick-task planning fallback was used.
