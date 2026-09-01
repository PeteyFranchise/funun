# Writer's Room existing-collaborator linking repair — summary

## Root cause

The problem was not user error. The Writer's Room exposed only a manual
name/email invitation form even though its endpoint supported roster IDs.
Production was also missing `collaborators.archived_at`; the endpoint queried
that column, ignored the database error, concluded that no match existed, and
created a new unclaimed collaborator. Finally, the endpoint sent an invitation
for every collaborator, including rows already linked to Funūn users.

Production inspection confirmed both affected people had:

- one older confirmed collaborator row linked to their Funūn account;
- one newly-created pending duplicate;
- a pending `work_members` row for “Justified Noise” pointing to the duplicate
  instead of their user account.

## Changes completed

- Added a My Roster path to “Add a collaborator” in the Writer's Room.
- The picker identifies claimed rows as Funūn members and excludes people
  already attached to the song.
- Selecting a roster person submits `collaborator_id`; manual name/email is now
  clearly the fallback for someone genuinely new.
- Claimed collaborators receive direct room access through `claimed_by` and no
  signup email.
- Unclaimed collaborators continue through the existing invite flow.
- Invitation delivery now happens only after membership insertion succeeds.
- Roster lookup errors return an error instead of silently creating duplicates.
- Duplicate membership attempts return a clear conflict response.
- Migration 148:
  - restores `archived_at` and `is_favorite` defensively;
  - repoints matching pending memberships to the canonical claimed roster row
    and verified user;
  - expires obsolete signup invitations;
  - archives duplicate roster rows without deleting audit history;
  - preserves the separation between room membership and split ownership.

## User effect

After migration 148 is applied, `@justifiednoise` and `@shanemaux` will cease
to appear as pending on “Justified Noise.” Their existing accounts will hold
the room memberships directly, so the song becomes accessible to them without
creating another account or accepting another invite.

For future songs, Peter can choose them from My Roster. Existing Funūn members
are added immediately; only people who have not joined Funūn receive an email.

## Verification

- Focused Jest suites: 23 tests passing.
- ESLint on changed TypeScript/TSX files: passing.
- `npm run typecheck`: passing.
- `git diff --check`: passing.

## Deployment checkpoint

Application changes require the normal commit/deploy flow. Migration 148 is
human-gated and must be applied with `npm run db:push` after review. It is the
step that repairs the two existing production memberships.
