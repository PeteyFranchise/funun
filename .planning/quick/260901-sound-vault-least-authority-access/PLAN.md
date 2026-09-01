# Sound Vault Least-Authority Access Doctrine - Plan

## Objective

Record the owner's approval of detailed, action-specific access permissions as the
fourth permanent Sound Vault custody doctrine.

## Scope

- Lock Item 4 without altering D-01 through D-03.
- Separate record custody, creative collaboration, rights participation, project
  management, recipient access and staff operations.
- Define sensitive actions that require distinct authority.
- Record deny-by-default, server/database enforcement, audit and break-glass rules.
- Update the roadmap while leaving Item 5 and later topics open.

## Files Expected to Change

- `.planning/ROADMAP.md`
- `.planning/deliberations/sound-vault-master-custody.md`
- `.planning/quick/260901-sound-vault-least-authority-access/PLAN.md`
- `.planning/quick/260901-sound-vault-least-authority-access/SUMMARY.md`

## Validation Plan

- Confirm D-04 is owner-approved and Item 5 remains open.
- Confirm record custody is not equated with legal ownership.
- Confirm creative, legal, metadata and master-delivery permissions remain separate.
- Confirm sensitive authorization is enforced server-side and at the database boundary.
- Run `git diff --check` on all changed planning files.

## Risks / Coordination Notes

- The final permission matrix must be reconciled with existing RLS, collaboration,
  contract, deal and delivery systems before implementation.
- Legal authority cannot be inferred solely from a product role or account relationship.
- Existing unrelated worktree changes belong to the user and will not be modified.
