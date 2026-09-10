# Release 11 — Playbook Authoring Preflight & Review Packet

## Objective

Give Playbook authors a clear, non-destructive readiness check and review packet before a new entry or revision is submitted or published.

## Scope

- Assess titles and Playbook content locally without adding persistence or schema.
- Detect unfinished starter language, empty Markdown sections, malformed links, inconsistent tables, and incomplete Mermaid fences.
- Surface governance metadata prompts for owner, audience, and review cadence as warnings rather than rigid blockers.
- Show word count, estimated reading time, entry format, room, subgroup, and intended action in a review packet.
- Require only valid title/content to proceed; warnings remain explicitly overridable.
- Apply the preflight to new entries and edited revisions while preserving Save draft.

## Files Expected To Change

- `lib/playbook/authoring-preflight.ts` and focused tests
- `components/playbook/AuthoringPreflightPanel.tsx`
- `components/playbook/EntryEditor.tsx`
- This release summary

## Validation Plan

- Run focused preflight and existing Playbook authoring tests.
- Run TypeScript, targeted ESLint, the full Jest suite, and `git diff --check`.
- Do not run migrations or production deployment commands.

## Risks And Coordination Notes

- No database or migration changes.
- The existing worktree contains uncommitted prior releases and concurrent changes; this release will not rewrite or revert them.
- Heuristic content warnings must explain what was detected and never pretend to prove policy correctness.
