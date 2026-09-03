# Writer's Room Vocal Plan — Summary

## Completed

- Replaced the guest-name-only picker with a two-path vocal-plan experience: name one or more performers, or describe an uncast voice.
- Added candidates from the signed-in artist, current Writer's Room members, and the signed-in artist's global My Roster, plus a name-only performer option.
- Preserved multiple performers for duet/group plans and made an existing vocal plan editable or removable.
- Added `lyric_blocks.vocal_direction` as a separate nullable, 160-character creative-direction field.
- Rendered vocal direction on the lyric section without representing it as a person/avatar.
- Kept every choice isolated from Writer's Room membership, invitations, writing credit, ownership, and split sheets.
- Reused the existing work-authorized block PATCH route; no new access path or external service was added.

## Verification

- Focused Jest: 6 suites, 35 tests passed.
- TypeScript: `npm run typecheck` passed.
- Full ESLint: `npm run lint` passed with zero warnings.
- Full Jest: 374 suites, 3,867 tests passed.
- React review: the roster read stays parallel with the existing server load; interactive state remains local to the picker; native controls, dialog labeling, tabs, and error announcements are present.
- `git diff --check` passed.
- Production build intentionally not run because the owner may have a live dev server sharing `.next`.

## Production State

- Migration `159_lyric_block_vocal_direction.sql` was applied successfully on 2026-09-02.
- The application code can be pushed without a schema-ordering gap.
