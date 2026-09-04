# Wall author identity display

## Objective

Replace the generic `Member` attribution on profile-wall posts with the posting Member's actual public identity: artist/display name when present and their `@handle`.

## Scope

- Resolve wall authors from `user_profiles.artist_name`, `handle`, `avatar_url`, and public roles.
- Follow the existing profile identity rule: artist name is primary when present; otherwise the `@handle` is primary and is never duplicated.
- Render the handle as a profile link when available.
- Ensure both server-loaded posts and posts visible after refresh use the same attribution.
- Keep legal names and private profile fields out of wall rendering.

## Files expected to change

- `lib/social/wall.ts`
- `components/profile/Wall.tsx`
- Focused wall identity tests

## Validation plan

- Add focused tests for named and handle-only authors.
- Run wall/block-enforcement tests, TypeScript, lint, full Jest, production build, and `git diff --check`.

## Risks and coordination notes

- Existing uncommitted sign-out and collaborator reconciliation work remains in the same worktree and must be preserved.
- A private legal name must never be used as a public fallback.
- Missing profiles still need a safe generic fallback because historical/deleted-account posts may remain.
