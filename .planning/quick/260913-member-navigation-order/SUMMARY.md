# Member navigation order — summary

## What changed

- Moved Collaborators to immediately beneath Contract Locker in the canonical Member navigation list.
- Moved Deals to immediately above Earnings.
- Kept the progressively disclosed Sync Library in the catalogue/rights portion of the menu, after Collaborators.
- Preserved all routes, icons, active-state matching, Split Sheets matching, Sync Library eligibility behavior, and expanded/collapsed rendering behavior.
- Left Team Member/admin and shared-workspace navigation unchanged.
- Added a regression assertion for both requested menu adjacencies.

## Validation

- `npx jest __tests__/one-identity-navigation.test.ts --runInBand`: 1 suite, 5 tests passed.
- `npm run typecheck:strict`: passed.
- `ESLINT_USE_FLAT_CONFIG=false npx eslint components/nav/ArtistNav.tsx __tests__/one-identity-navigation.test.ts --max-warnings=0`: passed; only the existing ESLint legacy-configuration deprecation notice was emitted.
- `git diff --check`: passed for all task files.

## Remaining follow-up

- No migration is required.
- The change must be committed and deployed before it appears on the production Member account.
