# Release 12 — Playbook Draft Recovery & Autosave Summary

## What Changed

- Added browser-local autosave for unfinished native Playbook entries and revisions after a 900 ms pause in editing.
- Namespaced every recovery record by authenticated team member, Playbook room, and new-entry or existing-entry ID.
- Added a versioned recovery format with strict shape and size checks, a seven-day retention limit, and rejection of malformed or implausibly future-dated records.
- Added an explicit recovery notice showing when the local copy was saved and offering Restore or Discard actions.
- Added a visible “Saved locally” timestamp that clearly distinguishes local recovery from a Funūn server save.
- Added a non-blocking warning when browser storage cannot accept a recovery copy.
- Cleared the matching recovery record after a successful server save, explicit discard, or deliberate start-over action.
- Preserved recovery when an author merely cancels editing so unfinished work can still be restored later.
- Preserved the existing unsaved-navigation warning, server authorization, draft review, and publication behavior.

## Validation Run

- Focused recovery/preflight pass: 2 suites, 11 tests.
- Full repository pass: 539 suites, 6,324 tests.
- `npm run typecheck`: passed.
- Targeted ESLint: passed with zero warnings.
- `git diff --check`: passed.
- React best-practices review: completed; autosave depends on primitive draft values and cannot loop from its own saved-at state update.

## Remaining Notes

- No schema or migration changes were required.
- Recovery is device-local convenience protection, not the database source of truth and not evidence of submission or publication.
- Local records expire after seven days and are isolated in the UI by signed-in account, room, and entry.
- No entry was created, published, committed, pushed, or deployed during this release.
- The repository remains a shared dirty worktree containing prior Playbook releases and unrelated work that this release did not alter or revert.
