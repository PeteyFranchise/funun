# Pre-Delivery Revocation Doctrine - Plan

## Objective

Record the owner's approval of pre-delivery revocation as the eighth permanent Sound
Vault custody doctrine and add an implementation-ready execution plan.

## Scope

- Lock Item 8 without altering D-01 through D-07.
- Define delivery commit points and accurate before/during/after-transmission outcomes.
- Define who may revoke, valid reasons, contract/payment limits and notifications.
- Require atomic authorization/credential issuance and short-lived child credentials.
- Add roadmap and TODO records while leaving Items 9 and 10 open.

## Files Expected to Change

- `.planning/ROADMAP.md`
- `.planning/deliberations/sound-vault-master-custody.md`
- `.planning/todos/pending/2026-09-01-pre-delivery-revocation.md`
- `.planning/quick/260901-pre-delivery-revocation/PLAN.md`
- `.planning/quick/260901-pre-delivery-revocation/SUMMARY.md`

## Validation Plan

- Confirm D-08 is owner-approved and Item 9 remains open.
- Confirm revocation is not represented as deletion, contract cancellation or file recall.
- Confirm executed obligations can limit or deny revocation.
- Confirm race-safe checks occur before child credential issuance.
- Confirm completed deliveries and evidence remain preserved.
- Run `git diff --check` on all changed planning files.

## Risks / Coordination Notes

- Direct signed URLs cannot guarantee immediate interruption after issuance; clean-master
  delivery may require a controlled endpoint and minute-scale child credentials.
- Counsel must define which contractual obligations limit revocation.
- Existing unrelated worktree changes belong to the user and will not be modified.
