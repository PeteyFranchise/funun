# Vocal Comp Editor — Build Summary

## What Changed

- Replaced decorative beat bars with amplitude-derived beat and vocal waveforms.
- Added an in/out range selector and a count-in `Re-record selection` flow.
- New replacement vocals preserve overlapping performances as muted alternates.
- Added per-vocal selection, 100 ms nudging, non-destructive trim-in/trim-out, mute, solo, remove/restore, and ten-step undo history.
- Persisted timing, trim, mute, and removal instructions through the recording-session API and reopened sessions.
- Updated live playback and rough-take rendering to honor the selected comp while retaining every raw microphone object.
- Added migration 164 for durable clip trims and the required column grants.

## Validation Run

- `npm test -- --runInBand` — 389 suites and 3,919 tests passed.
- `npm test -- --runInBand lib/catalogue/record-over-beat.test.ts` — 5 focused tests passed after the final audio-duration adjustment.
- `npm run typecheck` — passed.
- `npm run lint` — passed with zero warnings.
- `npm run build` — production build completed successfully.
- `git diff --check` — passed.

## Remaining Risks or Follow-ups

- Apply Supabase migration 164 before deploying the API/UI changes.
- The first release mutes a whole overlapping punch-in when it is replaced; sample-level splitting and crossfades remain future DAW-style enhancements.
- Microphone timing still depends on browser/device latency, with the existing global vocal timing compensation available for correction.
