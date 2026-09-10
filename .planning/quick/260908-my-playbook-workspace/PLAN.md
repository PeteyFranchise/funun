# Release 13 — My Playbook Personal Workspace

## Objective

Give every Funūn Team Member one personal Playbook home for resuming writing and finding the reading, review, and recently published material relevant to them.

## Scope

- Add a user-facing “My Playbook” destination to the Playbook secondary navigation.
- Discover valid browser-local recovery records only for the signed-in account and rooms it can currently access.
- Show Funūn-saved drafts authored by the viewer, incomplete reading assignments, entries they own that need review, and recently published entries in accessible rooms.
- Link actions back to existing room, article, Required Reading, and Governance Inbox surfaces.
- Keep server reads metadata-only where document bodies are unnecessary.
- Preserve every existing room authorization and avoid creating a second approval workflow.

## Files Expected To Change

- `app/(admin)/admin/playbook/my/page.tsx`
- `components/playbook/MyPlaybookWorkspace.tsx`
- `components/playbook/Rail2.tsx`
- `lib/playbook/my-workspace.ts` and focused tests
- `lib/playbook/draft-recovery.ts` and focused tests for safe discovery keys
- This release summary

## Validation Plan

- Test personal workspace classification and access-safe local recovery key parsing.
- Run focused Playbook tests, TypeScript, targeted ESLint, the full Jest suite, and `git diff --check`.
- Do not run migrations, production writes, or deployment commands.

## Risks And Coordination Notes

- The page may use the service client only after a staff gate and must explicitly constrain every entry query to currently accessible room IDs.
- Local recovery content must never be rendered for another account or a room the viewer can no longer access.
- No schema or migration changes.
- Existing dirty worktree changes belong to earlier releases and concurrent work and must be preserved.
