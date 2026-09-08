# Playbook Governance Inbox — Release 4 Plan

**Status:** Complete locally — migration-gated, not committed
**Depends on:** Playbook rich documents, connected knowledge, diagrams and reminders

## Objective

Give Leadership and Playbook room leads one cross-room operating queue for pending drafts, overdue reviews, ownership gaps, retired entries and publication-readiness issues.

## Scope

- Add `/admin/playbook/governance` with an independent server-side staff and room-authority guard.
- Leadership sees all rooms; room leads see only rooms they lead.
- Load governance metadata with the service role only after authorized room IDs are resolved.
- Classify entries into actionable queues without duplicating mutation authority.
- Link each queue item to the existing room editor or published article.
- Add search, room and issue filters plus concise portfolio totals.
- Add a Rail 2 entry only for users with governance scope.
- Keep approve, reject, lifecycle and metadata writes in their existing independently guarded routes.

## Expected files

- `app/(admin)/admin/playbook/governance/page.tsx`
- `components/playbook/GovernanceInbox.tsx`
- `lib/playbook/governance.ts` and tests
- `app/(admin)/admin/playbook/layout.tsx`
- `components/playbook/Rail2.tsx`

## Coordination and security

- Do not touch Phase 38 workspace-authorization plans or migrations.
- Recheck the shared tree before edits.
- Do not expose draft bodies in the dashboard; show metadata and link to the authorized room editor.
- Do not treat navigation visibility as authority.
- Do not commit, push, migrate or deploy.

## Verification

- Pure classification and scope tests.
- TypeScript, targeted ESLint and complete Jest suite.
- Production build and `git diff --check`.
- Manual GSD completion summary.
