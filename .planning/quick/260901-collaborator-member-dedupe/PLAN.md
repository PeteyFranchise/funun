# Collaborator member dedupe and recognition

## Problem

Inviting an email that already belongs to a claimed Funūn collaborator can create another unclaimed roster row and send a second signup invitation. Previously archived repair rows also remain visible because some roster queries and client rendering include archived collaborators.

## Scope

- Return active collaborators only from the Collaborators page and roster API.
- Remove an archived card from client state immediately.
- Reuse an active collaborator row by normalized email in both collaborator creation paths.
- Recognize `claimed_by` as the verified Funūn-member signal and skip signup invitations for claimed collaborators.
- Give the inviter clear member-aware confirmation copy.
- Cover the member-reuse, lookup-error, and archived-filter paths with tests.

## Assumptions

- `collaborators.claimed_by` remains the only trusted signal that a roster identity is linked to a Funūn account.
- Migration 148 has already archived the known Shane and Stephan duplicate rows in production.
- This repair must preserve the canonical claimed rows and must not merge collaborators by name alone.

## Verification

- Run focused collaborator route tests.
- Run TypeScript type checking.
- Run the full test suite and lint if focused checks pass.
- Confirm no changed query returns archived collaborator cards in the active roster.
