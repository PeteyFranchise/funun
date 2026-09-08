# Playbook Rich Documents — Release 1 Plan

**Status:** Complete locally — awaiting concurrent-work reconciliation and owner-gated migration adoption
**Parent doctrine:** `.planning/deliberations/organizational-doctrine/playbook-rich-content-model-build-plan.md`

## Scope

- Add the `document` content type without breaking SOPs or CRM Topics.
- Add strict content validation and cross-room subgroup protection.
- Add revision-safe drafting and approval foundations.
- Render database-authored Markdown safely as a full article.
- Add document drafting and preview to the Playbook editor.
- Prepare schema SQL without claiming or applying a migration number.

## Out of scope for Release 1

- Mermaid rendering.
- Automated repository adoption.
- Full-text search.
- Review reminders.
- Production publication of the doctrine package.

## Concurrent-work constraints

- Do not commit or push before reconciling Claude's work.
- Do not apply a migration or deploy.
- Keep schema SQL outside `supabase/migrations` until migration numbering is reconciled.
- Recheck changed files immediately before every edit.

Claude reserved migration numbers 201–202 for this work in `.planning/ROADMAP.md` while implementation was underway. The SQL remains a draft until the working trees are reconciled; reservation is not authorization to apply it.

## Verification

- Focused unit tests for content schemas and state transitions.
- Existing Gameplan topic tests.
- TypeScript typecheck.
- Lint for changed application files.
- Production build if concurrent work leaves the tree buildable.
- `git diff --check` and explicit handoff inventory.
