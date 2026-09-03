# Writer's Room Alternate Lyric Suggestions — Summary

## Completed

- Added private alternate lyric proposals for original lyric sections, with pending, accepted, and declined lifecycle states.
- Added an `Alternates` action and pending count to each original section. Linked repeats continue to inherit their source and do not receive independent proposals.
- Added a side-by-side panel for drafting and reviewing the current lyric against a proposed version, with optional current-room mentions.
- Allowed every current room participant to propose words without acquiring or taking over the section's edit lease.
- Reserved acceptance for the work owner or an administering member; proposal authors may withdraw their own pending proposal, while administrators may decline any pending proposal.
- Made acceptance atomic and non-destructive: it checks the proposal's original baseline, refuses active section locks, snapshots the current lyric, applies the proposal with its writer's attribution, accepts the chosen proposal, and closes competing pending proposals in one transaction.
- Serialized edit-lock acquisition and proposal decisions through the same lyric-block row to prevent lock/accept races and simultaneous-admin deadlocks.
- Added a meaningful diary entry naming both the accepting member and the proposing writer. Proposal creation and rejection do not flood the permanent diary.
- Added bounded private realtime invalidation; canonical proposal and lyric text always refetch through authenticated routes.
- Added mention notifications that link back to the Writer's Room without exposing proposal text over Realtime.

## Safety and data boundaries

- Suggestions do not change splits, rights, legal identity, approved metadata, audio, or agreements.
- A proposal becomes canonical only through explicit authorized acceptance.
- If the canonical lyric changed after a proposal was written, acceptance returns a conflict and leaves both texts untouched.
- If somebody holds an active section lease, acceptance returns a conflict rather than overwriting an in-progress edit.
- Historical proposals do not block account deletion. A proposal whose author account is no longer available remains readable but cannot be accepted into canonical authorship.
- Migration `161_writer_room_lyric_suggestions.sql` must be applied before live use.

## Verification

- Focused Jest: 8 suites, 65 tests passed during the integrated feature pass; final focused safety pass: 5 suites, 31 tests passed.
- Full Jest: 387 suites, 3,912 tests passed after final data-lifecycle hardening.
- TypeScript: `npm run typecheck` passed.
- ESLint: `npm run lint` passed with zero warnings.
- Whitespace validation: `git diff --check` passed.
- A production Next.js build was intentionally not run because the owner's active preview may share the `.next` directory.

## Workflow

- Used the repository's required manual GSD quick fallback because Codex cannot invoke Claude's native `/gsd-quick` runtime in this session.
