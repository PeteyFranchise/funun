# Release 10 — Native Playbook Authoring Templates

## Objective

Make direct, database-backed Playbook authoring approachable without requiring Markdown files or weakening the existing room-scoped draft and review workflow.

## Scope

- Add a clear start-blank path.
- Add starter templates for Doctrine, SOP, Policy, Training Guide, Runbook, and CRM Gameplan Topic entries.
- Populate editable starter content without adding a new persistence format.
- Preserve room-local subgroup selection and side-by-side Markdown preview.
- Preserve the existing server-derived author, reviewer, and publisher authority.
- Return to template selection after a successful create and guard against accidental replacement of in-progress text.

## Files Expected To Change

- `lib/playbook/authoring-templates.ts` and tests
- `components/playbook/EntryEditor.tsx`
- This release summary

## Validation Plan

- Validate template keys, content types, and starter bodies through unit tests.
- Run focused Playbook tests, TypeScript, targeted ESLint, the full Jest suite, and `git diff --check`.
- Do not run `next build` while the owner’s development server may be active.

## Risks And Coordination Notes

- No schema or migration changes.
- No automatic publication or external write during implementation/testing.
- Existing dirty worktree changes belong to earlier Playbook releases and concurrent work and must be preserved.
