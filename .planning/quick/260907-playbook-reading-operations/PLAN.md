# Playbook Reading Operations — Release 6 Plan

**Status:** Complete locally; migration remains human-gated and unapplied
**Depends on:** Playbook Assignments & Acknowledgements (Release 5)

## Objective

Give Leadership and authorized room leads the controls and visibility needed to operate assigned Playbook reading without notification spam, destructive history edits, or cross-room data exposure.

## Scope

- Notify the intended Team Member audience when reading is first assigned or moved to a newly required revision.
- Add idempotent due-soon and overdue reminder delivery with a service-only ledger and daily cron.
- Add a detailed governance roster showing each intended reader, assignment source, required revision, acknowledgement state, and due state.
- Allow authorized room leads and Leadership to edit due date and required/recommended status.
- Allow authorized room leads and Leadership to revoke active assignments without deleting acknowledgement history.
- Support bulk person assignment from the Governance Inbox; existing role assignment remains the preferred whole-team operation.
- Add reminder cadence controls that prevent repeated notices for the same assignment, user, revision, and reminder kind.
- Add a CSV completion-history export for authorized governance users.
- Keep Gameplan-required reading in the existing Gameplan-link authority.

## Expected files

- `.planning/quick/260907-playbook-rich-documents/DRAFT-MIGRATION.sql`
- `lib/playbook/assignments.ts` and tests
- `lib/playbook/reading-notifications.ts` and tests
- Reading assignment create/update/revoke routes and tests
- Reading operations export route
- Daily reading-reminder cron route and `vercel.json`
- Governance server page and UI components
- Notification catalog and notification panel icon support

## Security and operational rules

- Every read/write/export resolves staff and room authority before service-role assignment access.
- Leadership governs every room; non-leadership users govern only led rooms they can access.
- Revocation is soft and preserves acknowledgements and audit history.
- Reminder claims are atomic and unique per assignment, user, required revision, and reminder kind.
- Role audiences are expanded from the current authoritative staff-role display copy at operation time; recipients must have room access.
- CSV values are formula-injection neutralized.
- Acknowledgement remains a reading record, never consent, signature, agreement, or policy acceptance.
- Do not touch Phase 38 workspace-authorization plans or migrations.
- Do not commit, push, migrate, or deploy.

## Verification

- Pure roster, reminder, CSV, and assignment-transition tests.
- Route authorization tests and draft SQL contract tests.
- TypeScript, targeted ESLint, complete Jest suite, production build, and `git diff --check`.
- Manual GSD completion summary.
