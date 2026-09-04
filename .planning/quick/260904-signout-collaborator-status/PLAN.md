# Sign-out polish and collaborator status reconciliation

## Objective

Bring the member sidebar sign-out action into Funūn's navigation design and repair roster identities, such as Eric's, that remain marked as invited after the matching person has already created a Funūn account.

## Scope

- Restyle the shared sign-out control as an accessible navigation action, including the collapsed member-sidebar state without disrupting admin or handle-gate uses.
- Close the collaborator identity lifecycle gap for existing members who are added to a roster after their account's one-time signup claim already ran.
- Backfill safe, normalized-email matches for existing production rows and keep future collaborator inserts/verified email changes linked automatically.
- Preserve `collaborators.claimed_by` as the only UI membership signal; never infer member status in the browser or from a display name.
- Add focused regression coverage for the shared sign-out control and database migration contract where practical.

## Files expected to change

- `components/auth/SignOutButton.tsx`
- `components/nav/ArtistNav.tsx`
- Existing sign-out tests or a focused new test
- `supabase/migrations/179_existing_member_collaborator_reconciliation.sql`
- Focused migration contract test if the repository's test conventions support it

## Validation plan

- Run focused sign-out and collaborator/migration tests.
- Run TypeScript checking and ESLint.
- Run `git diff --check` and inspect the final worktree.
- Record the human-gated migration command; do not push the migration from the agent.

## Risks and coordination notes

- Linking must use only a normalized email from the stored collaborator row and a confirmed Supabase Auth identity; client-supplied user IDs remain forbidden.
- The migration is additive and idempotent, but its production application remains a human checkpoint.
- The backfill intentionally repairs already-stale rows and will activate existing `claimed_by` lifecycle triggers, including invitation acceptance and project/work membership reconciliation.
