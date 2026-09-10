# Release 13 — My Playbook Personal Workspace Summary

## What Changed

- Added `/admin/playbook/my` as the user-facing “My Playbook” personal workspace.
- Added My Playbook to the Playbook secondary navigation for Team Members with at least one accessible room.
- Added summary counts and four focused sections: Continue Writing, Assigned to Me, Reviews I Own, and Recently Published.
- Combined browser-local recovery copies and Funūn-saved drafts without presenting either as published work.
- Added safe local-recovery discovery that accepts only versioned keys belonging to the signed-in account and a room the viewer can currently access.
- Added Resume and explicit local Discard actions; local content is never copied to the server from this page.
- Added outstanding direct and role-based reading assignments with urgency ordering and links to exact published articles.
- Added published entries owned by the viewer, with overdue, due-soon, scheduled, and unscheduled review context.
- Added the latest approved entries from accessible rooms, including the still-live published version when a revision is pending.
- Kept entry queries metadata-only and explicitly constrained them to room IDs resolved through the existing role×room access model.
- Preserved the Governance Inbox as the approval workspace instead of creating a competing approval path.

## Validation Run

- Focused workspace/recovery/assignment pass: 3 suites, 14 tests.
- Full repository pass: 540 suites, 6,328 tests.
- `npm run typecheck`: passed.
- Targeted ESLint: passed with zero warnings.
- `git diff --check`: passed.
- React best-practices review: completed; independent server reads run in parallel, client recovery discovery is capped, and repeated lookups use memoized maps.

## Remaining Notes

- No schema or migration changes were required.
- Persistent reviewer comments and requested-change threads remain a later schema-backed release.
- No entry was created, approved, published, committed, pushed, or deployed during this release.
- The repository remains a shared dirty worktree containing prior Playbook releases and unrelated work that this release did not alter or revert.
