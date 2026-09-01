# Writer's Room Live Collaboration Roadmap Promotion

## Objective

Promote block-level simultaneous collaboration from a future direction into a near-term, GSD-ready roadmap candidate for the Writer's Room, preserving the owner's approved scope, safety boundaries and success test for Claude review.

## Scope

- Add a near-term Phase 37.2 candidate to the main roadmap.
- Record the four delivery stages: presence, section-aware editing, safety and creative collaboration.
- Lock the initial boundary to lyrics, notes, presence and meaningful diary events.
- Exclude rights, executed agreements, identity, approved metadata, release identifiers and audio-file mutation from live editing.
- Add a pending TODO and update the Phase 37 source deliberation for future `/gsd-discuss-phase` and planning.

## Files Expected to Change

- `.planning/ROADMAP.md`
- `.planning/deliberations/the-catalogue-unreleased-works.md`
- `.planning/todos/pending/2026-09-01-writers-room-live-collaboration.md`
- `.planning/quick/260901-writers-room-live-collaboration/PLAN.md`
- `.planning/quick/260901-writers-room-live-collaboration/SUMMARY.md`

## Validation Plan

- Confirm the roadmap identifies the work as near-term and not currently shipped.
- Confirm the initial scope, exclusions, conflict model, privacy doctrine and success test are present.
- Confirm the entry directs Claude/GSD to discuss and plan the phase rather than implementing from a loose note.
- Run `git diff --check` on all changed planning files.

## Risks / Coordination Notes

- Phase 37.1 still has an owner device-test gate; live collaboration should follow that gate rather than obscure it.
- Do not jump immediately to character-level CRDT/OT complexity; the owner approved section-level soft locks and snapshots as the first shippable model.
- Presence must communicate creative context without becoming surveillance.
- Existing unrelated worktree changes belong to the user and will not be modified.
