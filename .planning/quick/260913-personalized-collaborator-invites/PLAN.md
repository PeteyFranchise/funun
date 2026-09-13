# Personalized collaborator invitation emails

## Objective

Identify the authenticated Funūn member who initiated a collaborator invitation in the email subject and body instead of describing every inviter as “An artist.”

## Scope

- Resolve the inviter from the authenticated member's `user_profiles` row inside the shared server-side invitation helper.
- Render the approved display-name and `@handle` treatment in roster invitations.
- Preserve Writer's Room context while identifying the inviter there as well.
- Fall back to “A Funūn member” when no public display identity is available.
- Keep all interpolated HTML escaped and keep profile lookup failure non-blocking for invitation delivery.

## Files expected to change

- `lib/collaborators/invite.ts`
- `lib/collaborators/invite.test.ts`
- `.planning/quick/260913-personalized-collaborator-invites/SUMMARY.md`

## Validation plan

- Run the collaborator invitation test suite.
- Run strict TypeScript checking.
- Run ESLint on the changed implementation and test files.

## Risks and coordination notes

- Do not accept an inviter name or handle from the browser; derive both from the authenticated inviter ID already established by each caller.
- Do not expose legal-name fields in invitation copy.
- Do not touch the existing organizational-doctrine working tree changes.
- No database migration is required.
