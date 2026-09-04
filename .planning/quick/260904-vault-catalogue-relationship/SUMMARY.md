# Vault catalogue relationship regression — summary

## What changed

- Qualified the Vault catalogue's one-to-many `work_versions` embed with
  `work_versions_work_id_fkey`, while aliasing it back to the existing
  `work_versions` response property.
- Propagated owned-work, work-membership, and member-work query errors into
  the Vault's existing error state instead of rendering a false empty state.
- Added a regression test covering both the relationship qualifier and the
  error propagation contract.
- No database migration or user-data mutation was required.

## Validation run

- Corrected production embed, read-only: 2 rows returned (`Justified Noise`
  and `Fractured Heart`).
- Focused Jest: 1 suite, 2 tests passed.
- Strict TypeScript: passed.
- ESLint with zero warnings: passed.
- Full Jest: 425 suites, 4,079 tests passed.
- Next.js production build: passed; 122 static pages generated and `/vault`
  compiled as a dynamic route.

## Remaining risks or follow-ups

- None known for this regression. If another reverse foreign key is added to
  an embedded relationship later, its PostgREST embed should also be
  constraint-qualified.
