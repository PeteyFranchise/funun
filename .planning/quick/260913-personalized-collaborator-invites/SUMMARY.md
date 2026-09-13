# Personalized collaborator invitation emails — summary

## What changed

- Collaborator invitation subjects now identify the authenticated inviter by their Funūn display name.
- Roster invitation bodies render the approved form: `Peter Zora (@peterzora) added you as a collaborator on Funūn.`
- The platform description now reads: `Funūn is a shared workspace where you can write together, keep credits and metadata accurate, organize masters, and find new opportunities for your music.`
- Writer's Room invitations preserve their room-specific wording while identifying the inviter in both the subject and body.
- Inviter identity is loaded server-side from `user_profiles` using the already-authenticated inviter ID. It cannot be supplied by the browser.
- Missing or unavailable profile identity falls back to the role-neutral phrase `A Funūn member`.
- Inviter names and handles are normalized to one line for email-header safety, and all HTML interpolation remains escaped.

## Validation

- `npx jest lib/collaborators/invite.test.ts --runInBand`: 1 suite, 19 tests passed.
- `npm run typecheck:strict`: passed.
- `ESLINT_USE_FLAT_CONFIG=false npx eslint lib/collaborators/invite.ts lib/collaborators/invite.test.ts --max-warnings=0`: passed; only ESLint's existing legacy-configuration deprecation notice was emitted.

## Remaining follow-up

- The approved Funūn-member search and `Add to roster` experience is a separate product build. Existing exact-email reconciliation remains in place, but the Collaborators screen does not yet expose People Search.
- No migration or environment change is required for this email-copy release.
