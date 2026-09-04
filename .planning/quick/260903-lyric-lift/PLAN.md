# Lyric Lift — Plan

## Outcome

Add a Writer's Room workflow that turns an uploaded mixed song recording into a timestamped, editable lyric-section draft and lets a room member approve that draft into Lyric Blocks without overwriting existing lyrics or assigning unverified songwriting credit.

## Scope

- Offer `Pull lyrics` from an uploaded Writer's Room audio version.
- Queue durable server-side transcription work so the user can leave the page.
- Transcribe the source recording, detect likely song sections, and retain source timestamps and confidence/review signals.
- Show queued, processing, failed, and review-ready states in the Writer's Room.
- Let members play from a section timestamp, edit text, change the section type, and reorder or remove draft sections.
- Apply reviewed sections to Lyric Blocks only after explicit approval.
- Preserve existing Lyric Blocks; when blocks exist, approval may append but never replace.
- Preserve provenance separately from lyric authorship. Imported blocks remain human-source lyrics with no writer assigned until the room confirms writers.
- Restrict the feature to authenticated User Accounts that are members of the Writer's Room.

## Assumptions

- OpenAI's server-side transcription endpoint is the first provider; the API key is never exposed to the browser.
- The current high-accuracy `gpt-transcribe` model supplies the transcript and language detection. Because its JSON response does not expose timeline segments, a timestamp-capable transcription fallback/provider path will be used where required for review playback.
- A current OpenAI structured-output model organizes transcript segments into Verse, Chorus, Bridge, and other Lyric Block categories; deterministic validation rejects malformed or invented model output.
- Provider file-size and format limits are enforced before a job is accepted, with an actionable message rather than a failed background task.
- Idea Canvas remains out of scope.

## Implementation

1. Inspect existing Writer's Room audio, Lyric Blocks, access-control, storage, and durable-job patterns.
2. Add migration 171 for Lyric Lift jobs, editable draft sections, block provenance links, RLS, and constrained server-side mutations.
3. Add provider-neutral transcription and section-classification helpers with strict parsers.
4. Extend the background worker and cron route to process Lyric Lift jobs safely and idempotently.
5. Add authenticated request, read, edit, reorder/remove, retry, and approve endpoints.
6. Add the Writer's Room `Pull lyrics` action and review panel using the existing Funūn visual language.
7. Add tests for parsing, authorization, persistence rules, non-overwrite behavior, worker leases, and UI states.

## Verification

- Run focused Lyric Lift tests while implementing.
- Run the full test suite.
- Run lint, strict typecheck, and production build.
- Inspect the migration for RLS, user-account membership checks, idempotency, and append-only approval.
- Update `SUMMARY.md` with implementation and verification results.

## Deployment note

The repository does not expose a runnable GSD command, so this is the required manual GSD quick-task fallback. The owner will apply the new Supabase migration; Codex will not apply it.
