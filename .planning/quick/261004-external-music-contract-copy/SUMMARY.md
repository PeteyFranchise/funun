# External-Music Contract Copy Clarification — Summary

## What changed

- Replaced ambiguous standalone wording with `Not linked to existing Funūn music`.
- Added direct explanatory copy stating that the agreement is not connected to any song, recording or release already uploaded or created in the user's Sound Vault or elsewhere in Funūn.
- Added creation choices for existing Funūn music, music not currently in Funūn, and non-song-specific agreements.
- Added a likely-match check across accessible Funūn works, recordings, tracks and releases.
- Kept the match prompt non-blocking while prohibiting automatic title-based merges.
- Clarified that an unlinked agreement does not affect Passport evidence, Vault readiness, Sync Library admission, The Crate visibility or legal authority.

## Validation run

- Confirmed the final copy explicitly names Sound Vault and elsewhere in Funūn.
- Confirmed the unlinked state is visible in Contract Locker.
- Confirmed a later link preserves the original contract snapshot and executed artifact.
- `git diff --check` passed for the task paths.

## Coordination note

Claude was concurrently working. This task modified only Codex's standalone decision record and added uniquely named quick-task files.

## Workflow note

Native `/gsd-quick` invocation was unavailable in this Codex session, so the AGENTS.md manual quick-task fallback was used.

