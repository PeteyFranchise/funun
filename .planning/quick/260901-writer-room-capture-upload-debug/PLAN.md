# Writer's Room capture and upload debugging

## Objective

Make a brand-new Writer's Room expose all four creative actions and make hum/audio capture reliable on desktop and mobile without routing song files through the hosting function body limit.

## Production evidence

- Empty works render `ComposerCardEmptyState`, which exposes only hum and lyrics; the first block/version switches the page to `ComposerCard`, which exposes all four actions.
- Production recorded five 4xx responses on Writer's Room version routes and six HTTP 413 responses overall during the reported test window, with no 5xx application crash.
- Shane's reported hum produced a `work_versions` row with `audio_size = 0`; the route currently accepts empty files.
- The hidden file input uses only `accept="audio/*"`, and failed uploads are silently discarded by `handleFileChosen`.

## Scope

1. Give the empty-song composer the same Hum it, Write lyrics, Add audio, and Note actions as every other Writer's Room.
2. Add a signed direct-to-Supabase Storage upload handshake so files up to the existing 50 MB Writer's Room ceiling do not traverse a Vercel Function request body.
3. Validate file size/type before signing and again against the stored object before creating a version row.
4. Make MIME resolution tolerate normal desktop/mobile aliases and extension fallback for Files app entries with blank or generic MIME values.
5. Add explicit mobile-friendly audio extensions to the file picker.
6. Prevent zero-byte hums, collect MediaRecorder chunks continuously, and surface actionable upload/capture errors.

## Constraints

- Keep work membership authorization server-side through `resolveWorkAccess`.
- Keep the private `track-audio` bucket and existing 50 MB Writer's Room limit.
- Do not alter splits, contracts, metadata, rights, or unrelated dirty-worktree changes.
- Do not apply database migrations; this fix should require none.

## Verification

- Focused unit/component/API-helper tests for MIME fallback, empty-state actions, zero-byte rejection, and direct upload request behavior.
- TypeScript check and relevant Jest suites.
- Production evidence and manual device checks documented in `SUMMARY.md`; deployment remains a separate commit/push decision unless requested.
