# Publish Sound Vault Custody Doctrine in The Playbook - Plan

## Objective

Publish the complete owner-approved Sound Vault Master Custody Doctrine in The
Playbook's Company-wide room so every authorized team member can use it as a durable
standards and practices reference.

## Scope

- Activate the existing Company-wide Playbook room.
- Seed a published overview plus one detailed SOP entry for each locked doctrine D-01
  through D-10.
- Make non-coming-soon database rooms navigable in The Playbook's secondary rail.
- Preserve existing room RBAC, publishing, draft and approval behavior.
- Add migration text-lock tests and document the human database-push checkpoint.

## Files Expected to Change

- `components/playbook/Rail2.tsx`
- `supabase/migrations/141_playbook_sound_vault_custody_doctrine.sql`
- `__tests__/migration-141.test.ts`
- `.planning/deliberations/sound-vault-master-custody.md`
- `.planning/quick/260901-publish-custody-doctrine-playbook/PLAN.md`
- `.planning/quick/260901-publish-custody-doctrine-playbook/SUMMARY.md`

## Validation Plan

- Confirm the Company-wide room becomes a live link while true coming-soon rooms remain inert.
- Confirm the migration publishes an overview and all ten doctrine entries.
- Confirm all operational staff roles retain Company-wide read access and leadership
  remains structurally authorized.
- Confirm the migration is safe to apply once and does not alter existing published entries.
- Run the migration test, relevant Playbook tests, TypeScript checking and `git diff --check`.

## Risks / Coordination Notes

- Migration 141 is human-gated and must not be pushed to production by the agent.
- The current Playbook entry renderer supports structured bullet lists, so the doctrine
  is published as an overview plus ten readable SOP cards rather than one unstructured wall of text.
- Existing unrelated worktree changes belong to the user and will not be modified.
