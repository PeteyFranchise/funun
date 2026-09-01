# Writer's Room Label

## Objective

Rename the unreleased-song page subtitle from "the composer room" to "The Writer's Room," and record the future direction for simultaneous multi-writer collaboration.

## Scope

- Change only the user-facing subtitle on the `/vault/works/[workId]` page.
- Add the future collaborative Writer's Room to the project TODO and Phase 37 roadmap.
- Leave historical planning artifacts and internal implementation descriptions unchanged.

## Files Expected to Change

- `app/(artist)/vault/works/[workId]/page.tsx`
- `docs/STATUS.md`
- `.planning/ROADMAP.md`

## Validation Plan

- Search production source for the old user-facing subtitle.
- Confirm both planning surfaces describe simultaneous collaboration as future scope.
- Run the relevant TypeScript/lint validation available for the edited page.

## Risks / Coordination Notes

- Copy and documentation changes only; no data, routing, or behavior changes.
- Existing unrelated worktree changes will be preserved.
