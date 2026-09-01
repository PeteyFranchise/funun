# Vault Door Copy Summary

## What Changed

- Changed the song-door heading from `Start a song` to `The Writer's Room`.
- Replaced the supporting copy with: `Start a song. Hum it, write lyrics, upload a take, or invite collaborators. Your song diary starts the moment you do.`
- Changed the release-door heading from `Start a release` to `The Release Report`.
- Replaced its supporting copy with: `Start a release. Build a single, snippet, EP, or album with the full readiness checklist for going out.`
- Updated both cards' accessible labels while preserving their actions and destinations.

## Validation Run

- Confirmed both new headings and their supporting copy in `app/(artist)/vault/new/page.tsx`.
- `npx eslint 'app/(artist)/vault/new/page.tsx' --max-warnings=0` passed.
- `git diff --check` passed for the task files.

## Remaining Risks or Follow-ups

- No functional behavior changed.
