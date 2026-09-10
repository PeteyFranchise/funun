# Release 14 — Playbook Review Notes & Requested Changes

## Completed

- Added human-gated migration candidate `204_playbook_review_threads.sql` outside the live migration directory.
- Added revision-bound review threads for published revisions and exact draft versions.
- Added overall, heading, and checklist/question anchors.
- Added optional suggestions and persistent requested changes without coupling either type to the approval action.
- Added Team Member mentions, participant replies, reviewer-controlled resolve/reopen transitions, and in-app notifications.
- Added append-only messages/events and immutable thread identity at the database layer.
- Added server-derived room and reviewer authorization to every review route.
- Limited pending-draft discovery to authors, approvers, and explicitly tagged Team Members.
- Added an expandable review surface to each Playbook entry.
- Added a “Changes Requested” section and summary count to My Playbook.
- Added graceful schema-unavailable handling until candidate 204 is approved and applied.

## Verification

- Full Jest suite: 543 suites passed, 6,354 tests passed.
- TypeScript: `npm run typecheck` passed.
- Targeted ESLint for all Release 14 TypeScript/TSX files passed with zero warnings.
- `git diff --check` passed.
- React best-practices review completed; review data loads only when its panel is opened and pending draft visibility remains narrowly scoped.

## Owner-gated follow-up

1. Reconcile Phase 38.2 migrations 200/203 with Playbook candidates 201/202.
2. Review candidate 204 for production scheduling.
3. Move candidate 204 into `supabase/migrations` only after explicit owner approval.
4. Apply through the established human-gated migration workflow, then deploy and run production UAT.

