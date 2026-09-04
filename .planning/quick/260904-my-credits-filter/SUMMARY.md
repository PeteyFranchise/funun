# My Credits relationship filter summary

## Root cause

- “My Credits” queried every collaborator identity row claimed by the signed-in Member.
- The UI then rendered the collaborator name even when that identity had no split-sheet party, making three identity links look like song credits.
- Production inspection confirmed all three displayed rows have zero split-sheet relationships.

## What changed

- The server query now requires an actual `split_sheet_parties` relationship with an inner join.
- The UI independently flattens and renders only split-sheet parties, so a bare claimed identity cannot appear as a credit if the query regresses.
- The three underlying production identity links were preserved because they may still be valid roster links belonging to the accounts that created them.

## Validation

- Focused Jest: 4 suites, 25 tests passed.
- Full Jest: 443 suites, 4,159 tests passed.
- TypeScript: passed.
- ESLint: passed with zero warnings.
- Next.js production build: passed (122 static pages generated).
- `git diff --check`: passed.

## Deployment note

- No database migration is required.
- The fix is local until committed and deployed.
