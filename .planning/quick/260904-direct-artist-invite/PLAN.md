# Direct artist invite

## Objective

Let any authorized Funūn Team Member invite one artist directly from the Artist Invites room, without requiring that artist to join the waitlist first.

## Scope

- Add a compact one-person invite form with artist name and email above the waitlist.
- Reuse the existing staff-gated `POST /api/admin/artist-invites` token and email flow.
- Show distinct sent, already-invited, and email-delivery-failure results.
- Return the active invite link to the authorized Team Member so delivery failures can be handled without minting another invite.
- Keep the leadership-only waitlist broadcast separate and unchanged.

## Files expected to change

- `components/admin/ArtistInvitesAdmin.tsx`
- `components/admin/ArtistInvitesAdmin.test.tsx`
- `app/api/admin/artist-invites/route.ts`
- `app/api/admin/artist-invites/route.test.ts`

## Validation plan

- Verify the direct invite form renders for all Team Members.
- Verify a normalized email and optional artist name are posted to the existing endpoint.
- Verify created, duplicate, delivery-failure, invalid-input, and unauthorized route behavior.
- Run focused Jest tests, TypeScript, ESLint, the full Jest suite, the production build, and `git diff --check`.

## Risks and coordination notes

- Preserve all existing uncommitted work in the shared worktree.
- Do not alter the signup gate, waitlist conversion, or leadership broadcast authorization.
- Do not add a migration; `artist_invites` already supports this flow.
