# Sound Vault Custody Doctrine - Plan

## Objective

Record the owner's approval of private master storage as a permanent Sound Vault
custody doctrine while leaving the remaining custody topics open for item-by-item
discussion.

## Scope

- Add a durable deliberation record for the Sound Vault master-custody doctrine.
- Lock only the approved private-storage decision and its acceptance criteria.
- Add the doctrine to the near-term roadmap without implying that every control is
  already implemented.
- Preserve the distinction between preview access and clean-master delivery.

## Files Expected to Change

- `.planning/ROADMAP.md`
- `.planning/deliberations/sound-vault-master-custody.md`
- `.planning/quick/260901-sound-vault-custody-doctrine/PLAN.md`
- `.planning/quick/260901-sound-vault-custody-doctrine/SUMMARY.md`

## Validation Plan

- Confirm private master storage is marked owner-approved and permanent.
- Confirm the document does not promise that authorized downloads can be recalled.
- Confirm previews are permanently prohibited from exposing clean masters.
- Confirm the remaining custody items are explicitly undecided.
- Run `git diff --check` on the changed planning files.

## Risks / Coordination Notes

- Existing private buckets and watermarked-preview work are foundations, not proof
  that the complete custody doctrine is implemented end to end.
- The worktree contains unrelated user changes; they will not be modified.
