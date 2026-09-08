# Playbook Reading Operations — Release 6 Summary

## Completed locally

- Added bulk person and whole-role reading assignment controls.
- Added immediate assignment notifications and notices when a published revision becomes newly required.
- Added a service-only reminder ledger and cron contract for one due-soon and one overdue reminder per person, assignment and revision.
- Added detailed per-reader governance state with assignment source, required/acknowledged revisions and due date.
- Added authorized edits to due date and required/recommended state.
- Added soft revocation that retains acknowledgement and audit history.
- Added room-scoped CSV export with spreadsheet-formula neutralization.
- Kept Connected Gameplans authoritative for Gameplan-required reading.

## Security boundaries

- Assignment management and export require Leadership or the applicable room lead.
- Room authorization occurs before service-role reads.
- Browser roles receive no direct access to reading assignment, acknowledgement or reminder tables.
- Acknowledgement is explicitly reading history, not consent, signature, agreement or approval.
- The reminder operation is service-only, bounded and idempotent.

## Verification

- Focused reading and draft-schema tests passed.
- Full Jest suite passed: 528 suites / 6,223 tests.
- TypeScript and targeted ESLint passed.
- Next.js production build passed with 133 generated static pages and the new management, export and reminder routes included.
- `git diff --check` passed.

## Deployment state

- No migration was created in `supabase/migrations/` or applied.
- The additive schema remains in `.planning/quick/260907-playbook-rich-documents/DRAFT-MIGRATION.sql` under its human gate.
- No commit, push or deployment was performed.
