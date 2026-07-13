# Quick Summary: Vault Document Cleanup Check + Opportunity Slot Race

Date: 2026-07-13

## Completed

- Ran a live read-only Supabase check for legacy `vault_documents` rows that would fail the new evidence constraint.
- Found 2 legacy rows without required evidence:
  - `af6a6ed3-4849-4e3e-8c0a-3f4e527a0209` (`split_sheet`, `signed`, no file/e-sign evidence)
  - `ea323cf4-ca25-415a-9639-7543b53daf6b` (`copyright_registration`, `verified`, no file/verification evidence)
- Downgraded both legacy rows to `pending` after the cleanup decision, clearing earned-state timestamps and verification fields because neither row had signed PDF, e-sign completion, or verification evidence.
- Added `apply_to_opportunity_atomic()` to serialize Antenna applications on the opportunity row.
- Updated the Antenna apply route to use the atomic RPC for slot reservation, match application, and submission creation.
- Split RPC privilege changes into one-command migrations so the Supabase CLI can apply them.
- Added focused route tests for the atomic apply behavior.

## Verification

- `npm run db:push`
- Remote RPC smoke check with dummy UUIDs returned `project_not_found`.
- Live cleanup update verified both legacy rows are now `pending`.
- Broader live read-back checked all signed/verified document rows and found no remaining evidence-rule offenders.
- `npm test -- --runInBand __tests__/antenna-apply-atomic.test.ts`
- `npm test -- --runInBand`
- `npx tsc --noEmit`
- `npm run lint` did not execute non-interactively because `next lint` prompted for initial ESLint configuration.
