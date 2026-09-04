# Wall author identity display summary

## What changed

- Wall author loading now selects the Member's public `handle` alongside artist name, avatar, and public role data.
- Attribution follows the existing Funūn profile identity rule:
  - artist name + `@handle` when both exist;
  - linked `@handle` once when the optional artist name is blank;
  - `Member` only for historical/deleted identities with neither public field.
- The displayed author identity links directly to `/u/{handle}`.
- Wall-post notifications use the same artist-name-or-handle fallback, preventing the recipient's notification from calling a handle-only poster `Member`.
- No legal-name or other private profile field is read or exposed.

## Validation run

- Focused wall and block-enforcement Jest: 3 suites, 29 tests passed.
- Full Jest: 439 suites, 4,138 tests passed.
- TypeScript: passed.
- ESLint: passed with zero warnings.
- Next.js production build: passed (122 static pages generated).
- `git diff --check`: passed.
- React best-practices review: the identity link is one keyboard focus target, rendering adds no state/effect, and no new client data request or bundle-heavy dependency was introduced.

## Remaining risks or follow-ups

- The fix must be committed and deployed before the existing production wall post changes appearance. Wall attribution is resolved live, so the already-posted message will correct itself after deployment; no data migration is required.
- Peter's current navigation label indicates that the optional public artist name may be blank. In that case the post will correctly show linked `@peterzora`; adding a public artist name in Profile Settings will make future and existing posts show both the name and handle automatically.
