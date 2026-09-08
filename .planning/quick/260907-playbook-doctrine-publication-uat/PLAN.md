# Playbook Doctrine Publication & UAT — Release 7 Plan

**Status:** Complete locally; migration promotion and production UAT remain human-gated

## Objective

Turn the completed rich-Playbook feature set into a safe, reviewable production handoff: reconcile the additive schema after Phase 38, prepare the next migration without applying it, and give authorized Playbook governors a doctrine publication readiness queue with deterministic room mapping, collision/supersession checks, and UAT guidance.

## Scope

- Reconcile the rich-document draft against authored migrations through 198 and the live roadmap reservation ledger.
- Materialize the reviewed schema as candidate migrations 201–202 outside the active migration chain; promote them only after Phase 38.2 migrations 199–200 land and the owner approves the sequence.
- Represent every approved doctrine publication target in a typed manifest.
- Validate missing rooms, subgroups, duplicate targets, source collisions, existing-entry collisions, reviewers, Gameplan connections, and supersession intent.
- Add a Leadership/room-lead publication-readiness view that exposes metadata only and never publishes in bulk.
- Provide desktop/mobile, ordinary-reader, room-lead, Leadership, hostile-content, and access-denial UAT checklists.
- Keep adoption and publication as explicit existing workflow actions.

## Expected files

- `.planning/quick/260907-playbook-doctrine-publication-uat/201_playbook_rich_documents.sql`
- `.planning/quick/260907-playbook-doctrine-publication-uat/202_playbook_reading_operations.sql`
- `.planning/deliberations/organizational-doctrine/playbook-publication-map.md`
- `lib/playbook/publication-manifest.ts` and tests
- `app/(admin)/admin/playbook/publication/page.tsx`
- `components/playbook/PublicationReadinessQueue.tsx`
- Playbook navigation and roadmap/handoff documentation

## Verification

- Migration reconciliation and schema-contract tests.
- Manifest collision, mapping, supersession, and readiness tests.
- TypeScript, targeted ESLint, full Jest, production build, and `git diff --check`.

## Coordination and safety

- Do not edit Phase 38 migrations or plans.
- Do not apply migrations, publish doctrines, commit, push, or deploy.
- Preserve all concurrent worktree changes.
- Read room authorization before service-role data access.
- Never expose draft doctrine bodies in the cross-room readiness queue.
