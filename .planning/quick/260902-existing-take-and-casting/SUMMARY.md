# Existing Take Evidence and Direction-to-Performer Casting — Summary

## What changed

- Added a real `ExistingTakePicker` with signed playback, honest evidence copy, an explicit selection, and an empty state.
- Derived eligible source takes from the song's real versions: the target, later takes, malformed timestamps, and any version already carrying an AI entry are excluded.
- Wired the picker into both the once-per-song hum-first disclosure and the later `Not sure` evidence path. The selected version id is filed as the AI entry's `humanSourceVersionId`.
- Hardened the AI-entry route so a source must belong to the same work, be untagged by AI, predate the target recording, and be used only with performance mode.
- Added a visible `Assign performer` action when a lyric section has direction but no named singer.
- Kept direction and performer edits as independent partial patches. The casting picker now states that assigning someone preserves the saved direction.
- Added focused pure, component, and route-wiring regression coverage.

## Validation run

- `npm test -- --runInBand` — 381 suites, 3888 tests passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed with zero warnings.
- `git diff --check` — passed.
- `next build` was intentionally not run because the owner's active dev server may share and corrupt `.next`.

## Remaining risks or follow-ups

- A timestamp proves chronology, not authorship. The UI keeps the artist's attestation explicit and does not overstate what selection proves.
- No database migration is required.
- A future version-comparison player can reuse the same signed take options and chronology rules.

## Workflow

Codex used the repository's documented manual GSD quick fallback because Claude's native `/gsd-quick` slash-command runtime is not callable from this environment.
