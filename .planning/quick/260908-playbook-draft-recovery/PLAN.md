# Release 12 — Playbook Draft Recovery & Autosave

## Objective

Protect unfinished native Playbook writing from refreshes, browser crashes, timeouts, and accidental navigation without adding automatic server writes or changing publication behavior.

## Scope

- Save unfinished authoring state to browser-local storage after a short debounce.
- Namespace recovery by authenticated team member, Playbook room, and entry/new-entry scope.
- Retain recovery records for seven days and reject malformed, oversized, expired, or future-dated records.
- Offer explicit Restore and Discard actions with the local save timestamp.
- Clear recovery only after a successful server save or an explicit discard/start-fresh choice.
- Display local-save status and surface unavailable browser storage without blocking ordinary authoring.
- Cover both new entries and edits to existing entries.

## Files Expected To Change

- `lib/playbook/draft-recovery.ts` and focused tests
- `components/playbook/usePlaybookDraftRecovery.ts`
- `components/playbook/DraftRecoveryNotice.tsx`
- `components/playbook/EntryEditor.tsx`
- `app/(admin)/admin/playbook/[room]/page.tsx`
- This release summary

## Validation Plan

- Test recovery-key isolation, serialization, expiry, malformed input, size limits, and removal.
- Run focused Playbook tests, TypeScript, targeted ESLint, the full Jest suite, and `git diff --check`.
- Do not run migrations, production writes, or deployment commands.

## Risks And Coordination Notes

- Browser-local copies can contain internal doctrine; retention is limited to seven days and records are account-scoped.
- Local recovery is convenience protection, not the database source of truth and not evidence of publication.
- Existing dirty worktree changes belong to earlier releases and concurrent work and must be preserved.
