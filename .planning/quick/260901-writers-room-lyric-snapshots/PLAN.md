# Writer's Room Recoverable Lyric Snapshots

## Goal

Add a safe, section-level lyric history to the Writer's Room so collaborators can recover an earlier accepted version without turning live editing into keystroke surveillance or widening collaboration into rights, splits, contracts, or approved metadata.

## Scope

- Capture one immutable recovery point before the first meaningful text change in each section-editing session.
- List recovery points for a lyric section with the responsible writer and timestamp.
- Restore a selected recovery point only while holding that section's active soft lock.
- Preserve the displaced current text as another recovery point before restoring.
- Broadcast the restored lyric to collaborators and describe the restore in the song diary.
- Add focused database, API, UI, and formatter coverage.
- Update the repo report for Claude/GSD with shipped capability, rationale, user impact, verification, and activation steps.

## Assumptions

- Migration 144 is already applied and the section-lock system is the concurrency authority.
- A recovery point is created per accepted editing session, not for every debounced autosave or keystroke.
- Deleted-section recovery and whole-song rollback are later safety layers; this build restores text for an existing section.
- Production database migration remains a manual owner-operated step after the code is pushed.

## Verification

- Static migration contract tests cover append-only snapshots, one baseline per session, lock-gated restore, pre-restore preservation, and diary attribution.
- Component tests cover the history affordance and restore confirmation.
- Diary formatter tests cover restored-section language.
- TypeScript, targeted Jest suites, lint for touched source files, and the production build pass.
- Git diff and status are reviewed so only task files are staged.
