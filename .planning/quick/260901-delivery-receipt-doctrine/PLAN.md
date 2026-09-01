# Delivery Receipt Doctrine - Plan

## Objective

Record the owner's approval of delivery receipts as the seventh permanent Sound Vault
custody doctrine and add an implementation-ready execution plan.

## Scope

- Lock Item 7 without altering D-01 through D-06.
- Separate the pre-dispatch manifest from the final outcome receipt.
- Define receipt states, content, acknowledgment and correction/supersession behavior.
- Place one immutable receipt across Contract Locker, deals, provenance and Song Passport.
- Add partner/DDEX acknowledgment boundaries, implementation stages and a pilot.
- Update the roadmap while leaving Item 8 and later topics open.

## Files Expected to Change

- `.planning/ROADMAP.md`
- `.planning/deliberations/sound-vault-master-custody.md`
- `.planning/todos/pending/2026-09-01-immutable-delivery-receipts.md`
- `.planning/quick/260901-delivery-receipt-doctrine/PLAN.md`
- `.planning/quick/260901-delivery-receipt-doctrine/SUMMARY.md`

## Validation Plan

- Confirm D-07 is owner-approved and Item 8 remains open.
- Confirm transmitted and recipient/partner-acknowledged states remain distinct.
- Confirm corrections create successor receipts rather than editing history.
- Confirm a Funūn receipt is not represented as notarization, registration, DDEX
  certification or proof of external acceptance.
- Run `git diff --check` on all changed planning files.

## Risks / Coordination Notes

- Receipt language and evidentiary framing require counsel review before launch.
- External acknowledgments depend on actual partner protocols and cannot be inferred.
- Existing unrelated worktree changes belong to the user and will not be modified.
