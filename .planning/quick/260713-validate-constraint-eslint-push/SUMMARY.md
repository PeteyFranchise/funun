# Quick Summary: Validate Document Guard + ESLint CLI + Push

Date: 2026-07-13

## Completed

- Added migration `049_validate_document_status_evidence_guard.sql` to validate the previously `NOT VALID` document evidence constraint.
- Replaced the interactive `next lint` script with an ESLint CLI command.
- Added a minimal Next.js ESLint config and ignore file.
- Disabled `react/no-unescaped-entities` to avoid unrelated product-copy churn while preserving the rest of the Next core web vitals lint rules.

## Verification

- `npm run lint`
- `npm test -- --runInBand`
- `npx tsc --noEmit`
- `npm run db:push`

## Notes

- `npm run db:push` applied migration 049 successfully.
- Direct `pg_constraint` read-back was not available because the database does not expose a general `exec_sql` RPC, and adding one only for introspection would be an unnecessary security footgun.
