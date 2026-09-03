# Vocal Comp Editor — Quick Build Plan

## Objective

Turn the existing record-over-beat session into a lightweight, non-destructive vocal comp editor that works comfortably in the Writer's Room on desktop or phone.

## Scope

- Replace decorative recording bars with amplitude-derived beat and vocal waveforms.
- Add a timeline range selection and count-in re-recording for the selected section.
- Keep replacement recordings non-destructive: overlapping clips become muted alternates, never erased.
- Add per-clip selection, trim-in/trim-out, timeline nudging, mute/solo, restore, and undo.
- Persist clip edit state immediately and include it in reopened sessions and browser-rendered rough mixes.
- Save every comp render as a new immutable work version.

## Assumptions

- Migrations 162 and 163 are applied before migration 164.
- A first-release replacement mutes whole overlapping punch-in clips. It does not split a single raw clip at arbitrary sample boundaries.
- Trims and moves alter the comp instruction only; the raw microphone object remains unchanged.
- No pitch correction, time stretching, effects, or destructive waveform editing.

## Files Expected to Change

- `components/catalogue/RecordOverBeatStudio.tsx`
- `lib/catalogue/record-over-beat.ts` and its unit tests
- Writer's Room recording-session API routes
- A new additive Supabase migration
- This quick-build plan and summary

## Verification

- Unit-test waveform sampling and clip-window/overlap calculations.
- Verify API allowlists and edit authorization.
- Run full Jest, TypeScript, lint, production build, and SQL review.

## Risks and Coordination

- Migration 164 must be applied before the updated session API is deployed.
- Raw audio remains immutable; a muted or removed clip is still recoverable.
- This work extends migrations 162–163 and does not rewrite their shared production history.
