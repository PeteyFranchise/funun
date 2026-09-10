# Release 8 — Guided Doctrine Adoption Summary

## What Changed

- Added strict extraction of a single manifest-referenced Markdown section, or a whole document body without duplicating its leading title.
- Added an authorized, no-store source endpoint that accepts only a publication-manifest key and its matching room.
- Required Leadership or the target room lead before repository source content is read or returned.
- Added a side-by-side exact-source and Playbook-rendering preview to Doctrine Readiness.
- Added destination, SHA-256, reviewer, Gameplan, blocker, and legacy-supersession context to the guided review.
- Added explicit confirmation before creating one unpublished review draft or source-update draft.
- Revalidated the manifest identity and canonical source body server-side during the final guided adoption request.
- Preserved direct Playbook authoring as the normal alternative for future entries; Markdown import is optional.
- Added exact doctrine sources to the Next.js serverless file traces for both preview and adoption routes.

## Validation Run

- Focused Playbook/API test pass: 26 suites, 145 tests.
- Full repository test pass: 533 suites, 6,291 tests.
- `npm run typecheck`: passed.
- Targeted ESLint for all Release 8 files: passed with zero warnings.
- `npm run build`: passed; `/admin/playbook/publication`, `/api/admin/playbook/publication/source`, and `/api/admin/playbook/adopt` are present in the production route manifest.
- Generated `.nft.json` traces for both source-reading API routes include all four canonical doctrine Markdown files.
- `git diff --check`: passed.

## Remaining Risks And Follow-Ups

- No migration was added or applied by this release.
- No doctrine was adopted or published; authorized governors must review each target individually.
- Candidate Playbook migrations 201–202 remain outside the active migration chain until Phase 38.2 establishes migrations 199–200.
- The shared worktree still contains concurrent Phase 38 and earlier Playbook changes; this release was not committed, pushed, or deployed.
