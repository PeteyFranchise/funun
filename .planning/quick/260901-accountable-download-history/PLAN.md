# Accountable Download History - Plan

## Objective

Record the owner's approval of accountable download history as the sixth permanent
Sound Vault custody doctrine and add an implementation-ready execution plan.

## Scope

- Lock Item 6 without altering D-01 through D-05.
- Define technically honest transmission states and range/retry session handling.
- Bind downloads to assets, grants, recipients, deals and authority snapshots.
- Define artist-facing history, restricted security context, alerts and retention gates.
- Add roadmap and TODO records while leaving Item 7 and later topics open.

## Files Expected to Change

- `.planning/ROADMAP.md`
- `.planning/deliberations/sound-vault-master-custody.md`
- `.planning/todos/pending/2026-09-01-accountable-download-history.md`
- `.planning/quick/260901-accountable-download-history/PLAN.md`
- `.planning/quick/260901-accountable-download-history/SUMMARY.md`

## Validation Plan

- Confirm D-06 is owner-approved and Item 7 remains open.
- Confirm a server transmission is not represented as proof that a human saved or used a file.
- Confirm range requests and technical retries do not create misleading duplicate records.
- Confirm privacy and surveillance limits are explicit.
- Confirm alerts trigger review rather than automatic accusation or enforcement.
- Run `git diff --check` on all changed planning files.

## Risks / Coordination Notes

- Storage/CDN observability may not provide reliable byte-completion signals without a
  controlled download endpoint or provider event support.
- Retention, IP handling and recipient disclosure require privacy/counsel review.
- Existing unrelated worktree changes belong to the user and will not be modified.
