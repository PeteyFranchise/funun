# Release 15 — Playbook Review Resolution & Version Comparison

## Completed

- Extended unapplied migration candidate 204 with immutable review-round content snapshots.
- Added linked review rounds with awaiting-review, changes-requested, ready-for-re-review, approved, declined, and superseded states.
- Added database-enforced author resubmission rules: the draft must be newer and every requested change must no longer be open.
- Added author “Mark addressed” actions and reviewer resolve/reopen controls with separate authority checks.
- Added exact reviewed-snapshot/current-draft and prior-round/new-round comparisons for documents, SOPs, and topics.
- Added review-round history with permanent optional decision summaries.
- Added reviewer queues and counts to Playbook Governance for Awaiting review, Changes requested, and Ready for re-review.
- Kept optional suggestions independent of approval; the approval trigger completes a review round without requiring suggestions to close.
- Added notifications for addressed changes and re-review submissions.
- Kept the review schema fail-closed and gracefully unavailable until migration candidate 204 is owner-approved.

## Security and integrity

- Review and resubmission authority remains server-derived from the authenticated Team Member, room access, authorship, leadership, and room-lead records.
- Snapshot identity, messages, mentions, thread history, round history, and decision summaries are immutable/append-only.
- Resubmission rules are repeated inside the service-role-only database function, not trusted to client controls.
- Pending drafts remain visible only to authors, approvers, and explicitly tagged Team Members.

## Verification

- Full Jest suite: 543 suites passed, 6,357 tests passed.
- TypeScript: `npm run typecheck` passed.
- Targeted ESLint passed with zero warnings.
- `git diff --check` passed.
- React best-practices review completed; review data remains lazy-loaded only when an entry’s Review Notes panel opens.

## Owner-gated follow-up

1. Reconcile reserved Phase 38.2 migrations 200/203 with Playbook candidates 201/202.
2. Review the expanded candidate 204 before moving it into `supabase/migrations`.
3. Apply only through the established human-gated owner workflow.
4. Deploy and run production UAT for reviewer, author, tagged-participant, stale-draft, approval, and rejection paths.

