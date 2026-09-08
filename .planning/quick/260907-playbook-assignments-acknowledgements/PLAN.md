# Playbook Assignments & Acknowledgements — Release 5 Plan

**Status:** Complete locally — migration-gated, not committed
**Depends on:** Playbook rich documents and Governance Inbox

## Objective

Turn published Playbook doctrine into accountable internal learning without treating a reading acknowledgement as a signature, policy acceptance, or legal consent.

## Scope

- Add person and staff-role/team reading assignments with required revision, due date, assigner, and revocation state.
- Continue using the existing `required_reading` Gameplan link as the single authority for Gameplan assignments.
- Add a personal `/admin/playbook/learning` queue limited to rooms the signed-in Team Member may access.
- Add a self-only acknowledgement route with server-derived identity and revision.
- Add a room-lead/Leadership assignment route with independent room authorization and target validation.
- Add a room-lead/Leadership re-acknowledgement route that advances active assignments to the current published revision while retaining historical acknowledgements.
- Surface completion and overdue reading in the Governance Inbox.
- Add contextual assignment controls to governance entries and navigation for Team Members with a Playbook room.
- Extend the existing unnumbered Playbook draft migration only; do not create or apply a production migration.

## Expected files

- `.planning/quick/260907-playbook-rich-documents/DRAFT-MIGRATION.sql`
- `lib/playbook/assignments.ts` and tests
- `app/api/admin/playbook/assignments/route.ts` and tests
- `app/api/admin/playbook/assignments/[id]/acknowledge/route.ts` and tests
- `app/api/admin/playbook/entries/[id]/reacknowledgement/route.ts`
- `app/(admin)/admin/playbook/learning/page.tsx`
- `components/playbook/LearningQueue.tsx`
- `components/playbook/ReadingAssignmentForm.tsx`
- Governance page, model, inbox, layout, and Rail 2 integration

## Security and semantics

- Page and route guards are authority; navigation visibility is UX only.
- Resolve authorized room IDs before service-role content or assignment reads.
- Never accept the acknowledging user or acknowledged revision from the browser.
- Never let a room lead assign or roll forward reading outside rooms they lead and can access.
- Validate individual assignees as active Funūn staff and role targets against the closed staff-role enum.
- Preserve historical acknowledgements; completion means acknowledgement revision is at least the assignment's required revision.
- Copy must state that acknowledgement records reading only and is not a signature, agreement, approval, or legal consent.
- Do not touch Phase 38 workspace-authorization plans or migrations.
- Do not commit, push, apply migrations, or deploy.

## Verification

- Pure audience, completion, status, and scope tests.
- Route authorization and server-derived acknowledgement tests.
- Draft SQL contract tests.
- TypeScript, targeted ESLint, complete Jest suite, production build, and `git diff --check`.
- Manual GSD completion summary.
