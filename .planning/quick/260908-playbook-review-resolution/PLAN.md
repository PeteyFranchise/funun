# Release 15 — Playbook Review Resolution & Version Comparison

## Objective

Complete the Playbook review lifecycle so authors and reviewers can act on revision-bound feedback without losing the exact content that was reviewed.

## Scope

- Extend unapplied migration candidate 204 with immutable content snapshots and explicit review-round state.
- Render reviewed-snapshot versus current-draft comparison.
- Let authors mark requested changes addressed and resubmit a review round.
- Give reviewers queues for awaiting review, changes requested, and ready for re-review.
- Preserve approval independence from optional suggestions.
- Record every workflow transition in immutable review events and notify the appropriate participants.

## Expected files

- `.planning/quick/260908-playbook-review-notes/204_playbook_review_threads.sql`
- `lib/playbook/reviews.ts` and tests
- Playbook review API routes and new round/action routes
- `components/playbook/EntryReviewPanel.tsx`
- Playbook governance/reviewer queue components and pages
- My Playbook author workspace

## Validation

- Migration contract and pure state-machine tests.
- API authorization and stale-state checks where practical.
- Full Jest suite, TypeScript, targeted ESLint, and `git diff --check`.

## Risks and coordination

- Candidate 204 remains outside `supabase/migrations` and must not be applied.
- Do not edit Claude-owned Phase 38 planning files or reserved migrations.
- Review authority is always derived server-side; no client role or status claim is trusted.
- Workflow actions must preserve draft content and immutable historical snapshots.

