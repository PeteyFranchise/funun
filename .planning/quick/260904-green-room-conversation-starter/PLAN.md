# Green Room conversation-starter card

## Objective

Replace the internal-facing “Monetization runway” sidebar card with useful Member guidance that helps someone make a specific Green Room post.

## Scope

- Use the approved “Put something in the room” title and concise participation guidance.
- Include three concrete prompt examples: what the Member is making, needs, or can offer.
- Add a “Start a post” action that scrolls to and focuses the existing composer.
- Preserve the current Green Room layout, composer behavior, and account access rules.

## Files expected to change

- `components/green-room/GreenRoomFeed.tsx`
- `components/green-room/GreenRoomComposer.tsx`
- Focused Green Room UI tests

## Validation plan

- Verify the internal monetization copy is absent and the new copy/CTA are present.
- Verify the CTA target and composer focus target share a stable identifier.
- Run focused tests, TypeScript, ESLint, full Jest, production build, and `git diff --check`.

## Risks and coordination notes

- Preserve the existing uncommitted sign-out, collaborator reconciliation, and wall-identity fixes.
- The guidance must remain optional and should never interrupt browsing or posting.
