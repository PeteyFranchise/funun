# My Credits relationship filter

## Objective

Ensure the Collaborators room's “My Credits” tab shows actual song-credit relationships, never bare collaborator identity rows that merely claimed the signed-in Member's email.

## Scope

- Require a visible `split_sheet_parties` relationship in the server query.
- Flatten only real split-sheet parties in the client UI.
- Treat a claimed identity with zero parties as the existing “No credits yet” state.
- Preserve the underlying claimed collaborator rows because they may still be useful roster/identity links for the accounts that created them.

## Files expected to change

- `app/(artist)/collaborators/page.tsx`
- `components/collaborators/CollaboratorRoster.tsx`
- `components/collaborators/CollaboratorRoster.test.tsx`

## Validation plan

- Prove three claimed identities with zero parties render no credit cards.
- Prove a real split-sheet party renders its song, role, percentage, and link.
- Assert the server query uses an inner relationship join.
- Run focused Jest, TypeScript, ESLint, full Jest, production build, and `git diff --check`.

## Risks and coordination notes

- Do not delete the three production identity rows; no evidence shows they are invalid identity links, only that they were incorrectly displayed as credits.
- Preserve and validate the uncommitted Member API boundary repair from the immediately preceding task.
